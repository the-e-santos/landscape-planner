import type { ParcelGeometry } from '../domain/parcel'
import type { LandscapeProject } from '../domain/project'
import type { PrimitiveEntity } from '../domain/primitive'
import type { TerrainEntity } from '../domain/terrain'
import {
  generatePrimitiveExposureLayer,
  primitiveLocalPositionToWorld,
  type PrimitiveExposureLayer,
} from './primitiveExposure'
import {
  generateTerrainExposureLayer,
  type TerrainExposureLayer,
} from './terrainExposure'
import {
  prepareSurfaceExposure,
  type SolarHeatmapSettings,
} from './exposureSettings'
import {
  conservativelyInvalidatedTileIds,
  createExposureTiles,
  exposureTileIdAt,
  type Bounds3,
  type ExposureTile,
} from './tileInvalidation'

type EnabledSettings = Extract<SolarHeatmapSettings, { readonly enabled: true }>

export interface ExposureWorkerRequest {
  readonly revision: number
  readonly project: LandscapeProject
  readonly parcel?: ParcelGeometry
  readonly terrains: readonly TerrainEntity[]
  readonly primitives: readonly PrimitiveEntity[]
  readonly settings: EnabledSettings
  readonly invalidateAll: boolean
  readonly changedBounds: readonly Bounds3[]
  readonly cachedTiles: readonly ExposureTile[]
  readonly previousTerrainLayers: readonly (readonly [string, TerrainExposureLayer])[]
  readonly previousPrimitiveLayers: readonly (readonly [string, PrimitiveExposureLayer])[]
}

export type ExposureWorkerResponse =
  | {
      readonly ok: true
      readonly revision: number
      readonly terrainLayers: readonly (readonly [string, TerrainExposureLayer])[]
      readonly primitiveLayers: readonly (readonly [string, PrimitiveExposureLayer])[]
      readonly exposureTiles: readonly ExposureTile[]
      readonly surfaceSampleCount: number
      readonly evaluatedSurfaceSampleCount: number
      readonly dirtyTileCount: number
      readonly directionCount: number
      readonly temporalSampleCount: number
      readonly unit: 'W/m²' | 'kWh/m²'
      readonly scaleMaximum: number
    }
  | {
      readonly ok: false
      readonly revision: number
      readonly message: string
    }

const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<ExposureWorkerRequest>) => void) | null
  postMessage(message: ExposureWorkerResponse): void
}

export function computeExposureWorkerRequest(
  data: ExposureWorkerRequest,
): ExposureWorkerResponse {
  try {
    const prepared = prepareSurfaceExposure(data.project, data.settings)
    const dirtyTileIds = data.invalidateAll || data.cachedTiles.length === 0
      ? null
      : conservativelyInvalidatedTileIds(
          data.cachedTiles,
          data.changedBounds,
          prepared.illuminationDirections,
        )
    const previousTerrain = new Map(data.previousTerrainLayers)
    const previousPrimitives = new Map(data.previousPrimitiveLayers)
    const cachedTileIds = new Set(data.cachedTiles.map(({ id }) => id))
    const shouldEvaluatePoint = (point: {
      readonly eastMeters: number
      readonly northMeters: number
    }) => {
      if (!dirtyTileIds) return true
      const tileId = exposureTileIdAt(point)
      return !cachedTileIds.has(tileId) || dirtyTileIds.has(tileId)
    }
    const terrainLayers: Array<readonly [string, TerrainExposureLayer]> = []
    const primitiveLayers: Array<readonly [string, PrimitiveExposureLayer]> = []
    const exposurePoints: Array<{
      eastMeters: number
      elevationMeters: number
      northMeters: number
    }> = []
    let surfaceSampleCount = 0
    let evaluatedSurfaceSampleCount = 0

    data.terrains.forEach((terrain) => {
      const previousLayer = previousTerrain.get(terrain.id)
      const layer = generateTerrainExposureLayer(
        data.project,
        terrain,
        data.parcel,
        data.settings,
        prepared,
        dirtyTileIds && previousLayer
          ? {
              previousLayer,
              shouldEvaluate: shouldEvaluatePoint,
            }
          : undefined,
      )
      terrainLayers.push([terrain.id, layer])
      surfaceSampleCount += layer.vertices.length
      evaluatedSurfaceSampleCount += layer.evaluatedSampleCount
      exposurePoints.push(...layer.vertices.map((vertex) => ({
        eastMeters: vertex.eastMeters,
        elevationMeters: vertex.elevationMeters,
        northMeters: vertex.northMeters,
      })))
    })
    data.primitives.forEach((entity) => {
      const previousLayer = previousPrimitives.get(entity.id)
      const layer = generatePrimitiveExposureLayer(
        data.project,
        entity,
        data.settings,
        prepared,
        dirtyTileIds && previousLayer
          ? {
              previousLayer,
              shouldEvaluate: shouldEvaluatePoint,
            }
          : undefined,
      )
      primitiveLayers.push([entity.id, layer])
      surfaceSampleCount += layer.vertices.length
      evaluatedSurfaceSampleCount += layer.evaluatedSampleCount
      exposurePoints.push(...layer.vertices.map(({ position }) =>
        primitiveLocalPositionToWorld(entity, position)
      ))
    })
    const exposureTiles = createExposureTiles(exposurePoints)
    const dirtyTileCount = data.invalidateAll || data.cachedTiles.length === 0
      ? exposureTiles.length
      : dirtyTileIds!.size
    return {
      ok: true,
      revision: data.revision,
      terrainLayers,
      primitiveLayers,
      exposureTiles,
      surfaceSampleCount,
      evaluatedSurfaceSampleCount,
      dirtyTileCount,
      directionCount: prepared.directionCount,
      temporalSampleCount: prepared.temporalSampleCount,
      unit: prepared.unit,
      scaleMaximum: prepared.scaleMaximum,
    }
  } catch (error) {
    return {
      ok: false,
      revision: data.revision,
      message: error instanceof Error
        ? error.message
        : 'Exposure calculation failed.',
    }
  }
}

if (typeof workerScope.postMessage === 'function') {
  workerScope.onmessage = ({ data }) => {
    workerScope.postMessage(computeExposureWorkerRequest(data))
  }
}
