import { describe, expect, it } from 'vitest'
import { CPU_VISIBILITY_BATCH_EXECUTOR } from './batchedVisibility'
import {
  compareVisibilityWorkloadWithReference,
  createVisibilityBenchmarkWorkload,
  measureVisibilityWorkload,
  VISIBILITY_BENCHMARK_SCENARIOS,
  VISIBILITY_BENCHMARK_TIERS,
} from './visibilityBenchmark'

describe('visibility benchmark workloads', () => {
  it('defines deterministic representative scenes and quality tiers', () => {
    const first = createVisibilityBenchmarkWorkload(
      'small-suburban',
      'preview',
    )
    const second = createVisibilityBenchmarkWorkload(
      'small-suburban',
      'preview',
    )

    expect(first.entities).toEqual(second.entities)
    expect(first.scene).toEqual(second.scene)
    expect(first.batch).toEqual(second.batch)
    expect(first.rayCount).toBe(32 * 32)
    expect(new Set(VISIBILITY_BENCHMARK_SCENARIOS.map(({ id }) => id)).size)
      .toBe(VISIBILITY_BENCHMARK_SCENARIOS.length)
    expect(VISIBILITY_BENCHMARK_TIERS.map(({ directionCount }) => directionCount))
      .toEqual([32, 128, 512, 1_024])
  })

  it('records reproducible workload and execution metadata', async () => {
    const workload = createVisibilityBenchmarkWorkload(
      'small-suburban',
      'preview',
    )
    const times = [10, 14]
    const measurement = await measureVisibilityWorkload(
      workload,
      CPU_VISIBILITY_BATCH_EXECUTOR,
      { runtime: 'test' },
      () => times.shift()!,
    )

    expect(measurement).toMatchObject({
      solverVersion: 'visibility-bvh.v1',
      scenarioId: 'small-suburban',
      tierId: 'preview',
      backend: 'cpu',
      primitiveCount: 24,
      rayCount: 1_024,
      elapsedMilliseconds: 4,
      raysPerSecond: 256_000,
      environment: { runtime: 'test' },
    })
    expect(measurement.bvhNodeCount).toBeGreaterThan(0)
    expect(measurement.sceneBufferBytes).toBeGreaterThan(0)
    expect(measurement.rayBufferBytes).toBeGreaterThan(0)
  })

  it('compares packed traversal with the independent domain reference', async () => {
    const comparison = await compareVisibilityWorkloadWithReference(
      createVisibilityBenchmarkWorkload('small-suburban', 'preview'),
      CPU_VISIBILITY_BATCH_EXECUTOR,
      256,
    )

    expect(comparison.comparedRayCount).toBe(256)
    expect(comparison.transmissionMismatchCount).toBe(0)
    expect(comparison.blockerMismatchCount).toBe(0)
    expect(comparison.maximumTransmissionDifference).toBeLessThanOrEqual(1e-5)
  })
})
