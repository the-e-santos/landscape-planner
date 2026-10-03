import {
  GPU_PRIMITIVE_KIND,
  GPU_PRIMITIVE_PARAMETER_STRIDE,
  GPU_PRIMITIVE_TRANSFORM_STRIDE,
  queryGpuBvhCandidates,
  type GpuSceneGeometry,
} from './gpuScene'
import type { SolarComputeBackend } from './computeBackend'
import type { Ray, Vector3 } from './rayVisibility'

export const VISIBILITY_RAY_STRIDE = 4
export const NO_EXCLUDED_PRIMITIVE = 0xffffffff
export const NO_BLOCKING_PRIMITIVE = 0xffffffff

const RAY_EPSILON_METERS = 1e-6
// Local aliases keep benchmark hot loops independent of transformed ESM getters.
const PACKED_PRIMITIVE_KIND = GPU_PRIMITIVE_KIND
const PACKED_PRIMITIVE_PARAMETER_STRIDE = GPU_PRIMITIVE_PARAMETER_STRIDE
const PACKED_PRIMITIVE_TRANSFORM_STRIDE = GPU_PRIMITIVE_TRANSFORM_STRIDE
const queryPackedBvhCandidates = queryGpuBvhCandidates

export interface VisibilityRayRequest {
  readonly ray: Ray
  readonly excludedEntityId?: string
}

/** Float32/uint32 input buffers shared by CPU and future WebGPU executors. */
export interface PackedVisibilityRayBatch {
  /** Origin XYZ plus padding per ray. */
  readonly origins: Float32Array
  /** Direction XYZ plus padding per ray. */
  readonly directions: Float32Array
  readonly excludedPrimitiveIndices: Uint32Array
}

export interface PackedVisibilityBatchResult {
  readonly backend: SolarComputeBackend
  readonly fallbackReason?: string
  readonly transmissions: Float32Array
  readonly blockedByPrimitiveIndices: Uint32Array
}

export interface VisibilityBatchExecutor {
  readonly backend: SolarComputeBackend
  execute(
    scene: GpuSceneGeometry,
    batch: PackedVisibilityRayBatch,
  ): Promise<PackedVisibilityBatchResult>
}

function assertFiniteVector(vector: Vector3, label: string): void {
  if (![vector.x, vector.y, vector.z].every(Number.isFinite)) {
    throw new Error(`${label} must contain finite coordinates`)
  }
}

export function packVisibilityRayBatch(
  scene: GpuSceneGeometry,
  requests: readonly VisibilityRayRequest[],
): PackedVisibilityRayBatch {
  const origins = new Float32Array(requests.length * VISIBILITY_RAY_STRIDE)
  const directions = new Float32Array(requests.length * VISIBILITY_RAY_STRIDE)
  const exclusions = new Uint32Array(requests.length)
  exclusions.fill(NO_EXCLUDED_PRIMITIVE)

  requests.forEach(({ ray, excludedEntityId }, index) => {
    assertFiniteVector(ray.origin, 'Ray origin')
    assertFiniteVector(ray.direction, 'Ray direction')
    if (Math.hypot(ray.direction.x, ray.direction.y, ray.direction.z) === 0) {
      throw new Error('Ray direction must be nonzero')
    }
    const offset = index * VISIBILITY_RAY_STRIDE
    origins.set([ray.origin.x, ray.origin.y, ray.origin.z], offset)
    directions.set([ray.direction.x, ray.direction.y, ray.direction.z], offset)
    if (excludedEntityId !== undefined) {
      const primitiveIndex = scene.entityIds.indexOf(excludedEntityId)
      if (primitiveIndex >= 0) exclusions[index] = primitiveIndex
    }
  })
  return { origins, directions, excludedPrimitiveIndices: exclusions }
}

function rayAt(batch: PackedVisibilityRayBatch, index: number): Ray {
  const offset = index * VISIBILITY_RAY_STRIDE
  return {
    origin: {
      x: batch.origins[offset],
      y: batch.origins[offset + 1],
      z: batch.origins[offset + 2],
    },
    direction: {
      x: batch.directions[offset],
      y: batch.directions[offset + 1],
      z: batch.directions[offset + 2],
    },
  }
}

function toLocalRay(
  scene: GpuSceneGeometry,
  primitiveIndex: number,
  ray: Ray,
): Ray {
  const offset = primitiveIndex * PACKED_PRIMITIVE_TRANSFORM_STRIDE
  const transform = scene.primitiveTransforms
  const x = ray.origin.x - transform[offset]
  const y = ray.origin.y - transform[offset + 1]
  const z = ray.origin.z - transform[offset + 2]
  return {
    origin: {
      x: transform[offset + 3] * x + transform[offset + 4] * y +
        transform[offset + 5] * z,
      y: transform[offset + 6] * x + transform[offset + 7] * y +
        transform[offset + 8] * z,
      z: transform[offset + 9] * x + transform[offset + 10] * y +
        transform[offset + 11] * z,
    },
    direction: {
      x: transform[offset + 3] * ray.direction.x +
        transform[offset + 4] * ray.direction.y +
        transform[offset + 5] * ray.direction.z,
      y: transform[offset + 6] * ray.direction.x +
        transform[offset + 7] * ray.direction.y +
        transform[offset + 8] * ray.direction.z,
      z: transform[offset + 9] * ray.direction.x +
        transform[offset + 10] * ray.direction.y +
        transform[offset + 11] * ray.direction.z,
    },
  }
}

