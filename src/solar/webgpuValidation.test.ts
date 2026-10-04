import { describe, expect, it } from 'vitest'
import { CPU_VISIBILITY_BATCH_EXECUTOR } from './batchedVisibility'
import type { VisibilityBackendRuntime } from './visibilityBackend'
import { runWebGpuValidation } from './webgpuValidation'

function gpuRuntime(mutateTransmission = false): VisibilityBackendRuntime {
  let executionCount = 0
  return {
    selection: {
      backend: 'webgpu',
      capability: { available: true, reason: 'test adapter' },
      fellBackToCpu: false,
    },
    adapterInfo: {
      vendor: 'test',
      architecture: 'deterministic',
      isFallbackAdapter: true,
    },
    executor: {
      backend: 'webgpu',
      execute: async (scene, batch) => {
        const cpu = await CPU_VISIBILITY_BATCH_EXECUTOR.execute(scene, batch)
        executionCount += 1
        const transmissions = cpu.transmissions.slice()
        if (mutateTransmission && executionCount === 1) {
          transmissions[0] += 0.25
        }
        return { ...cpu, backend: 'webgpu', transmissions }
      },
    },
  }
}

describe('browser WebGPU validation', () => {
  it('passes deterministic visibility and accumulated exposure comparisons', async () => {
    let tick = 0
    const report = await runWebGpuValidation({
      createRuntime: async () => gpuRuntime(),
      now: () => tick++,
      createdAt: () => '2026-10-03T12:00:00.000Z',
      userAgent: 'test-browser',
      platform: 'test-platform',
    })

    expect(report.status).toBe('pass')
    expect(report.cases).toHaveLength(4)
    expect(report.summary).toEqual({ passed: 4, failed: 0, skipped: 0 })
    expect(report.adapter).toMatchObject({ vendor: 'test' })
    expect(report.cases.every(({ completedBackend }) =>
      completedBackend === 'webgpu'
    )).toBe(true)
    const accumulated = report.cases.at(-1)
    expect(accumulated?.kind).toBe('accumulated-direct-diffuse')
    if (accumulated?.kind === 'accumulated-direct-diffuse') {
      expect(accumulated.rayCount).toBeGreaterThan(0)
      expect(accumulated.maximumDirectDifference).toBe(0)
      expect(accumulated.maximumDiffuseDifference).toBe(0)
    }
  })

  it('fails the report when a WebGPU result disagrees', async () => {
    const report = await runWebGpuValidation({
      createRuntime: async () => gpuRuntime(true),
      createdAt: () => '2026-10-03T12:00:00.000Z',
      userAgent: 'test-browser',
      platform: 'test-platform',
    })

    expect(report.status).toBe('fail')
    expect(report.summary.failed).toBe(1)
    expect(report.cases[0]).toMatchObject({
      kind: 'visibility',
      status: 'fail',
      transmissionMismatchCount: 1,
    })
  })

  it('skips cleanly when no WebGPU adapter is available', async () => {
    const report = await runWebGpuValidation({
      createRuntime: async () => ({
        executor: CPU_VISIBILITY_BATCH_EXECUTOR,
        selection: {
          backend: 'cpu',
          capability: { available: false, reason: 'no adapter' },
          fellBackToCpu: true,
        },
      }),
      createdAt: () => '2026-10-03T12:00:00.000Z',
      userAgent: 'test-browser',
      platform: 'test-platform',
    })

    expect(report).toMatchObject({
      status: 'skipped',
      capabilityReason: 'no adapter',
      cases: [],
      summary: { passed: 0, failed: 0, skipped: 1 },
    })
  })
})
