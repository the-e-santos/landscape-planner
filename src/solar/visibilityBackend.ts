import {
  CPU_VISIBILITY_BATCH_EXECUTOR,
  type VisibilityBatchExecutor,
} from './batchedVisibility'
import type {
  SolarComputeBackendSelection,
  SolarComputePreference,
  WebGpuCapability,
} from './computeBackend'
import {
  createWebGpuVisibilityBatchExecutor,
  withCpuVisibilityFallback,
  type WebGpuDeviceLike,
} from './webgpuVisibility'

export interface WebGpuAdapterInfoLike {
  readonly isFallbackAdapter?: boolean
  readonly vendor?: string
  readonly architecture?: string
}

export interface WebGpuAdapterLike {
  readonly info?: WebGpuAdapterInfoLike
  requestDevice(): Promise<WebGpuDeviceLike>
}

export interface WebGpuNavigatorLike {
  readonly gpu?: {
    requestAdapter(): Promise<WebGpuAdapterLike | null>
  }
}

export interface VisibilityBackendRuntime {
  readonly executor: VisibilityBatchExecutor
  readonly selection: SolarComputeBackendSelection
  readonly adapterInfo?: WebGpuAdapterInfoLike
}

function cpuRuntime(
  preference: SolarComputePreference,
  capability: WebGpuCapability,
): VisibilityBackendRuntime {
  return {
    executor: CPU_VISIBILITY_BATCH_EXECUTOR,
    selection: {
      backend: 'cpu',
      capability,
      fellBackToCpu: preference === 'webgpu',
    },
  }
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

/**
 * Acquires the initial visibility backend once. Auto mode reserves WebGPU for
 * hardware adapters; explicit WebGPU mode also permits software adapters used
 * for diagnostics. All acquisition failures resolve to the CPU executor.
 */
export async function createVisibilityBackendRuntime(
  preference: SolarComputePreference = 'auto',
  navigatorLike: WebGpuNavigatorLike | undefined =
    typeof navigator === 'undefined'
      ? undefined
      : navigator as WebGpuNavigatorLike,
  onRuntimeFallback?: (reason: string) => void,
): Promise<VisibilityBackendRuntime> {
  if (preference === 'cpu') {
    return cpuRuntime(preference, {
      available: false,
      reason: 'CPU solar computation was explicitly selected.',
    })
  }
  if (!navigatorLike?.gpu) {
    return cpuRuntime(preference, {
      available: false,
      reason: 'WebGPU is not exposed by this browser.',
    })
  }

  let adapter: WebGpuAdapterLike | null
  try {
    adapter = await navigatorLike.gpu.requestAdapter()
  } catch (error) {
    return cpuRuntime(preference, {
      available: false,
      reason: `WebGPU adapter request failed: ${errorMessage(
        error,
        'unknown adapter error',
      )}`,
    })
  }
  if (!adapter) {
    return cpuRuntime(preference, {
      available: false,
      reason: 'The browser could not provide a WebGPU adapter.',
    })
  }
  if (preference === 'auto' && adapter.info?.isFallbackAdapter) {
    return cpuRuntime(preference, {
      available: true,
      reason: 'Only a software WebGPU adapter is available; auto mode selected CPU.',
    })
  }

  let device: WebGpuDeviceLike
  try {
    device = await adapter.requestDevice()
  } catch (error) {
    return cpuRuntime(preference, {
      available: false,
      reason: `WebGPU device request failed: ${errorMessage(
        error,
        'unknown device error',
      )}`,
    })
  }
  const executor = withCpuVisibilityFallback(
    createWebGpuVisibilityBatchExecutor(device),
    onRuntimeFallback,
  )
  return {
    executor,
    selection: {
      backend: 'webgpu',
      capability: {
        available: true,
        reason: adapter.info?.isFallbackAdapter
          ? 'A software WebGPU adapter and device are available.'
          : 'A hardware WebGPU adapter and device are available.',
      },
      fellBackToCpu: false,
    },
    ...(adapter.info ? { adapterInfo: adapter.info } : {}),
  }
}
