import { describe, expect, it } from 'vitest'
import { createRectangleVertices } from '../domain/parcel'
import { createDefaultProject, getTerrainEntity } from '../domain/project'
import { DEFAULT_TERRAIN_ID } from '../domain/terrain'
import {
  computeExposureWorkerRequest,
  computeExposureWorkerRequestAsync,
} from './exposureWorker'
import type { ExposureWorkerRequest } from './exposureWorker'
import { CPU_VISIBILITY_BATCH_EXECUTOR } from './batchedVisibility'
import { DEFAULT_SYNTHETIC_CLIMATE } from './syntheticClimate'
import type { VisibilityBackendRuntime } from './visibilityBackend'

function webGpuLikeRuntime(): VisibilityBackendRuntime {
  return {
    selection: {
      backend: 'webgpu',
      capability: { available: true, reason: 'test device' },
      fellBackToCpu: false,
    },
    executor: {
      backend: 'webgpu',
      execute: async (scene, batch) => ({
        ...await CPU_VISIBILITY_BATCH_EXECUTOR.execute(scene, batch),
        backend: 'webgpu',
      }),
    },
  }
}

describe('exposure worker computation', () => {
  it('returns cloneable progressive layer data and metadata', async () => {
    const project = createDefaultProject()
    const request: ExposureWorkerRequest = {
      revision: 7,
      project,
      parcel: {
        vertices: createRectangleVertices(4, 4),
        uncertaintyMeters: 0,
      },
      terrains: [getTerrainEntity(project, DEFAULT_TERRAIN_ID)],
      primitives: project.entities.filter(
        (entity) => entity.kind === 'primitive',
      ),
      settings: {
        enabled: true,
        analysisMode: 'accumulated',
        climateParameters: DEFAULT_SYNTHETIC_CLIMATE,
        period: {
          startDate: { year: 2024, month: 6, day: 20 },
          endDate: { year: 2024, month: 6, day: 20 },
          latitudeRadians: 0.5,
          timeStepMinutes: 120,
          overcastProbabilityCurve: [
            { localSolarTimeHours: 0, probability: 0.25 },
            { localSolarTimeHours: 24, probability: 0.25 },
          ],
        },
        maximumDirections: 12,
        spacingMeters: 2,
        displayChannel: 'direct',
      },
      invalidateAll: true,
      changedBounds: [],
      cachedTiles: [],
      previousTerrainLayers: [],
      previousPrimitiveLayers: [],
    }
    const response = computeExposureWorkerRequest(request)

    expect(response.ok).toBe(true)
    if (!response.ok) return
    expect(response.revision).toBe(7)
    expect(response.unit).toBe('kWh/m²')
    expect(response.directionCount).toBeLessThanOrEqual(12 + 145)
    expect(response.surfaceSampleCount).toBeGreaterThan(0)
    expect(response.evaluatedSurfaceSampleCount).toBe(
      response.surfaceSampleCount,
    )
    expect(response.exposureTiles.length).toBeGreaterThan(0)
    expect(() => structuredClone(response)).not.toThrow()

    const accelerated = await computeExposureWorkerRequestAsync(
      request,
      webGpuLikeRuntime(),
    )
    expect(accelerated.ok).toBe(true)
    if (accelerated.ok) {
      expect(accelerated.computeBackend).toBe('webgpu')
      const expected = response.terrainLayers[0][1].vertices[0].exposure
      const actual = accelerated.terrainLayers[0][1].vertices[0].exposure
      expect(actual.direct).toBeCloseTo(expected.direct, 5)
      expect(actual.diffuse).toBeCloseTo(expected.diffuse, 5)
      expect(actual.total).toBeCloseTo(expected.total, 5)
    }

    const unavailable = await computeExposureWorkerRequestAsync(
      { ...request, computePreference: 'webgpu' },
      {
        executor: CPU_VISIBILITY_BATCH_EXECUTOR,
        selection: {
          backend: 'cpu',
          capability: { available: false, reason: 'test adapter unavailable' },
          fellBackToCpu: true,
        },
      },
    )
    expect(unavailable).toMatchObject({
      ok: true,
      computeBackend: 'cpu',
      fallbackReason: 'test adapter unavailable',
    })

    const reused = computeExposureWorkerRequest({
      ...request,
      revision: 8,
      invalidateAll: false,
      cachedTiles: response.exposureTiles,
      previousTerrainLayers: response.terrainLayers,
      previousPrimitiveLayers: response.primitiveLayers,
    })
    expect(reused.ok).toBe(true)
    if (reused.ok) {
      expect(reused.evaluatedSurfaceSampleCount).toBe(0)
      expect(reused.surfaceSampleCount).toBe(response.surfaceSampleCount)
      expect(reused.dirtyTileCount).toBe(0)
    }
  })

  it('routes instantaneous surface exposure through the batch executor', async () => {
    const project = createDefaultProject()
    const request: ExposureWorkerRequest = {
      revision: 9,
      project,
      parcel: {
        vertices: createRectangleVertices(4, 4),
        uncertaintyMeters: 0,
      },
      terrains: [getTerrainEntity(project, DEFAULT_TERRAIN_ID)],
      primitives: project.entities.filter(
        (entity) => entity.kind === 'primitive',
      ),
      settings: {
        enabled: true,
        analysisMode: 'instant',
        climateParameters: DEFAULT_SYNTHETIC_CLIMATE,
        skyCondition: 'clear',
        solarPosition: {
          date: { year: 2024, month: 6, day: 20 },
          latitudeRadians: 0.5,
          localSolarTimeHours: 12,
        },
        spacingMeters: 2,
        displayChannel: 'total',
      },
      invalidateAll: true,
      changedBounds: [],
      cachedTiles: [],
      previousTerrainLayers: [],
      previousPrimitiveLayers: [],
    }
    const reference = computeExposureWorkerRequest(request)
    const accelerated = await computeExposureWorkerRequestAsync(
      request,
      webGpuLikeRuntime(),
    )

    expect(reference.ok).toBe(true)
    expect(accelerated.ok).toBe(true)
    if (!reference.ok || !accelerated.ok) return
    expect(reference.computeBackend).toBe('cpu')
    expect(accelerated.computeBackend).toBe('webgpu')
    const referenceValues = [
      ...reference.terrainLayers.flatMap(([, layer]) =>
        layer.vertices.map(({ exposure }) => exposure)
      ),
      ...reference.primitiveLayers.flatMap(([, layer]) =>
        layer.vertices.map(({ exposure }) => exposure)
      ),
    ]
    const acceleratedValues = [
      ...accelerated.terrainLayers.flatMap(([, layer]) =>
        layer.vertices.map(({ exposure }) => exposure)
      ),
      ...accelerated.primitiveLayers.flatMap(([, layer]) =>
        layer.vertices.map(({ exposure }) => exposure)
      ),
    ]
    expect(acceleratedValues).toHaveLength(referenceValues.length)
    acceleratedValues.forEach((value, index) => {
      expect(value.direct).toBeCloseTo(referenceValues[index].direct, 4)
      expect(value.diffuse).toBeCloseTo(referenceValues[index].diffuse, 4)
      expect(value.total).toBeCloseTo(referenceValues[index].total, 4)
    })
  })
})
