import type { LandscapeProject } from '../domain/project'
import { PROJECT_SCHEMA_VERSION } from '../domain/project'
import {
  CPU_VISIBILITY_BATCH_EXECUTOR,
  type PackedVisibilityBatchResult,
  type VisibilityBatchExecutor,
} from './batchedVisibility'
import { prepareSurfaceExposure } from './exposureSettings'
import { evaluatePreparedExposureBatch } from './instantExposureBatch'
import type { SurfacePoint } from './pointSolar'
import { DEFAULT_SYNTHETIC_CLIMATE } from './syntheticClimate'
import {
  createVisibilityBackendRuntime,
  type VisibilityBackendRuntime,
  type WebGpuAdapterInfoLike,
} from './visibilityBackend'
import {
  createVisibilityBenchmarkWorkload,
  VISIBILITY_SOLVER_VERSION,
  type VisibilityBenchmarkScenarioId,
  type VisibilityBenchmarkTierId,
  type VisibilityBenchmarkWorkload,
} from './visibilityBenchmark'
import { packWebGpuRays, packWebGpuScene } from './webgpuVisibility'

export const WEBGPU_VALIDATION_REPORT_VERSION = 1 as const
export const WEBGPU_VALIDATION_SUITE_VERSION = 'milestone-12f.v1'

export type WebGpuValidationStatus = 'pass' | 'fail' | 'skipped'

export interface VisibilityValidationCase {
  readonly kind: 'visibility'
  readonly name: string
  readonly status: Exclude<WebGpuValidationStatus, 'skipped'>
  readonly scenarioId: VisibilityBenchmarkScenarioId
  readonly tierId: VisibilityBenchmarkTierId
  readonly primitiveCount: number
  readonly bvhNodeCount: number
  readonly rayCount: number
  readonly estimatedGpuBufferBytes: number
  readonly cpuMilliseconds: number
  readonly gpuMilliseconds: number
  readonly maximumTransmissionDifference: number
  readonly transmissionMismatchCount: number
  readonly blockerMismatchCount: number
  readonly completedBackend: 'cpu' | 'webgpu'
  readonly fallbackReason?: string
  readonly message: string
}

export interface AccumulatedValidationCase {
  readonly kind: 'accumulated-direct-diffuse'
  readonly name: string
  readonly status: Exclude<WebGpuValidationStatus, 'skipped'>
  readonly surfaceCount: number
  readonly directionCount: number
  readonly rayCount: number
  readonly cpuMilliseconds: number
  readonly gpuMilliseconds: number
  readonly maximumDirectDifference: number
  readonly maximumDiffuseDifference: number
  readonly maximumTotalDifference: number
  readonly valueMismatchCount: number
  readonly completedBackend: 'cpu' | 'webgpu'
  readonly fallbackReason?: string
  readonly message: string
}

export type WebGpuValidationCase =
  | VisibilityValidationCase
  | AccumulatedValidationCase

export interface WebGpuValidationReport {
  readonly reportVersion: typeof WEBGPU_VALIDATION_REPORT_VERSION
  readonly suiteVersion: typeof WEBGPU_VALIDATION_SUITE_VERSION
  readonly solverVersion: typeof VISIBILITY_SOLVER_VERSION
  readonly createdAt: string
  readonly status: WebGpuValidationStatus
  readonly adapter?: WebGpuAdapterInfoLike
  readonly environment: {
    readonly userAgent: string
    readonly platform: string
  }
  readonly capabilityReason: string
  readonly cases: readonly WebGpuValidationCase[]
  readonly summary: {
    readonly passed: number
    readonly failed: number
    readonly skipped: number
  }
}

interface ValidationOptions {
  readonly createRuntime?: () => Promise<VisibilityBackendRuntime>
  readonly now?: () => number
  readonly createdAt?: () => string
  readonly userAgent?: string
  readonly platform?: string
}

const VISIBILITY_CASES: readonly [
  VisibilityBenchmarkScenarioId,
  VisibilityBenchmarkTierId,
][] = [
  ['small-suburban', 'preview'],
  ['dense-canopies', 'interactive'],
  ['many-small-objects', 'interactive'],
]

const TRANSMISSION_TOLERANCE = 1e-5
const EXPOSURE_ABSOLUTE_TOLERANCE = 1e-4
const EXPOSURE_RELATIVE_TOLERANCE = 1e-5

function finiteDifference(reference: number, actual: number): number {
  return Number.isFinite(reference) && Number.isFinite(actual)
    ? Math.abs(reference - actual)
    : Number.MAX_VALUE
}

function elapsed<T>(
  operation: () => Promise<T>,
  now: () => number,
): Promise<{ readonly value: T; readonly milliseconds: number }> {
  const start = now()
  return operation().then((value) => ({
    value,
    milliseconds: now() - start,
  }))
}

