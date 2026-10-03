import { describe, expect, it, vi } from 'vitest'
import type { WebGpuDeviceLike } from './webgpuVisibility'
import { createVisibilityBackendRuntime } from './visibilityBackend'

const unusedDevice = {} as WebGpuDeviceLike

describe('visibility backend runtime factory', () => {
  it('honors an explicit CPU preference without probing WebGPU', async () => {
    const requestAdapter = vi.fn(async () => null)
    const runtime = await createVisibilityBackendRuntime('cpu', {
      gpu: { requestAdapter },
    })

    expect(runtime.executor.backend).toBe('cpu')
    expect(runtime.selection).toMatchObject({
      backend: 'cpu',
      fellBackToCpu: false,
    })
    expect(requestAdapter).not.toHaveBeenCalled()
  })

  it.each([
    ['missing entry point', undefined],
    ['null adapter', {
      gpu: { requestAdapter: async (): Promise<null> => null },
    }],
    ['adapter error', {
      gpu: {
        requestAdapter: async (): Promise<never> => {
          throw new Error('adapter denied')
        },
      },
    }],
  ] as const)('selects CPU for a %s', async (_label, navigatorLike) => {
    const runtime = await createVisibilityBackendRuntime(
      'webgpu',
      navigatorLike,
    )
    expect(runtime.executor.backend).toBe('cpu')
    expect(runtime.selection).toMatchObject({
      backend: 'cpu',
      fellBackToCpu: true,
      capability: { available: false },
    })
  })

  it('selects CPU when device acquisition fails', async () => {
    const runtime = await createVisibilityBackendRuntime('webgpu', {
      gpu: {
        requestAdapter: async () => ({
          requestDevice: async () => { throw new Error('device denied') },
        }),
      },
    })
    expect(runtime.executor.backend).toBe('cpu')
    expect(runtime.selection.capability.reason).toContain('device denied')
  })

  it('uses a hardware WebGPU device in auto mode', async () => {
    const requestDevice = vi.fn(async () => unusedDevice)
    const runtime = await createVisibilityBackendRuntime('auto', {
      gpu: {
        requestAdapter: async () => ({
          info: {
            isFallbackAdapter: false,
            vendor: 'test vendor',
            architecture: 'test hardware',
          },
          requestDevice,
        }),
      },
    })

    expect(requestDevice).toHaveBeenCalledOnce()
    expect(runtime.executor.backend).toBe('webgpu')
    expect(runtime.selection).toMatchObject({
      backend: 'webgpu',
      fellBackToCpu: false,
      capability: { available: true },
    })
    expect(runtime.adapterInfo?.architecture).toBe('test hardware')
  })

  it('keeps software WebGPU opt-in while auto mode stays on CPU', async () => {
    const requestDevice = vi.fn(async () => unusedDevice)
    const navigatorLike = {
      gpu: {
        requestAdapter: async () => ({
          info: {
            isFallbackAdapter: true,
            vendor: 'google',
            architecture: 'swiftshader',
          },
          requestDevice,
        }),
      },
    }
    const automatic = await createVisibilityBackendRuntime(
      'auto',
      navigatorLike,
    )
    const explicit = await createVisibilityBackendRuntime(
      'webgpu',
      navigatorLike,
    )

    expect(automatic.executor.backend).toBe('cpu')
    expect(automatic.selection.capability).toMatchObject({ available: true })
    expect(explicit.executor.backend).toBe('webgpu')
    expect(explicit.adapterInfo?.isFallbackAdapter).toBe(true)
    expect(requestDevice).toHaveBeenCalledOnce()
  })
})
