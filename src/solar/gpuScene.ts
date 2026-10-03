import {
  getPrimitiveSolarOptics,
  type PrimitiveEntity,
} from '../domain/primitive'
import type { Ray } from './rayVisibility'
import {
  conservativePrimitiveBounds,
  type Bounds3,
} from './tileInvalidation'

export const GPU_SCENE_FORMAT_VERSION = 1
export const GPU_BVH_NODE_STRIDE = 4
export const GPU_BVH_BOUNDS_STRIDE = 6
export const GPU_PRIMITIVE_TRANSFORM_STRIDE = 12
export const GPU_PRIMITIVE_PARAMETER_STRIDE = 4
export const GPU_BVH_NO_NODE = 0xffffffff

export const GPU_PRIMITIVE_KIND = {
  box: 0,
  cylinder: 1,
  wall: 2,
  polygonExtrusion: 3,
  canopy: 4,
} as const

interface PackedPrimitive {
  readonly entity: PrimitiveEntity
  readonly sourceIndex: number
  readonly bounds: Bounds3
  readonly polygonOffset: number
  readonly polygonCount: number
}

/** Structure-of-arrays data intended to map directly to GPU storage buffers. */
export interface GpuSceneGeometry {
  readonly formatVersion: typeof GPU_SCENE_FORMAT_VERSION
  readonly entityIds: readonly string[]
  readonly primitiveKinds: Uint32Array
  /** World center followed by a row-major world-to-local rotation matrix. */
  readonly primitiveTransforms: Float32Array
  readonly primitiveParameters: Float32Array
  readonly primitiveTransmittances: Float32Array
  readonly polygonRanges: Uint32Array
  /** Local X/Z pairs; local Z already follows the render frame. */
  readonly polygonVertices: Float32Array
  /** Per-node min XYZ followed by max XYZ. */
  readonly bvhBounds: Float32Array
  /** Per-node left, right, first primitive, primitive count. */
  readonly bvhNodes: Uint32Array
  readonly bvhPrimitiveIndices: Uint32Array
}

function inverseRotationRows(entity: PrimitiveEntity): readonly number[] {
  const { xRadians, yRadians, zRadians } = entity.transform.rotation
  const a = Math.cos(xRadians)
  const b = Math.sin(xRadians)
  const c = Math.cos(yRadians)
  const d = Math.sin(yRadians)
  const e = Math.cos(zRadians)
  const f = Math.sin(zRadians)
  return [
    c * e, a * f + b * e * d, b * f - a * e * d,
    -c * f, a * e - b * f * d, b * e + a * f * d,
    d, -b * c, a * c,
  ]
}

function writePrimitiveParameters(
  target: number[],
  entity: PrimitiveEntity,
): void {
  const geometry = entity.geometry
  switch (geometry.kind) {
    case 'box':
      target.push(geometry.widthMeters / 2, geometry.heightMeters / 2,
        geometry.depthMeters / 2, 0)
      break
    case 'wall':
      target.push(geometry.lengthMeters / 2, geometry.heightMeters / 2,
        geometry.thicknessMeters / 2, 0)
      break
    case 'cylinder':
      target.push(geometry.radiusMeters, geometry.heightMeters / 2, 0, 0)
      break
    case 'canopy':
      target.push(geometry.eastRadiusMeters, geometry.verticalRadiusMeters,
        geometry.northRadiusMeters, 0)
      break
    case 'polygonExtrusion':
      target.push(geometry.heightMeters / 2, 0, 0, 0)
      break
  }
}

function writeBounds(target: number[], bounds: Bounds3): void {
  // Float32 conversion can otherwise round a bound inward and incorrectly cull
  // a grazing ray. Pad relative to scene magnitude before packing.
  const magnitude = Math.max(
    1,
    Math.abs(bounds.minEastMeters),
    Math.abs(bounds.maxEastMeters),
    Math.abs(bounds.minNorthMeters),
    Math.abs(bounds.maxNorthMeters),
    Math.abs(bounds.minElevationMeters),
    Math.abs(bounds.maxElevationMeters),
  )
  const padding = Math.max(1e-5, magnitude * 1e-6)
  target.push(
    bounds.minEastMeters - padding,
    bounds.minElevationMeters - padding,
    -bounds.maxNorthMeters - padding,
    bounds.maxEastMeters + padding,
    bounds.maxElevationMeters + padding,
    -bounds.minNorthMeters + padding,
  )
}