function estimatedGpuBufferBytes(workload: VisibilityBenchmarkWorkload): number {
  const scene = packWebGpuScene(workload.scene)
  const rays = packWebGpuRays(workload.batch)
  const resultAndReadbackBytes = workload.rayCount * 8 * 2
  return scene.storage.byteLength + scene.metadata.byteLength +
    rays.byteLength + resultAndReadbackBytes
}

function compareVisibilityResults(
  cpu: PackedVisibilityBatchResult,
  gpu: PackedVisibilityBatchResult,
): {
  readonly maximumTransmissionDifference: number
  readonly transmissionMismatchCount: number
  readonly blockerMismatchCount: number
} {
  let maximumTransmissionDifference = 0
  let transmissionMismatchCount = 0
  let blockerMismatchCount = 0
  for (let index = 0; index < cpu.transmissions.length; index += 1) {
    const difference = finiteDifference(
      cpu.transmissions[index],
      gpu.transmissions[index],
    )
    maximumTransmissionDifference = Math.max(
      maximumTransmissionDifference,
      difference,
    )
    if (difference > TRANSMISSION_TOLERANCE) {
      transmissionMismatchCount += 1
    }
    if (
      cpu.blockedByPrimitiveIndices[index] !==
      gpu.blockedByPrimitiveIndices[index]
    ) {
      blockerMismatchCount += 1
    }
  }
  return {
    maximumTransmissionDifference,
    transmissionMismatchCount,
    blockerMismatchCount,
  }
}

async function runVisibilityCase(
  scenarioId: VisibilityBenchmarkScenarioId,
  tierId: VisibilityBenchmarkTierId,
  executor: VisibilityBatchExecutor,
  now: () => number,
): Promise<VisibilityValidationCase> {
  const workload = createVisibilityBenchmarkWorkload(scenarioId, tierId)
  const cpu = await elapsed(
    () => CPU_VISIBILITY_BATCH_EXECUTOR.execute(workload.scene, workload.batch),
    now,
  )
  const gpu = await elapsed(
    () => executor.execute(workload.scene, workload.batch),
    now,
  )
  const comparison = compareVisibilityResults(cpu.value, gpu.value)
  const passed = gpu.value.backend === 'webgpu' &&
    comparison.transmissionMismatchCount === 0 &&
    comparison.blockerMismatchCount === 0
  return {
    kind: 'visibility',
    name: `${scenarioId} / ${tierId}`,
    status: passed ? 'pass' : 'fail',
    scenarioId,
    tierId,
    primitiveCount: workload.entities.length,
    bvhNodeCount: workload.scene.bvhNodes.length / 4,
    rayCount: workload.rayCount,
    estimatedGpuBufferBytes: estimatedGpuBufferBytes(workload),
    cpuMilliseconds: cpu.milliseconds,
    gpuMilliseconds: gpu.milliseconds,
    ...comparison,
    completedBackend: gpu.value.backend,
    ...(gpu.value.fallbackReason
      ? { fallbackReason: gpu.value.fallbackReason }
      : {}),
    message: passed
      ? 'CPU and WebGPU visibility results agree.'
      : gpu.value.backend !== 'webgpu'
        ? 'The case completed on CPU after WebGPU fallback.'
        : 'CPU and WebGPU visibility results disagree.',
  }
}

function validationProject(
  workload: VisibilityBenchmarkWorkload,
): LandscapeProject {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: 'project.webgpu-validation',
    name: 'WebGPU validation fixture',
    coordinates: { northRotationRadians: Math.PI / 12 },
    entities: workload.entities,
  }
}

function validationSurfaces(): readonly SurfacePoint[] {
  return Array.from({ length: 16 }, (_, index) => ({
    eastMeters: -9 + (index % 4) * 6,
    elevationMeters: 0.05 + (index % 3) * 0.4,
    northMeters: -7.5 + Math.floor(index / 4) * 5,
    normal: index % 4 === 0
      ? { east: 0.25, up: 0.95, north: 0.18 }
      : { east: 0, up: 1, north: 0 },
  }))
}

function exposureDifferenceExceedsTolerance(
  reference: number,
  actual: number,
): boolean {
  const difference = finiteDifference(reference, actual)
  return difference > EXPOSURE_ABSOLUTE_TOLERANCE &&
    difference > Math.abs(reference) * EXPOSURE_RELATIVE_TOLERANCE
}

