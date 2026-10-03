import { describe, expect, it } from 'vitest'
import type { PrimitiveEntity, PrimitiveGeometry } from '../domain/primitive'
import {
  GPU_BVH_BOUNDS_STRIDE,
  GPU_BVH_NODE_STRIDE,
  GPU_PRIMITIVE_PARAMETER_STRIDE,
  GPU_PRIMITIVE_TRANSFORM_STRIDE,
  packGpuSceneGeometry,
  queryGpuBvhCandidates,
} from './gpuScene'
import { intersectPrimitive, type Ray } from './rayVisibility'

function primitive(
  id: string,
  geometry: PrimitiveGeometry,
  eastMeters: number,
  solarOptics: PrimitiveEntity['solarOptics'] = { mode: 'opaque' },
): PrimitiveEntity {
  return {
    id,
    kind: 'primitive',
    name: id,
    transform: {
      position: { eastMeters, elevationMeters: 2, northMeters: 0 },
      rotation: { xRadians: 0, yRadians: eastMeters / 10, zRadians: 0 },
    },
    geometry,
    solarOptics,
  }
}

const geometries: readonly PrimitiveGeometry[] = [
  { kind: 'box', widthMeters: 2, heightMeters: 2, depthMeters: 2 },
  { kind: 'cylinder', radiusMeters: 1, heightMeters: 2 },
  {
    kind: 'wall', structure: 'fence', lengthMeters: 3,
    heightMeters: 2, thicknessMeters: 0.1,
  },
  {
    kind: 'polygonExtrusion',
    footprint: [
      { eastMeters: -1, northMeters: -1 },
      { eastMeters: 1, northMeters: -1 },
      { eastMeters: 1, northMeters: 1 },
      { eastMeters: -1, northMeters: 1 },
    ],
    heightMeters: 2,
  },
  {
    kind: 'canopy', eastRadiusMeters: 1,
    verticalRadiusMeters: 1, northRadiusMeters: 1,
  },
]

describe('GPU-ready scene geometry', () => {
  it('packs every solar occluder into transferable storage arrays', () => {
    const entities = geometries.map((geometry, index) =>
      primitive(`entity.${index}`, geometry, index * 4)
    )
    entities.push(primitive('ignored', geometries[0], 30, { mode: 'ignored' }))
    const scene = packGpuSceneGeometry(entities)

    expect(scene.entityIds).toEqual(entities.slice(0, -1).map(({ id }) => id))
    expect(scene.primitiveKinds).toHaveLength(geometries.length)
    expect(scene.primitiveTransforms).toHaveLength(
      geometries.length * GPU_PRIMITIVE_TRANSFORM_STRIDE,
    )
    expect(scene.primitiveParameters).toHaveLength(
      geometries.length * GPU_PRIMITIVE_PARAMETER_STRIDE,
    )
    expect(scene.polygonVertices).toHaveLength(8)
    expect(scene.bvhNodes.length % GPU_BVH_NODE_STRIDE).toBe(0)
    expect(scene.bvhBounds.length).toBe(
      scene.bvhNodes.length / GPU_BVH_NODE_STRIDE * GPU_BVH_BOUNDS_STRIDE,
    )
    expect(() => structuredClone(scene)).not.toThrow()
  })

  it('returns every reference hit as a conservative BVH candidate', () => {
    const entities = geometries.flatMap((geometry, geometryIndex) =>
      [-12, -6, 0, 6, 12].map((eastMeters, positionIndex) =>
        primitive(`${geometryIndex}.${positionIndex}`, geometry, eastMeters)
      )
    )
    const scene = packGpuSceneGeometry(entities)
    const rays: readonly Ray[] = [-12, -6, 0, 6, 12, 30].map((x) => ({
      origin: { x, y: 0, z: 0 },
      direction: { x: 0, y: 1, z: 0 },
    }))

    rays.forEach((ray) => {
      const candidateIds = new Set(
        queryGpuBvhCandidates(scene, ray).map((index) => scene.entityIds[index]),
      )
      entities
        .filter((entity) => intersectPrimitive(ray, entity) !== undefined)
        .forEach(({ id }) => expect(candidateIds).toContain(id))
    })
  })

  it('handles an empty scene without a sentinel root node', () => {
    const scene = packGpuSceneGeometry([])
    expect(scene.bvhNodes).toHaveLength(0)
    expect(queryGpuBvhCandidates(scene, {
      origin: { x: 0, y: 0, z: 0 },
      direction: { x: 0, y: 1, z: 0 },
    })).toEqual([])
  })
})