interface MutableBvh {
  readonly bounds: number[]
  readonly nodes: number[]
  readonly primitiveIndices: number[]
}

function boundsUnion(
  primitives: readonly PackedPrimitive[],
  indices: readonly number[],
): Bounds3 {
  return indices.reduce<Bounds3>((result, index) => {
    const bounds = primitives[index].bounds
    return {
      minEastMeters: Math.min(result.minEastMeters, bounds.minEastMeters),
      maxEastMeters: Math.max(result.maxEastMeters, bounds.maxEastMeters),
      minNorthMeters: Math.min(result.minNorthMeters, bounds.minNorthMeters),
      maxNorthMeters: Math.max(result.maxNorthMeters, bounds.maxNorthMeters),
      minElevationMeters: Math.min(
        result.minElevationMeters,
        bounds.minElevationMeters,
      ),
      maxElevationMeters: Math.max(
        result.maxElevationMeters,
        bounds.maxElevationMeters,
      ),
    }
  }, {
    minEastMeters: Number.POSITIVE_INFINITY,
    maxEastMeters: Number.NEGATIVE_INFINITY,
    minNorthMeters: Number.POSITIVE_INFINITY,
    maxNorthMeters: Number.NEGATIVE_INFINITY,
    minElevationMeters: Number.POSITIVE_INFINITY,
    maxElevationMeters: Number.NEGATIVE_INFINITY,
  })
}

function buildBvhNode(
  bvh: MutableBvh,
  primitives: readonly PackedPrimitive[],
  indices: readonly number[],
): number {
  const nodeIndex = bvh.nodes.length / GPU_BVH_NODE_STRIDE
  bvh.nodes.push(GPU_BVH_NO_NODE, GPU_BVH_NO_NODE, 0, 0)
  const nodeBounds = boundsUnion(primitives, indices)
  writeBounds(bvh.bounds, nodeBounds)

  if (indices.length <= 4) {
    const first = bvh.primitiveIndices.length
    bvh.primitiveIndices.push(...indices)
    bvh.nodes[nodeIndex * GPU_BVH_NODE_STRIDE + 2] = first
    bvh.nodes[nodeIndex * GPU_BVH_NODE_STRIDE + 3] = indices.length
    return nodeIndex
  }

  const spans = [
    nodeBounds.maxEastMeters - nodeBounds.minEastMeters,
    nodeBounds.maxElevationMeters - nodeBounds.minElevationMeters,
    nodeBounds.maxNorthMeters - nodeBounds.minNorthMeters,
  ]
  const axis = spans.indexOf(Math.max(...spans))
  const center = (index: number) => {
    const bounds = primitives[index].bounds
    if (axis === 0) return bounds.minEastMeters + bounds.maxEastMeters
    if (axis === 1) {
      return bounds.minElevationMeters + bounds.maxElevationMeters
    }
    return bounds.minNorthMeters + bounds.maxNorthMeters
  }
  const sorted = [...indices].sort((left, right) =>
    center(left) - center(right) ||
    primitives[left].sourceIndex - primitives[right].sourceIndex,
  )
  const midpoint = Math.floor(sorted.length / 2)
  const left = buildBvhNode(bvh, primitives, sorted.slice(0, midpoint))
  const right = buildBvhNode(bvh, primitives, sorted.slice(midpoint))
  bvh.nodes[nodeIndex * GPU_BVH_NODE_STRIDE] = left
  bvh.nodes[nodeIndex * GPU_BVH_NODE_STRIDE + 1] = right
  return nodeIndex
}