async function runAccumulatedCase(
  executor: VisibilityBatchExecutor,
  now: () => number,
): Promise<AccumulatedValidationCase> {
  const workload = createVisibilityBenchmarkWorkload(
    'small-suburban',
    'preview',
  )
  const project = validationProject(workload)
  const surfaces = validationSurfaces()
  const prepared = prepareSurfaceExposure(project, {
    enabled: true,
    analysisMode: 'accumulated',
    climateParameters: DEFAULT_SYNTHETIC_CLIMATE,
    period: {
      startDate: { year: 2026, month: 6, day: 20 },
      endDate: { year: 2026, month: 6, day: 22 },
      latitudeRadians: 0.7,
      timeStepMinutes: 120,
      overcastProbabilityCurve: [
        { localSolarTimeHours: 0, probability: 0.45 },
        { localSolarTimeHours: 12, probability: 0.2 },
        { localSolarTimeHours: 24, probability: 0.45 },
      ],
    },
    maximumDirections: 32,
    spacingMeters: 0.25,
    displayChannel: 'total',
  })
  const cpu = await elapsed(
    () => evaluatePreparedExposureBatch(
      project,
      prepared,
      surfaces,
      CPU_VISIBILITY_BATCH_EXECUTOR,
      512,
    ),
    now,
  )
  const gpu = await elapsed(
    () => evaluatePreparedExposureBatch(
      project,
      prepared,
      surfaces,
      executor,
      512,
    ),
    now,
  )
  let maximumDirectDifference = 0
  let maximumDiffuseDifference = 0
  let maximumTotalDifference = 0
  let valueMismatchCount = 0
  cpu.value.values.forEach((reference, index) => {
    const actual = gpu.value.values[index]
    const directDifference = finiteDifference(reference.direct, actual.direct)
    const diffuseDifference = finiteDifference(reference.diffuse, actual.diffuse)
    const totalDifference = finiteDifference(reference.total, actual.total)
    maximumDirectDifference = Math.max(maximumDirectDifference, directDifference)
    maximumDiffuseDifference = Math.max(
      maximumDiffuseDifference,
      diffuseDifference,
    )
    maximumTotalDifference = Math.max(maximumTotalDifference, totalDifference)
    if (
      exposureDifferenceExceedsTolerance(reference.direct, actual.direct) ||
      exposureDifferenceExceedsTolerance(reference.diffuse, actual.diffuse) ||
      exposureDifferenceExceedsTolerance(reference.total, actual.total)
    ) {
      valueMismatchCount += 1
    }
  })
  const passed = gpu.value.backend === 'webgpu' && valueMismatchCount === 0
  return {
    kind: 'accumulated-direct-diffuse',
    name: 'accumulated direct + diffuse',
    status: passed ? 'pass' : 'fail',
    surfaceCount: surfaces.length,
    directionCount: prepared.directionCount,
    rayCount: gpu.value.rayCount,
    cpuMilliseconds: cpu.milliseconds,
    gpuMilliseconds: gpu.milliseconds,
    maximumDirectDifference,
    maximumDiffuseDifference,
    maximumTotalDifference,
    valueMismatchCount,
    completedBackend: gpu.value.backend,
    ...(gpu.value.fallbackReason
      ? { fallbackReason: gpu.value.fallbackReason }
      : {}),
    message: passed
      ? 'Accumulated direct, diffuse, and total results agree.'
      : gpu.value.backend !== 'webgpu'
        ? 'The case completed on CPU after WebGPU fallback.'
        : 'Accumulated CPU and WebGPU exposure results disagree.',
  }
}

export async function runWebGpuValidation(
  options: ValidationOptions = {},
): Promise<WebGpuValidationReport> {
  const now = options.now ?? (() => performance.now())
  const createdAt = options.createdAt ?? (() => new Date().toISOString())
  const runtime = await (options.createRuntime ?? (() =>
    createVisibilityBackendRuntime('webgpu')))()
  const environment = {
    userAgent: options.userAgent ??
      (typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent),
    platform: options.platform ??
      (typeof navigator === 'undefined' ? 'unknown' : navigator.platform),
  }
  if (runtime.selection.backend !== 'webgpu') {
    return {
      reportVersion: WEBGPU_VALIDATION_REPORT_VERSION,
      suiteVersion: WEBGPU_VALIDATION_SUITE_VERSION,
      solverVersion: VISIBILITY_SOLVER_VERSION,
      createdAt: createdAt(),
      status: 'skipped',
      environment,
      capabilityReason: runtime.selection.capability.reason,
      cases: [],
      summary: { passed: 0, failed: 0, skipped: 1 },
    }
  }

  const cases: WebGpuValidationCase[] = []
  for (const [scenarioId, tierId] of VISIBILITY_CASES) {
    cases.push(await runVisibilityCase(
      scenarioId,
      tierId,
      runtime.executor,
      now,
    ))
  }
  cases.push(await runAccumulatedCase(runtime.executor, now))
  const failed = cases.filter(({ status }) => status === 'fail').length
  return {
    reportVersion: WEBGPU_VALIDATION_REPORT_VERSION,
    suiteVersion: WEBGPU_VALIDATION_SUITE_VERSION,
    solverVersion: VISIBILITY_SOLVER_VERSION,
    createdAt: createdAt(),
    status: failed === 0 ? 'pass' : 'fail',
    ...(runtime.adapterInfo ? { adapter: runtime.adapterInfo } : {}),
    environment,
    capabilityReason: runtime.selection.capability.reason,
    cases,
    summary: {
      passed: cases.length - failed,
      failed,
      skipped: 0,
    },
  }
}
