import type { LandscapeProject } from '../domain/project'
import type { PrimitiveEntity } from '../domain/primitive'
import {
  packVisibilityRayBatch,
  type VisibilityBatchExecutor,
  type VisibilityRayRequest,
} from './batchedVisibility'
import {
  prepareSurfaceExposure,
  type ExposureValues,
  type PreparedSurfaceExposure,
  type SolarHeatmapSettings,
} from './exposureSettings'
import { packGpuSceneGeometry } from './gpuScene'
import type { SurfacePoint } from './pointSolar'

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

export interface SurfaceExposureBatchResult {
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

export async function evaluatePreparedExposureBatch(
  project: LandscapeProject,
  prepared: PreparedSurfaceExposure,
  surfaces: readonly SurfacePoint[],
  executor: VisibilityBatchExecutor,
  maximumRaysPerBatch = DEFAULT_VISIBILITY_BATCH_RAY_LIMIT,
): Promise<SurfaceExposureBatchResult> {
  if (!Number.isInteger(maximumRaysPerBatch) || maximumRaysPerBatch <= 0) {
    throw new Error('Visibility batch ray limit must be a positive integer')
  }
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
    for (const weighted of prepared.visibilityDirections) {
      const direction = {
        x: weighted.direction.east,
        y: weighted.direction.up,
        z: -weighted.direction.north,
      }
      const incidence = Math.max(
        0,
        normal.x * direction.x +
          normal.y * direction.y +
          normal.z * direction.z,
      )
      if (incidence === 0 || weighted.weight === 0) continue
      if (addRay({
        ray: { origin, direction },
        ...(surface.owningEntityId
          ? { excludedEntityId: surface.owningEntityId }
          : {}),
      }, {
        surfaceIndex,
        channel: weighted.channel,
        unoccludedValue: weighted.weight * incidence,
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

export function evaluateInstantExposureBatch(
  project: LandscapeProject,
  settings: InstantSettings,
  surfaces: readonly SurfacePoint[],
  executor: VisibilityBatchExecutor,
  maximumRaysPerBatch = DEFAULT_VISIBILITY_BATCH_RAY_LIMIT,
): Promise<SurfaceExposureBatchResult> {
  return evaluatePreparedExposureBatch(
    project,
    prepareSurfaceExposure(project, settings),
    surfaces,
    executor,
    maximumRaysPerBatch,
  )
}