function intersectBox(ray: Ray, extents: Vector3): number | undefined {
  let near = Number.NEGATIVE_INFINITY
  let far = Number.POSITIVE_INFINITY
  for (const axis of ['x', 'y', 'z'] as const) {
    const origin = ray.origin[axis]
    const direction = ray.direction[axis]
    const extent = extents[axis]
    if (Math.abs(direction) < Number.EPSILON) {
      if (origin < -extent || origin > extent) return undefined
      continue
    }
    const first = (-extent - origin) / direction
    const second = (extent - origin) / direction
    near = Math.max(near, Math.min(first, second))
    far = Math.min(far, Math.max(first, second))
    if (near > far) return undefined
  }
  const distance = near > RAY_EPSILON_METERS ? near : far
  return distance > RAY_EPSILON_METERS ? distance : undefined
}

function intersectCylinder(
  ray: Ray,
  radius: number,
  halfHeight: number,
): number | undefined {
  const candidates: number[] = []
  const a = (ray.direction.x ** 2 + ray.direction.z ** 2) / radius ** 2
  const b = 2 * (
    ray.origin.x * ray.direction.x + ray.origin.z * ray.direction.z
  ) / radius ** 2
  const c = (ray.origin.x ** 2 + ray.origin.z ** 2) / radius ** 2 - 1
  const discriminant = b * b - 4 * a * c
  if (a > Number.EPSILON && discriminant >= 0) {
    const root = Math.sqrt(discriminant)
    for (const distance of [(-b - root) / (2 * a), (-b + root) / (2 * a)]) {
      const y = ray.origin.y + distance * ray.direction.y
      if (distance > RAY_EPSILON_METERS && Math.abs(y) <= halfHeight) {
        candidates.push(distance)
      }
    }
  }
  if (Math.abs(ray.direction.y) > Number.EPSILON) {
    for (const y of [-halfHeight, halfHeight]) {
      const distance = (y - ray.origin.y) / ray.direction.y
      const x = ray.origin.x + distance * ray.direction.x
      const z = ray.origin.z + distance * ray.direction.z
      if (
        distance > RAY_EPSILON_METERS &&
        (x ** 2 + z ** 2) / radius ** 2 <= 1
      ) {
        candidates.push(distance)
      }
    }
  }
  return candidates.length > 0 ? Math.min(...candidates) : undefined
}

function intersectEllipsoid(ray: Ray, radii: Vector3): number | undefined {
  const a = ray.direction.x ** 2 / radii.x ** 2 +
    ray.direction.y ** 2 / radii.y ** 2 +
    ray.direction.z ** 2 / radii.z ** 2
  const b = 2 * (
    ray.origin.x * ray.direction.x / radii.x ** 2 +
    ray.origin.y * ray.direction.y / radii.y ** 2 +
    ray.origin.z * ray.direction.z / radii.z ** 2
  )
  const c = ray.origin.x ** 2 / radii.x ** 2 +
    ray.origin.y ** 2 / radii.y ** 2 +
    ray.origin.z ** 2 / radii.z ** 2 - 1
  const discriminant = b * b - 4 * a * c
  if (discriminant < 0) return undefined
  const root = Math.sqrt(discriminant)
  const distances = [(-b - root) / (2 * a), (-b + root) / (2 * a)]
    .filter((distance) => distance > RAY_EPSILON_METERS)
  return distances.length > 0 ? Math.min(...distances) : undefined
}

function pointInPolygon(
  x: number,
  z: number,
  vertices: Float32Array,
  first: number,
  count: number,
): boolean {
  let inside = false
  for (let index = 0, previous = count - 1; index < count; previous = index++) {
    const a = (first + index) * 2
    const b = (first + previous) * 2
    const ax = vertices[a]
    const az = vertices[a + 1]
    const bx = vertices[b]
    const bz = vertices[b + 1]
    if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) {
      inside = !inside
    }
  }
  return inside
}

