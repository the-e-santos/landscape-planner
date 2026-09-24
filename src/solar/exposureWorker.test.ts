import { describe, expect, it } from 'vitest'
import { createRectangleVertices } from '../domain/parcel'
import { createDefaultProject, getTerrainEntity } from '../domain/project'
import { DEFAULT_TERRAIN_ID } from '../domain/terrain'
import { computeExposureWorkerRequest } from './exposureWorker'
import type { ExposureWorkerRequest } from './exposureWorker'
import { DEFAULT_SYNTHETIC_CLIMATE } from './syntheticClimate'

describe('exposure worker computation', () => {
  it('returns cloneable progressive layer data and metadata', () => {
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
})
