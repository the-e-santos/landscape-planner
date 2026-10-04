import { describe, expect, it, vi } from 'vitest'
import {
  detectWebGpuComputeCapability,
  parseSolarComputePreference,
  selectSolarComputeBackend,
} from './computeBackend'

describe('solar compute backend selection', () => {
  it('parses diagnostic URL overrides and defaults invalid values to auto', () => {
    expect(parseSolarComputePreference('?solar-compute=cpu')).toBe('cpu')
    expect(parseSolarComputePreference('?solar-compute=webgpu')).toBe('webgpu')
    expect(parseSolarComputePreference('?solar-compute=auto')).toBe('auto')
    expect(parseSolarComputePreference('?solar-compute=gpu')).toBe('auto')
    expect(parseSolarComputePreference('')).toBe('auto')
  })

  it('uses CPU when WebGPU is not exposed', async () => {
    const capability = await detectWebGpuComputeCapability({})
    expect(capability.available).toBe(false)
    expect(await selectSolarComputeBackend('auto', async () => capability))
      .toMatchObject({ backend: 'cpu', fellBackToCpu: false })
  })

  it('uses CPU when adapter acquisition is denied or fails', async () => {
    const unavailable = await detectWebGpuComputeCapability({
      gpu: { requestAdapter: async () => null },
    })
    const failed = await detectWebGpuComputeCapability({
      gpu: { requestAdapter: async () => { throw new Error('device blocked') } },
    })
    expect(unavailable).toMatchObject({ available: false })
    expect(failed).toMatchObject({
      available: false,
      reason: expect.stringContaining('device blocked'),
    })
    expect(await selectSolarComputeBackend('webgpu', async () => failed))
      .toMatchObject({ backend: 'cpu', fellBackToCpu: true })
  })

  it('selects WebGPU only after acquiring an adapter', async () => {
    const requestAdapter = vi.fn(async () => ({ name: 'test adapter' }))
    const capability = await detectWebGpuComputeCapability({
      gpu: { requestAdapter },
    })
    expect(requestAdapter).toHaveBeenCalledOnce()
    expect(await selectSolarComputeBackend('auto', async () => capability))
      .toMatchObject({ backend: 'webgpu', fellBackToCpu: false })
  })

  it('honors an explicit CPU choice without probing WebGPU', async () => {
    const detect = vi.fn(async () => ({
      available: true,
      reason: 'available',
    }))
    expect(await selectSolarComputeBackend('cpu', detect)).toMatchObject({
      backend: 'cpu',
      fellBackToCpu: false,
    })
    expect(detect).not.toHaveBeenCalled()
  })
})
