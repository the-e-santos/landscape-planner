import { describe, expect, it } from 'vitest'
import type { PrimitiveEntity, PrimitiveGeometry } from '../domain/primitive'
import {
  intersectPrimitive,
  tracePrimitiveTransmission,
  type Ray,
} from './rayVisibility'

function primitive(
  id: string,
  geometry: PrimitiveGeometry,
  elevationMeters = 2,
): PrimitiveEntity {
  return {
    id,
    kind: 'primitive',
    name: id,
    transform: {
      position: { eastMeters: 0, elevationMeters, northMeters: 0 },
      rotation: { xRadians: 0, yRadians: 0, zRadians: 0 },
    },
    geometry,
    solarOptics: { mode: 'opaque' },
  }
}

const upwardRay: Ray = {
  origin: { x: 0, y: 0, z: 0 },
  direction: { x: 0, y: 1, z: 0 },
}

describe('CPU primitive ray visibility', () => {
  it.each([
    ['box', { kind: 'box', widthMeters: 2, heightMeters: 1, depthMeters: 2 }],
    ['cylinder', { kind: 'cylinder', radiusMeters: 1, heightMeters: 1 }],
    ['wall', {
      kind: 'wall', structure: 'wall', lengthMeters: 2,
      heightMeters: 1, thicknessMeters: 0.2,
    }],
    ['polygon extrusion', {
      kind: 'polygonExtrusion',
      footprint: [
        { eastMeters: -1, northMeters: -1 },
        { eastMeters: 1, northMeters: -1 },
        { eastMeters: 1, northMeters: 1 },
        { eastMeters: -1, northMeters: 1 },
      ],
      heightMeters: 1,
    }],
    ['canopy', {
      kind: 'canopy', eastRadiusMeters: 1,
      verticalRadiusMeters: 0.5, northRadiusMeters: 1,
    }],
  ] satisfies readonly (readonly [string, PrimitiveGeometry])[])(
    'intersects an overhead %s analytically',
    (_label, geometry) => {
      expect(intersectPrimitive(upwardRay, primitive('target', geometry)))
        .toBeCloseTo(1.5, 8)
    },
  )

  it('supports rotated primitives and misses a ray outside the shape', () => {
    const wall = {
      ...primitive('wall', {
        kind: 'wall', structure: 'wall', lengthMeters: 4,
        heightMeters: 2, thicknessMeters: 0.2,
      }, 1),
      transform: {
        position: { eastMeters: 2, elevationMeters: 1, northMeters: 0 },
        rotation: { xRadians: 0, yRadians: Math.PI / 2, zRadians: 0 },
      },
    } satisfies PrimitiveEntity
    expect(intersectPrimitive({
      origin: { x: 2, y: 1, z: -3 },
      direction: { x: 0, y: 0, z: 1 },
    }, wall)).toBeCloseTo(1, 8)
    expect(intersectPrimitive({
      origin: { x: 0, y: 4, z: 0 },
      direction: { x: 1, y: 0, z: 0 },
    }, wall)).toBeUndefined()
  })

  it('multiplies one constant transmittance per ordered occluder', () => {
    const first = {
      ...primitive('screen.50', {
        kind: 'box', widthMeters: 2, heightMeters: 0.1, depthMeters: 2,
      }, 1),
      solarOptics: { mode: 'transmissive', transmittance: 0.5 },
    } satisfies PrimitiveEntity
    const second = {
      ...primitive('screen.40', {
        kind: 'box', widthMeters: 2, heightMeters: 0.1, depthMeters: 2,
      }, 2),
      solarOptics: { mode: 'transmissive', transmittance: 0.4 },
    } satisfies PrimitiveEntity
    const result = tracePrimitiveTransmission(upwardRay, [second, first])

    expect(result.transmission).toBeCloseTo(0.2, 12)
    expect(result.crossings.map(({ entityId }) => entityId)).toEqual([
      'screen.50',
      'screen.40',
    ])
  })

  it('stops at opaque objects and ignores ignored or excluded objects', () => {
    const opaque = primitive('opaque', {
      kind: 'box', widthMeters: 2, heightMeters: 0.2, depthMeters: 2,
    }, 2)
    const ignored = {
      ...primitive('ignored', opaque.geometry, 1),
      solarOptics: { mode: 'ignored' },
    } satisfies PrimitiveEntity

    expect(tracePrimitiveTransmission(upwardRay, [ignored, opaque])).toMatchObject({
      transmission: 0,
      blockedByEntityId: 'opaque',
    })
    expect(tracePrimitiveTransmission(upwardRay, [opaque], 'opaque')).toEqual({
      transmission: 1,
      crossings: [],
    })
  })

  it('does not self-hit when a ray starts just above a surface', () => {
    const box = primitive('box', {
      kind: 'box', widthMeters: 2, heightMeters: 2, depthMeters: 2,
    }, 0)
    expect(intersectPrimitive({
      origin: { x: 0, y: 1 + 1e-8, z: 0 },
      direction: { x: 0, y: 1, z: 0 },
    }, box)).toBeUndefined()
  })

  it('reproduces a 10 m pole shadow at 45° solar altitude', () => {
    const pole = primitive('ten-meter-pole', {
      kind: 'box', widthMeters: 0.02, heightMeters: 10, depthMeters: 0.02,
    }, 5)
    const direction = { x: Math.SQRT1_2, y: Math.SQRT1_2, z: 0 }

    expect(intersectPrimitive({
      origin: { x: -10, y: 0, z: 0 },
      direction,
    }, pole)).toBeDefined()
    expect(intersectPrimitive({
      origin: { x: -10.03, y: 0, z: 0 },
      direction,
    }, pole)).toBeUndefined()
  })
})
