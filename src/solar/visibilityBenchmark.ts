import type { PrimitiveEntity, PrimitiveGeometry } from '../domain/primitive'
import {
  NO_BLOCKING_PRIMITIVE,
  NO_EXCLUDED_PRIMITIVE,
  packVisibilityRayBatch,
  type PackedVisibilityRayBatch,
  type VisibilityBatchExecutor,
} from './batchedVisibility'
import {
  packGpuSceneGeometry,
  type GpuSceneGeometry,
} from './gpuScene'
import { tracePrimitiveTransmission, type Ray } from './rayVisibility'

export const VISIBILITY_SOLVER_VERSION = 'visibility-bvh.v1'

export type VisibilityBenchmarkScenarioId =
  | 'small-suburban'
  | 'quarter-acre'
  | 'one-acre-stress'
  | 'dense-canopies'
  | 'many-small-objects'
  | 'few-large-objects'

export type VisibilityBenchmarkTierId =
  | 'preview'
  | 'interactive'
  | 'refined'
  | 'analysis'

export interface VisibilityBenchmarkScenario {
  readonly id: VisibilityBenchmarkScenarioId
  readonly primitiveCount: number
  readonly widthMeters: number
  readonly depthMeters: number
  readonly geometryPattern: 'mixed' | 'canopies' | 'small' | 'large'
}

export interface VisibilityBenchmarkTier {
  readonly id: VisibilityBenchmarkTierId
  readonly spacingMeters: number
  readonly surfaceSampleCount: number
  readonly directionCount: number
}

export const VISIBILITY_BENCHMARK_SCENARIOS: readonly VisibilityBenchmarkScenario[] = [
  { id: 'small-suburban', primitiveCount: 24, widthMeters: 30, depthMeters: 24, geometryPattern: 'mixed' },
  { id: 'quarter-acre', primitiveCount: 96, widthMeters: 50, depthMeters: 20, geometryPattern: 'mixed' },
  { id: 'one-acre-stress', primitiveCount: 320, widthMeters: 82, depthMeters: 50, geometryPattern: 'mixed' },
  { id: 'dense-canopies', primitiveCount: 180, widthMeters: 45, depthMeters: 35, geometryPattern: 'canopies' },
  { id: 'many-small-objects', primitiveCount: 480, widthMeters: 60, depthMeters: 40, geometryPattern: 'small' },
  { id: 'few-large-objects', primitiveCount: 24, widthMeters: 60, depthMeters: 40, geometryPattern: 'large' },
]

export const VISIBILITY_BENCHMARK_TIERS: readonly VisibilityBenchmarkTier[] = [
  { id: 'preview', spacingMeters: 0.25, surfaceSampleCount: 32, directionCount: 32 },
  { id: 'interactive', spacingMeters: 0.1, surfaceSampleCount: 64, directionCount: 128 },
  { id: 'refined', spacingMeters: 0.04, surfaceSampleCount: 64, directionCount: 512 },
  { id: 'analysis', spacingMeters: 0.0254, surfaceSampleCount: 64, directionCount: 1_024 },
]

export interface VisibilityBenchmarkWorkload {
  readonly solverVersion: typeof VISIBILITY_SOLVER_VERSION
  readonly scenario: VisibilityBenchmarkScenario
  readonly tier: VisibilityBenchmarkTier
  readonly entities: readonly PrimitiveEntity[]
  readonly scene: GpuSceneGeometry
  readonly batch: PackedVisibilityRayBatch
  readonly rayCount: number
  readonly sceneBufferBytes: number
  readonly rayBufferBytes: number
}

export interface VisibilityBenchmarkMeasurement {
  readonly solverVersion: typeof VISIBILITY_SOLVER_VERSION
  readonly scenarioId: VisibilityBenchmarkScenarioId
  readonly tierId: VisibilityBenchmarkTierId
  readonly backend: 'cpu' | 'webgpu'
  readonly primitiveCount: number
  readonly bvhNodeCount: number
  readonly rayCount: number
  readonly sceneBufferBytes: number
  readonly rayBufferBytes: number
  readonly elapsedMilliseconds: number
  readonly raysPerSecond: number
  readonly fallbackReason?: string
  readonly environment?: Readonly<Record<string, string>>
}

export interface VisibilityDifferentialResult {
  readonly comparedRayCount: number
  readonly maximumTransmissionDifference: number
  readonly transmissionMismatchCount: number
  readonly blockerMismatchCount: number
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x100000000
  }
}