function intersectPolygonExtrusion(
  scene: GpuSceneGeometry,
  primitiveIndex: number,
  ray: Ray,
  halfHeight: number,
): number | undefined {
  const first = scene.polygonRanges[primitiveIndex * 2]
  const count = scene.polygonRanges[primitiveIndex * 2 + 1]
  const candidates: number[] = []
  if (Math.abs(ray.direction.y) > Number.EPSILON) {
    for (const y of [-halfHeight, halfHeight]) {
      const distance = (y - ray.origin.y) / ray.direction.y
      if (
        distance > RAY_EPSILON_METERS &&
        pointInPolygon(
          ray.origin.x + distance * ray.direction.x,
          ray.origin.z + distance * ray.direction.z,
          scene.polygonVertices,
          first,
          count,
        )
      ) {
        candidates.push(distance)
      }
    }
  }
  for (let index = 0; index < count; index += 1) {
    const start = (first + index) * 2
    const end = (first + (index + 1) % count) * 2
    const startX = scene.polygonVertices[start]
    const startZ = scene.polygonVertices[start + 1]
    const edgeX = scene.polygonVertices[end] - startX
    const edgeZ = scene.polygonVertices[end + 1] - startZ
    const determinant = ray.direction.x * edgeZ - ray.direction.z * edgeX
    if (Math.abs(determinant) < Number.EPSILON) continue
    const offsetX = startX - ray.origin.x
    const offsetZ = startZ - ray.origin.z
    const distance = (offsetX * edgeZ - offsetZ * edgeX) / determinant
    const edgeParameter = (
      offsetX * ray.direction.z - offsetZ * ray.direction.x
    ) / determinant
    const y = ray.origin.y + distance * ray.direction.y
    if (
      distance > RAY_EPSILON_METERS && edgeParameter >= 0 &&
      edgeParameter <= 1 && Math.abs(y) <= halfHeight
    ) {
      candidates.push(distance)
    }
  }
  return candidates.length > 0 ? Math.min(...candidates) : undefined
}

export function intersectPackedPrimitive(
  scene: GpuSceneGeometry,
  primitiveIndex: number,
  ray: Ray,
): number | undefined {
  const localRay = toLocalRay(scene, primitiveIndex, ray)
  const offset = primitiveIndex * PACKED_PRIMITIVE_PARAMETER_STRIDE
  const parameters = scene.primitiveParameters
  switch (scene.primitiveKinds[primitiveIndex]) {
    case PACKED_PRIMITIVE_KIND.box:
    case PACKED_PRIMITIVE_KIND.wall:
      return intersectBox(localRay, {
        x: parameters[offset],
        y: parameters[offset + 1],
        z: parameters[offset + 2],
      })
    case PACKED_PRIMITIVE_KIND.cylinder:
      return intersectCylinder(
        localRay,
        parameters[offset],
        parameters[offset + 1],
      )
    case PACKED_PRIMITIVE_KIND.canopy:
      return intersectEllipsoid(localRay, {
        x: parameters[offset],
        y: parameters[offset + 1],
        z: parameters[offset + 2],
      })
    case PACKED_PRIMITIVE_KIND.polygonExtrusion:
      return intersectPolygonExtrusion(
        scene,
        primitiveIndex,
        localRay,
        parameters[offset],
      )
    default:
      return undefined
  }
}

export function tracePackedVisibilityBatch(
  scene: GpuSceneGeometry,
  batch: PackedVisibilityRayBatch,
): PackedVisibilityBatchResult {
  const rayCount = batch.excludedPrimitiveIndices.length
  if (
    batch.origins.length !== rayCount * VISIBILITY_RAY_STRIDE ||
    batch.directions.length !== rayCount * VISIBILITY_RAY_STRIDE
  ) {
    throw new Error('Packed visibility batch buffers have inconsistent lengths')
  }
  const transmissions = new Float32Array(rayCount)
  transmissions.fill(1)
  const blockedByPrimitiveIndices = new Uint32Array(rayCount)
  blockedByPrimitiveIndices.fill(NO_BLOCKING_PRIMITIVE)

  for (let rayIndex = 0; rayIndex < rayCount; rayIndex += 1) {
    const ray = rayAt(batch, rayIndex)
    const excluded = batch.excludedPrimitiveIndices[rayIndex]
    const intersections = queryPackedBvhCandidates(scene, ray)
      .filter((primitiveIndex) => primitiveIndex !== excluded)
      .flatMap((primitiveIndex) => {
        const distance = intersectPackedPrimitive(scene, primitiveIndex, ray)
        return distance === undefined ? [] : [{ primitiveIndex, distance }]
      })
      .sort((left, right) =>
        left.distance - right.distance ||
        scene.entityIds[left.primitiveIndex].localeCompare(
          scene.entityIds[right.primitiveIndex],
        )
      )

    let transmission = 1
    for (const { primitiveIndex } of intersections) {
      transmission *= scene.primitiveTransmittances[primitiveIndex]
      if (transmission === 0) {
        blockedByPrimitiveIndices[rayIndex] = primitiveIndex
        break
      }
    }
    transmissions[rayIndex] = transmission
  }
  return { backend: 'cpu', transmissions, blockedByPrimitiveIndices }
}

export const CPU_VISIBILITY_BATCH_EXECUTOR: VisibilityBatchExecutor = {
  backend: 'cpu',
  execute: async (scene, batch) => tracePackedVisibilityBatch(scene, batch),
}
