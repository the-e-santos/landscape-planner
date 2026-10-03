import { test } from 'vitest'
import { CPU_VISIBILITY_BATCH_EXECUTOR } from '../src/solar/batchedVisibility'
import {
  compareVisibilityWorkloadWithReference,
  createVisibilityBenchmarkWorkload,
  measureVisibilityWorkload,
  type VisibilityBenchmarkScenarioId,
  type VisibilityBenchmarkTierId,
} from '../src/solar/visibilityBenchmark'

const cases: readonly [
  VisibilityBenchmarkScenarioId,
  VisibilityBenchmarkTierId,
][] = [
  ['small-suburban', 'preview'],
  ['quarter-acre', 'interactive'],
  ['one-acre-stress', 'refined'],
  ['dense-canopies', 'analysis'],
  ['many-small-objects', 'refined'],
  ['few-large-objects', 'refined'],
]

for (const [scenarioId, tierId] of cases) {
  test(`${scenarioId} / ${tierId}`, async ({ bench }) => {
    const workload = createVisibilityBenchmarkWorkload(scenarioId, tierId)
    const result = await bench(
      `${workload.entities.length} primitives / ${workload.rayCount} rays`,
      async () => {
        await measureVisibilityWorkload(
          workload,
          CPU_VISIBILITY_BATCH_EXECUTOR,
        )
      },
    ).run({ iterations: 10, time: 0 })
    const disagreement = await compareVisibilityWorkloadWithReference(
      workload,
      CPU_VISIBILITY_BATCH_EXECUTOR,
      256,
    )
    console.info('VISIBILITY_BENCHMARK', JSON.stringify({
      solverVersion: workload.solverVersion,
      scenarioId,
      tierId,
      backend: 'cpu',
      primitiveCount: workload.entities.length,
      bvhNodeCount: workload.scene.bvhNodes.length / 4,
      rayCount: workload.rayCount,
      spacingMeters: workload.tier.spacingMeters,
      sceneBufferBytes: workload.sceneBufferBytes,
      rayBufferBytes: workload.rayBufferBytes,
      latencyMilliseconds: {
        mean: result.latency.mean,
        min: result.latency.min,
        max: result.latency.max,
        rme: result.latency.rme,
      },
      raysPerSecond: workload.rayCount / result.latency.mean * 1_000,
      disagreement,
      environment: {
        runtime: process.version,
        platform: process.platform,
        architecture: process.arch,
      },
    }))
  })
}