function geometryFor(
  pattern: VisibilityBenchmarkScenario['geometryPattern'],
  index: number,
  random: () => number,
): PrimitiveGeometry {
  const scale = pattern === 'small' ? 0.35 : pattern === 'large' ? 4 : 1
  if (pattern === 'canopies' || index % 5 === 4) {
    return {
      kind: 'canopy',
      eastRadiusMeters: scale * (0.8 + random() * 1.2),
      verticalRadiusMeters: scale * (0.6 + random()),
      northRadiusMeters: scale * (0.8 + random() * 1.2),
    }
  }
  switch (index % 4) {
    case 0:
      return {
        kind: 'box',
        widthMeters: scale * (0.8 + random() * 2),
        heightMeters: scale * (0.8 + random() * 3),
        depthMeters: scale * (0.8 + random() * 2),
      }
    case 1:
      return {
        kind: 'cylinder',
        radiusMeters: scale * (0.4 + random()),
        heightMeters: scale * (1 + random() * 3),
      }
    case 2:
      return {
        kind: 'wall',
        structure: index % 2 === 0 ? 'wall' : 'fence',
        lengthMeters: scale * (2 + random() * 4),
        heightMeters: scale * (1 + random() * 2),
        thicknessMeters: scale * 0.15,
      }
    default:
      return {
        kind: 'polygonExtrusion',
        footprint: [
          { eastMeters: -scale, northMeters: -scale },
          { eastMeters: scale, northMeters: -scale },
          { eastMeters: scale * 0.8, northMeters: scale },
          { eastMeters: -scale * 0.8, northMeters: scale },
        ],
        heightMeters: scale * (1 + random() * 2),
      }
  }
}

function halfHeight(geometry: PrimitiveGeometry): number {
  switch (geometry.kind) {
    case 'box': return geometry.heightMeters / 2
    case 'cylinder': return geometry.heightMeters / 2
    case 'wall': return geometry.heightMeters / 2
    case 'polygonExtrusion': return geometry.heightMeters / 2
    case 'canopy': return geometry.verticalRadiusMeters
  }
}

function createEntities(
  scenario: VisibilityBenchmarkScenario,
): PrimitiveEntity[] {
  const random = seededRandom(
    VISIBILITY_BENCHMARK_SCENARIOS.findIndex(({ id }) => id === scenario.id) + 1,
  )
  return Array.from({ length: scenario.primitiveCount }, (_, index) => {
    const geometry = geometryFor(scenario.geometryPattern, index, random)
    return {
      id: `benchmark.${scenario.id}.${index.toString().padStart(4, '0')}`,
      kind: 'primitive',
      name: `Benchmark object ${index}`,
      transform: {
        position: {
          eastMeters: (random() - 0.5) * scenario.widthMeters,
          elevationMeters: halfHeight(geometry),
          northMeters: (random() - 0.5) * scenario.depthMeters,
        },
        rotation: { xRadians: 0, yRadians: random() * Math.PI, zRadians: 0 },
      },
      geometry,
      solarOptics: index % 5 === 0
        ? { mode: 'transmissive', transmittance: 0.25 + random() * 0.65 }
        : { mode: 'opaque' },
    }
  })
}

function fibonacciDirections(count: number): readonly Ray['direction'][] {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5))
  return Array.from({ length: count }, (_, index) => {
    const y = (index + 0.5) / count
    const horizontal = Math.sqrt(1 - y * y)
    const angle = index * goldenAngle
    return {
      x: Math.cos(angle) * horizontal,
      y,
      z: Math.sin(angle) * horizontal,
    }
  })
}

function typedArrayBytes(scene: GpuSceneGeometry): number {
  return scene.primitiveKinds.byteLength +
    scene.primitiveTransforms.byteLength +
    scene.primitiveParameters.byteLength +
    scene.primitiveTransmittances.byteLength +
    scene.polygonRanges.byteLength +
    scene.polygonVertices.byteLength +
    scene.bvhBounds.byteLength + scene.bvhNodes.byteLength +
    scene.bvhPrimitiveIndices.byteLength
}

