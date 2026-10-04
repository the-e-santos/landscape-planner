export type SolarComputeBackend = 'cpu' | 'webgpu'
export type SolarComputePreference = 'auto' | SolarComputeBackend

export interface WebGpuCapability {
  readonly available: boolean
  readonly reason: string
}

interface NavigatorWithOptionalGpu {
  readonly gpu?: { requestAdapter(): Promise<unknown | null> }
}

export interface SolarComputeBackendSelection {
  readonly backend: SolarComputeBackend
  readonly capability: WebGpuCapability
  readonly fellBackToCpu: boolean
}

export function parseSolarComputePreference(
  search: string,
): SolarComputePreference {
  const value = new URLSearchParams(search).get('solar-compute')
  return value === 'cpu' || value === 'webgpu' || value === 'auto'
    ? value
    : 'auto'
}

/** Adapter acquisition is the capability boundary; navigator.gpu alone is not. */
export async function detectWebGpuComputeCapability(
  navigatorLike: NavigatorWithOptionalGpu | undefined =
    typeof navigator === 'undefined'
      ? undefined
      : navigator as NavigatorWithOptionalGpu,
): Promise<WebGpuCapability> {
  if (!navigatorLike?.gpu) {
    return { available: false, reason: 'WebGPU is not exposed by this browser.' }
  }
  try {
    const adapter = await navigatorLike.gpu.requestAdapter()
    return adapter
      ? { available: true, reason: 'A WebGPU adapter is available.' }
      : {
          available: false,
          reason: 'The browser could not provide a WebGPU adapter.',
        }
  } catch (error) {
    return {
      available: false,
      reason: error instanceof Error
        ? `WebGPU adapter request failed: ${error.message}`
        : 'WebGPU adapter request failed.',
    }
  }
}

/** Resolves to the supported CPU solver whenever WebGPU cannot be used. */
export async function selectSolarComputeBackend(
  preference: SolarComputePreference = 'auto',
  detectCapability: () => Promise<WebGpuCapability> =
    detectWebGpuComputeCapability,
): Promise<SolarComputeBackendSelection> {
  if (preference === 'cpu') {
    return {
      backend: 'cpu',
      capability: {
        available: false,
        reason: 'CPU solar computation was explicitly selected.',
      },
      fellBackToCpu: false,
    }
  }
  const capability = await detectCapability()
  return capability.available
    ? { backend: 'webgpu', capability, fellBackToCpu: false }
    : {
        backend: 'cpu',
        capability,
        fellBackToCpu: preference === 'webgpu',
      }
}
