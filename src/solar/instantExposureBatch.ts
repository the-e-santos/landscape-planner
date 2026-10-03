import type { LandscapeProject } from '../domain/project'
import type { PrimitiveEntity } from '../domain/primitive'
import {
  packVisibilityRayBatch,
  type VisibilityBatchExecutor,
  type VisibilityRayRequest,
} from './batchedVisibility'
import type { ExposureValues, SolarHeatmapSettings } from './exposureSettings'
import { packGpuSceneGeometry } from './gpuScene'
import type { SurfacePoint } from './pointSolar'
import { calculateSolarPosition } from './solarPosition'
import { TREGENZA_SKY_PATCHES } from './skyPatches'
import { createSyntheticClimateModel } from './syntheticClimate'

type InstantSettings = Extract<
  SolarHeatmapSettings,
  { readonly enabled: true; readonly analysisMode: 'instant' }
>

interface MutableExposureValues {
  direct: number
  diffuse: number
  total: number
}

interface RayContribution {
  readonly surfaceIndex: number
  readonly channel: 'direct' | 'diffuse'
  readonly unoccludedValue: number
}

export interface InstantExposureBatchResult {
  readonly values: readonly ExposureValues[]
  readonly backend: 'cpu' | 'webgpu'
  readonly fallbackReason?: string
  readonly rayCount: number
}

export const DEFAULT_VISIBILITY_BATCH_RAY_LIMIT = 65_536

function normalizedSurfaceNormal(surface: SurfacePoint): {
  readonly x: number
  readonly y: number
  readonly z: number
} {
  const length = Math.hypot(
    surface.normal.east,
    surface.normal.up,
    surface.normal.north,
  )
  if (!Number.isFinite(length) || length === 0) {
    throw new Error('Surface normal must have a finite, nonzero length')
  }
  return {
    x: surface.normal.east / length,
    y: surface.normal.up / length,
    z: -surface.normal.north / length,
  }
}

export async function evaluateInstantExposureBatch(
  project: LandscapeProject,
  settings: InstantSettings,
  surfaces: readonly SurfacePoint[],
  executor: VisibilityBatchExecutor,
  maximumRaysPerBatch = DEFAULT_VISIBILITY_BATCH_RAY_LIMIT,
): Promise<InstantExposureBatchResult> {
  if (!Number.isInteger(maximumRaysPerBatch) || maximumRaysPerBatch <= 0) {
    throw new Error('Visibility batch ray limit must be a positive integer')
  }
  const climate = createSyntheticClimateModel(settings.climateParameters)
  const solarPosition = calculateSolarPosition(settings.solarPosition)
  const instant = {
    ...settings.solarPosition,
    skyCondition: settings.skyCondition,
  }
  const dni = climate.getDirectNormalIrradiance(instant)
  const rotation = project.coordinates.northRotationRadians
  const cosRotation = Math.cos(rotation)
  const sinRotation = Math.sin(rotation)
  const cosAltitude = Math.cos(solarPosition.altitudeRadians)
  const relativeAzimuth = solarPosition.azimuthRadians - rotation
  const directDirection = {
    x: Math.sin(relativeAzimuth) * cosAltitude,
    y: Math.sin(solarPosition.altitudeRadians),
    z: -Math.cos(relativeAzimuth) * cosAltitude,
  }
  const diffuseDirections = TREGENZA_SKY_PATCHES.map((patch) => ({
    direction: {
      x: patch.direction.east * cosRotation -
        patch.direction.north * sinRotation,
      y: patch.direction.up,
      z: -(patch.direction.east * sinRotation +
        patch.direction.north * cosRotation),
    },
    weight: climate.getSkyRadiance(instant, patch) *
      patch.solidAngleSteradians,
  }))
  const primitives = project.entities.filter(
    (entity): entity is PrimitiveEntity => entity.kind === 'primitive',
  )
  const scene = packGpuSceneGeometry(primitives)
  const values: MutableExposureValues[] = surfaces.map(() => ({
    direct: 0,
    diffuse: 0,
    total: 0,
  }))
  let requests: VisibilityRayRequest[] = []
  let contributions: RayContribution[] = []
  let backend = executor.backend
  let fallbackReason: string | undefined
  let rayCount = 0

  const flush = async () => {
    if (requests.length === 0) return
    const result = await executor.execute(
      scene,
      packVisibilityRayBatch(scene, requests),
    )
    backend = result.backend
    fallbackReason ??= result.fallbackReason
    contributions.forEach((contribution, index) => {
      values[contribution.surfaceIndex][contribution.channel] +=
        contribution.unoccludedValue * result.transmissions[index]
    })
    rayCount += requests.length
    requests = []
    contributions = []
  }
  const addRay = (
    request: VisibilityRayRequest,
    contribution: RayContribution,
  ): boolean => {
    requests.push(request)
    contributions.push(contribution)
    return requests.length === maximumRaysPerBatch
  }

  for (let surfaceIndex = 0; surfaceIndex < surfaces.length; surfaceIndex += 1) {
    const surface = surfaces[surfaceIndex]
    const normal = normalizedSurfaceNormal(surface)
    const origin = {
      x: surface.eastMeters,
      y: surface.elevationMeters,
      z: -surface.northMeters,
    }
    if (solarPosition.aboveHorizon && dni > 0) {
      const incidence = Math.max(
        0,
        normal.x * directDirection.x +
          normal.y * directDirection.y +
          normal.z * directDirection.z,
      )
      if (incidence > 0) {
        if (addRay({
          ray: { origin, direction: directDirection },
          ...(surface.owningEntityId
            ? { excludedEntityId: surface.owningEntityId }
            : {}),
        }, {
          surfaceIndex,
          channel: 'direct',
          unoccludedValue: dni * incidence,
        })) await flush()
      }
    }
    for (const { direction, weight } of diffuseDirections) {
      const incidence = Math.max(
        0,
        normal.x * direction.x + normal.y * direction.y + normal.z * direction.z,
      )
      if (incidence === 0 || weight === 0) continue
      if (addRay({
        ray: { origin, direction },
        ...(surface.owningEntityId
          ? { excludedEntityId: surface.owningEntityId }
          : {}),
      }, {
        surfaceIndex,
        channel: 'diffuse',
        unoccludedValue: weight * incidence,
      })) await flush()
    }
  }
  await flush()
  values.forEach((value) => { value.total = value.direct + value.diffuse })
  return {
    values,
    backend,
    ...(fallbackReason ? { fallbackReason } : {}),
    rayCount,
  }
}