export function createVisibilityBenchmarkWorkload(
  scenarioId: VisibilityBenchmarkScenarioId,
  tierId: VisibilityBenchmarkTierId,
): VisibilityBenchmarkWorkload {
  const scenario = VISIBILITY_BENCHMARK_SCENARIOS.find(
    ({ id }) => id === scenarioId,
  )!
  const tier = VISIBILITY_BENCHMARK_TIERS.find(({ id }) => id === tierId)!
  const entities = createEntities(scenario)
  const scene = packGpuSceneGeometry(entities)
  const random = seededRandom(0x51a7 + scenario.primitiveCount)
  const origins = Array.from({ length: tier.surfaceSampleCount }, () => ({
    x: (random() - 0.5) * scenario.widthMeters,
    y: 0,
    z: (random() - 0.5) * scenario.depthMeters,
  }))
  const directions = fibonacciDirections(tier.directionCount)
  const requests = origins.flatMap((origin, sampleIndex) =>
    directions.map((direction) => ({
      ray: { origin, direction },
      ...(sampleIndex % 17 === 0
        ? { excludedEntityId: entities[sampleIndex % entities.length].id }
        : {}),
    }))
  )
  const batch = packVisibilityRayBatch(scene, requests)
  return {
    solverVersion: VISIBILITY_SOLVER_VERSION,
    scenario,
    tier,
    entities,
    scene,
    batch,
    rayCount: requests.length,
    sceneBufferBytes: typedArrayBytes(scene),
    rayBufferBytes: batch.origins.byteLength + batch.directions.byteLength +
      batch.excludedPrimitiveIndices.byteLength,
  }
}

export async function measureVisibilityWorkload(
  workload: VisibilityBenchmarkWorkload,
  executor: VisibilityBatchExecutor,
  environment?: Readonly<Record<string, string>>,
  now: () => number = () => performance.now(),
): Promise<VisibilityBenchmarkMeasurement> {
  const start = now()
  const result = await executor.execute(workload.scene, workload.batch)
  const elapsedMilliseconds = now() - start
  return {
    solverVersion: workload.solverVersion,
    scenarioId: workload.scenario.id,
    tierId: workload.tier.id,
    backend: result.backend,
    primitiveCount: workload.entities.length,
    bvhNodeCount: workload.scene.bvhNodes.length / 4,
    rayCount: workload.rayCount,
    sceneBufferBytes: workload.sceneBufferBytes,
    rayBufferBytes: workload.rayBufferBytes,
    elapsedMilliseconds,
    raysPerSecond: elapsedMilliseconds > 0
      ? workload.rayCount / elapsedMilliseconds * 1_000
      : Number.POSITIVE_INFINITY,
    ...(result.fallbackReason ? { fallbackReason: result.fallbackReason } : {}),
    ...(environment ? { environment } : {}),
  }
}

function rayAt(batch: PackedVisibilityRayBatch, index: number): Ray {
  const offset = index * 4
  return {
    origin: {
      x: batch.origins[offset], y: batch.origins[offset + 1],
      z: batch.origins[offset + 2],
    },
    direction: {
      x: batch.directions[offset], y: batch.directions[offset + 1],
      z: batch.directions[offset + 2],
    },
  }
}

export async function compareVisibilityWorkloadWithReference(
  workload: VisibilityBenchmarkWorkload,
  executor: VisibilityBatchExecutor,
  maximumRayCount = workload.rayCount,
  tolerance = 1e-5,
): Promise<VisibilityDifferentialResult> {
  const comparedRayCount = Math.min(maximumRayCount, workload.rayCount)
  const batch = {
    origins: workload.batch.origins.slice(0, comparedRayCount * 4),
    directions: workload.batch.directions.slice(0, comparedRayCount * 4),
    excludedPrimitiveIndices:
      workload.batch.excludedPrimitiveIndices.slice(0, comparedRayCount),
  }
  const actual = await executor.execute(workload.scene, batch)
  let maximumTransmissionDifference = 0
  let transmissionMismatchCount = 0
  let blockerMismatchCount = 0
  for (let index = 0; index < comparedRayCount; index += 1) {
    const excluded = batch.excludedPrimitiveIndices[index]
    const reference = tracePrimitiveTransmission(
      rayAt(batch, index),
      workload.entities,
      excluded === NO_EXCLUDED_PRIMITIVE
        ? undefined
        : workload.scene.entityIds[excluded],
    )
    const difference = Math.abs(actual.transmissions[index] - reference.transmission)
    maximumTransmissionDifference = Math.max(
      maximumTransmissionDifference,
      difference,
    )
    if (difference > tolerance) transmissionMismatchCount += 1
    const blocker = actual.blockedByPrimitiveIndices[index]
    const blockerId = blocker === NO_BLOCKING_PRIMITIVE
      ? undefined
      : workload.scene.entityIds[blocker]
    if (blockerId !== reference.blockedByEntityId) blockerMismatchCount += 1
  }
  return {
    comparedRayCount,
    maximumTransmissionDifference,
    transmissionMismatchCount,
    blockerMismatchCount,
  }
}
