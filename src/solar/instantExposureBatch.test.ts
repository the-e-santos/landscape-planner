import { describe, expect, it, vi } from 'vitest'
import { createDefaultProject } from '../domain/project'
import {
  CPU_VISIBILITY_BATCH_EXECUTOR,
  type VisibilityBatchExecutor,
} from './batchedVisibility'
import { prepareSurfaceExposure } from './exposureSettings'
import { evaluateInstantExposureBatch } from './instantExposureBatch'
import type { SurfacePoint } from './pointSolar'
import { DEFAULT_SYNTHETIC_CLIMATE } from './syntheticClimate'

const settings = {
  enabled: true,
  analysisMode: 'instant',
  climateParameters: DEFAULT_SYNTHETIC_CLIMATE,
  skyCondition: 'clear',
  solarPosition: {
    date: { year: 2024, month: 6, day: 20 },
    latitudeRadians: 0.5,
    localSolarTimeHours: 12,
  },
  spacingMeters: 1,
  displayChannel: 'total',
} as const

const surfaces: readonly SurfacePoint[] = [
  {
    eastMeters: 0,
    elevationMeters: 0,
    northMeters: 0,
    normal: { east: 0, up: 1, north: 0 },
  },
  {
    eastMeters: 4,
    elevationMeters: 1,
    northMeters: -2,
    normal: { east: 1, up: 0, north: 0 },
  },
  {
    eastMeters: -4,
    elevationMeters: 2.2,
    northMeters: 0,
    normal: { east: 0, up: 1, north: 0 },
    owningEntityId: 'primitive.house',
  },
]

describe('instantaneous batched exposure', () => {
  it('matches direct and diffuse CPU reference channels', async () => {
    const project = createDefaultProject()
    const reference = prepareSurfaceExposure(project, settings)
    const result = await evaluateInstantExposureBatch(
      project,
      settings,
      surfaces,
      CPU_VISIBILITY_BATCH_EXECUTOR,
      17,
    )

    expect(result.backend).toBe('cpu')
    expect(result.rayCount).toBeGreaterThan(17)
    result.values.forEach((value, index) => {
      const expected = reference.evaluate(surfaces[index])
      expect(value.direct).toBeCloseTo(expected.direct, 4)
      expect(value.diffuse).toBeCloseTo(expected.diffuse, 4)
      expect(value.total).toBeCloseTo(expected.total, 4)
    })
  })

  it('bounds executor calls by the configured ray limit', async () => {
    const execute = vi.fn(CPU_VISIBILITY_BATCH_EXECUTOR.execute)
    const executor: VisibilityBatchExecutor = { backend: 'cpu', execute }
    const result = await evaluateInstantExposureBatch(
      createDefaultProject(),
      settings,
      surfaces,
      executor,
      5,
    )

    expect(execute).toHaveBeenCalledTimes(Math.ceil(result.rayCount / 5))
    execute.mock.calls.forEach(([, batch]) => {
      expect(batch.excludedPrimitiveIndices.length).toBeLessThanOrEqual(5)
    })
  })

  it('rejects an invalid batch limit', async () => {
    await expect(evaluateInstantExposureBatch(
      createDefaultProject(),
      settings,
      surfaces,
      CPU_VISIBILITY_BATCH_EXECUTOR,
      0,
    )).rejects.toThrow('positive integer')
  })
})