export function packGpuSceneGeometry(
  entities: readonly PrimitiveEntity[],
): GpuSceneGeometry {
  const polygonVertices: number[] = []
  const primitives: PackedPrimitive[] = []
  entities.forEach((entity, sourceIndex) => {
    if (getPrimitiveSolarOptics(entity).mode === 'ignored') return
    const polygonOffset = polygonVertices.length / 2
    if (entity.geometry.kind === 'polygonExtrusion') {
      entity.geometry.footprint.forEach((point) => {
        polygonVertices.push(point.eastMeters, -point.northMeters)
      })
    }
    primitives.push({
      entity,
      sourceIndex,
      bounds: conservativePrimitiveBounds(entity),
      polygonOffset,
      polygonCount: entity.geometry.kind === 'polygonExtrusion'
        ? entity.geometry.footprint.length
        : 0,
    })
  })

  const transforms: number[] = []
  const parameters: number[] = []
  const transmittances: number[] = []
  const polygonRanges: number[] = []
  primitives.forEach(({ entity, polygonOffset, polygonCount }) => {
    const position = entity.transform.position
    transforms.push(position.eastMeters, position.elevationMeters,
      -position.northMeters, ...inverseRotationRows(entity))
    writePrimitiveParameters(parameters, entity)
    const optics = getPrimitiveSolarOptics(entity)
    transmittances.push(
      optics.mode === 'transmissive' ? optics.transmittance : 0,
    )
    polygonRanges.push(polygonOffset, polygonCount)
  })

  const bvh: MutableBvh = { bounds: [], nodes: [], primitiveIndices: [] }
  if (primitives.length > 0) {
    buildBvhNode(bvh, primitives, primitives.map((_, index) => index))
  }
  return {
    formatVersion: GPU_SCENE_FORMAT_VERSION,
    entityIds: primitives.map(({ entity }) => entity.id),
    primitiveKinds: Uint32Array.from(primitives.map(({ entity }) =>
      GPU_PRIMITIVE_KIND[entity.geometry.kind]
    )),
    primitiveTransforms: Float32Array.from(transforms),
    primitiveParameters: Float32Array.from(parameters),
    primitiveTransmittances: Float32Array.from(transmittances),
    polygonRanges: Uint32Array.from(polygonRanges),
    polygonVertices: Float32Array.from(polygonVertices),
    bvhBounds: Float32Array.from(bvh.bounds),
    bvhNodes: Uint32Array.from(bvh.nodes),
    bvhPrimitiveIndices: Uint32Array.from(bvh.primitiveIndices),
  }
}

function rayIntersectsNodeBounds(
  ray: Ray,
  bounds: Float32Array,
  nodeIndex: number,
): boolean {
  const start = nodeIndex * GPU_BVH_BOUNDS_STRIDE
  let near = Number.NEGATIVE_INFINITY
  let far = Number.POSITIVE_INFINITY
  for (let axis = 0; axis < 3; axis += 1) {
    const origin = axis === 0
      ? ray.origin.x
      : axis === 1 ? ray.origin.y : ray.origin.z
    const direction = axis === 0
      ? ray.direction.x
      : axis === 1 ? ray.direction.y : ray.direction.z
    const minimum = bounds[start + axis]
    const maximum = bounds[start + axis + 3]
    if (Math.abs(direction) < Number.EPSILON) {
      if (origin < minimum || origin > maximum) return false
      continue
    }
    const first = (minimum - origin) / direction
    const second = (maximum - origin) / direction
    near = Math.max(near, Math.min(first, second))
    far = Math.min(far, Math.max(first, second))
    if (near > far) return false
  }
  return far > 1e-6
}

/** Conservative iterative traversal mirroring the planned compute shader. */
export function queryGpuBvhCandidates(
  scene: GpuSceneGeometry,
  ray: Ray,
): number[] {
  if (scene.bvhNodes.length === 0) return []
  const result: number[] = []
  const stack = [0]
  while (stack.length > 0) {
    const nodeIndex = stack.pop()!
    if (!rayIntersectsNodeBounds(ray, scene.bvhBounds, nodeIndex)) continue
    const offset = nodeIndex * GPU_BVH_NODE_STRIDE
    const count = scene.bvhNodes[offset + 3]
    if (count > 0) {
      const first = scene.bvhNodes[offset + 2]
      for (let index = 0; index < count; index += 1) {
        result.push(scene.bvhPrimitiveIndices[first + index])
      }
      continue
    }
    const left = scene.bvhNodes[offset]
    const right = scene.bvhNodes[offset + 1]
    if (right !== GPU_BVH_NO_NODE) stack.push(right)
    if (left !== GPU_BVH_NO_NODE) stack.push(left)
  }
  return result
}
