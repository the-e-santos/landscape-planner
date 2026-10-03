import { describe, expect, it } from 'vitest'
import type { PrimitiveEntity, PrimitiveGeometry } from '../domain/primitive'
import {
  CPU_VISIBILITY_BATCH_EXECUTOR,
  NO_BLOCKING_PRIMITIVE,
  NO_EXCLUDED_PRIMITIVE,
  packVisibilityRayBatch,
  tracePackedVisibilityBatch,
} from './batchedVisibility'
import { packGpuSceneGeometry } from './gpuScene'
import {
  tracePrimitiveTransmission,
  type Ray,
} from './rayVisibility'

function primitive(
  id: string,
  geometry: PrimitiveGeometry,
  position: { x: number; y: number; z: number },
  solarOptics: PrimitiveEntity['solarOptics'] = { mode: 'opaque' },
  yaw = 0,
): PrimitiveEntity {
  return {
    id,
    kind: 'primitive',
    name: id,
    transform: {
      position: {
        eastMeters: position.x,
        elevationMeters: position.y,
        northMeters: -position.z,
      },
      rotation: { xRadians: 0, yRadians: yaw, zRadians: 0 },
    },
    geometry,
    solarOptics,
  }
}

describe('packed batched visibility', () => {
  it('matches ordered opaque and transmissive CPU reference results', () => {
    const entities: PrimitiveEntity[] = [
      primitive('screen.50', {
        kind: 'box', widthMeters: 4, heightMeters: 0.1, depthMeters: 4,
      }, { x: 0, y: 1, z: 0 }, {
        mode: 'transmissive', transmittance: 0.5,
      }),
      primitive('screen.40', {
        kind: 'cylinder', radiusMeters: 2, heightMeters: 0.1,
      }, { x: 0, y: 2, z: 0 }, {
        mode: 'transmissive', transmittance: 0.4,
      }),
      primitive('opaque', {
        kind: 'canopy', eastRadiusMeters: 2,
        verticalRadiusMeters: 0.1, northRadiusMeters: 2,
      }, { x: 0, y: 3, z: 0 }),
    ]
    const rays: readonly Ray[] = [
      { origin: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 1, z: 0 } },
      { origin: { x: 3, y: 0, z: 0 }, direction: { x: 0, y: 1, z: 0 } },
    ]
    const scene = packGpuSceneGeometry(entities)
    const result = tracePackedVisibilityBatch(
      scene,
      packVisibilityRayBatch(scene, rays.map((ray) => ({ ray }))),
    )

    expect([...result.transmissions]).toEqual([0, 1])
    expect(scene.entityIds[result.blockedByPrimitiveIndices[0]])
      .toBe('opaque')
    expect(result.blockedByPrimitiveIndices[1]).toBe(NO_BLOCKING_PRIMITIVE)
  })

  it('packs owning-entity exclusions as shader-compatible indices', () => {
    const entity = primitive('owner', {
      kind: 'box', widthMeters: 2, heightMeters: 2, depthMeters: 2,
    }, { x: 0, y: 0, z: 0 })
    const ray: Ray = {
      origin: { x: 0, y: 0, z: 0 },
      direction: { x: 0, y: 1, z: 0 },
    }
    const scene = packGpuSceneGeometry([entity])
    const batch = packVisibilityRayBatch(scene, [
      { ray, excludedEntityId: 'owner' },
      { ray, excludedEntityId: 'not-in-packed-scene' },
    ])
    const result = tracePackedVisibilityBatch(scene, batch)

    expect([...batch.excludedPrimitiveIndices]).toEqual([
      0,
      NO_EXCLUDED_PRIMITIVE,
    ])
    expect([...result.transmissions]).toEqual([1, 0])
  })

  it('agrees with the reference solver for seeded mixed-scene rays', () => {
    let state = 0x5eed1234
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0
      return state / 0x100000000
    }
    const geometry = (index: number): PrimitiveGeometry => {
      switch (index % 5) {
        case 0:
          return { kind: 'box', widthMeters: 2, heightMeters: 2, depthMeters: 2 }
        case 1:
          return { kind: 'cylinder', radiusMeters: 1.1, heightMeters: 2.5 }
        case 2:
          return {
            kind: 'wall', structure: 'fence', lengthMeters: 3,
            heightMeters: 2, thicknessMeters: 0.2,
          }
        case 3:
          return {
            kind: 'polygonExtrusion',
            footprint: [
              { eastMeters: -1, northMeters: -0.8 },
              { eastMeters: 1.2, northMeters: -0.7 },
              { eastMeters: 0.8, northMeters: 1 },
              { eastMeters: -0.9, northMeters: 0.9 },
            ],
            heightMeters: 2,
          }
        default:
          return {
            kind: 'canopy', eastRadiusMeters: 1.2,
            verticalRadiusMeters: 0.8, northRadiusMeters: 1,
          }
      }
    }
    const entities = Array.from({ length: 30 }, (_, index) => primitive(
      `entity.${index.toString().padStart(2, '0')}`,
      geometry(index),
      {
        x: (random() - 0.5) * 24,
        y: 1 + random() * 5,
        z: (random() - 0.5) * 24,
      },
      index % 4 === 0
        ? { mode: 'transmissive', transmittance: 0.25 + random() * 0.7 }
        : { mode: 'opaque' },
      (random() - 0.5) * Math.PI,
    ))
    const requests = Array.from({ length: 200 }, (_, index) => {
      const direction = {
        x: (random() - 0.5) * 0.8,
        y: 0.2 + random(),
        z: (random() - 0.5) * 0.8,
      }
      const length = Math.hypot(direction.x, direction.y, direction.z)
      return {
        ray: {
          origin: {
            x: (random() - 0.5) * 30,
            y: random() * 2,
            z: (random() - 0.5) * 30,
          },
          direction: {
            x: direction.x / length,
            y: direction.y / length,
            z: direction.z / length,
          },
        },
        ...(index % 11 === 0
          ? { excludedEntityId: entities[index % entities.length].id }
          : {}),
      }
    })
    const scene = packGpuSceneGeometry(entities)
    const batch = packVisibilityRayBatch(scene, requests)
    const result = tracePackedVisibilityBatch(scene, batch)

    requests.forEach((request, index) => {
      const reference = tracePrimitiveTransmission(
        request.ray,
        entities,
        request.excludedEntityId,
      )
      expect(result.transmissions[index]).toBeCloseTo(
        reference.transmission,
        5,
      )
      const packedBlocker = result.blockedByPrimitiveIndices[index]
      expect(
        packedBlocker === NO_BLOCKING_PRIMITIVE
          ? undefined
          : scene.entityIds[packedBlocker],
      ).toBe(reference.blockedByEntityId)
    })
  })

  it('rejects invalid rays and inconsistent packed buffers', () => {
    const scene = packGpuSceneGeometry([])
    expect(() => packVisibilityRayBatch(scene, [{
      ray: {
        origin: { x: 0, y: 0, z: 0 },
        direction: { x: 0, y: 0, z: 0 },
      },
    }])).toThrow('nonzero')
    expect(() => tracePackedVisibilityBatch(scene, {
      origins: new Float32Array(4),
      directions: new Float32Array(0),
      excludedPrimitiveIndices: new Uint32Array(1),
    })).toThrow('inconsistent lengths')
  })

  it('exposes the CPU implementation through the async executor contract', async () => {
    const scene = packGpuSceneGeometry([])
    const batch = packVisibilityRayBatch(scene, [{
      ray: {
        origin: { x: 0, y: 0, z: 0 },
        direction: { x: 0, y: 1, z: 0 },
      },
    }])
    expect(CPU_VISIBILITY_BATCH_EXECUTOR.backend).toBe('cpu')
    expect([
      ...(await CPU_VISIBILITY_BATCH_EXECUTOR.execute(scene, batch))
        .transmissions,
    ]).toEqual([1])
  })
})
