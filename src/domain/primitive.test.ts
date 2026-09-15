import { describe, expect, it } from 'vitest'
import {
  clonePrimitiveEntity,
  createDefaultHouseEntity,
  getPrimitiveSolarOptics,
  validatePrimitiveEntity,
  type PrimitiveEntity,
  type PrimitiveGeometry,
} from './primitive'

function createPrimitive(geometry: PrimitiveGeometry): PrimitiveEntity {
  return {
    id: `primitive.${geometry.kind}.test`,
    kind: 'primitive',
    name: 'Test primitive',
    transform: {
      position: { eastMeters: 0, elevationMeters: 1, northMeters: 0 },
      rotation: { xRadians: 0, yRadians: 0, zRadians: 0 },
    },
    geometry,
  }
}

const validGeometries: readonly PrimitiveGeometry[] = [
  { kind: 'box', widthMeters: 2, heightMeters: 1, depthMeters: 3 },
  { kind: 'cylinder', radiusMeters: 1, heightMeters: 2 },
  {
    kind: 'wall',
    structure: 'fence',
    lengthMeters: 4,
    heightMeters: 1.8,
    thicknessMeters: 0.08,
  },
  {
    kind: 'polygonExtrusion',
    footprint: [
      { eastMeters: -1, northMeters: -1 },
      { eastMeters: 1, northMeters: -1 },
      { eastMeters: 0, northMeters: 1 },
    ],
    heightMeters: 0.5,
  },
  {
    kind: 'canopy',
    eastRadiusMeters: 2,
    verticalRadiusMeters: 1.5,
    northRadiusMeters: 1.75,
  },
]

describe('primitive domain model', () => {
  it.each(validGeometries.map((geometry) => [geometry.kind, geometry] as const))(
    'accepts valid %s geometry',
    (_kind, geometry) => {
      expect(() => validatePrimitiveEntity(createPrimitive(geometry))).not.toThrow()
    },
  )

  it('rejects degenerate polygon extrusion footprints', () => {
    expect(() => validatePrimitiveEntity(createPrimitive({
      kind: 'polygonExtrusion',
      footprint: [
        { eastMeters: 0, northMeters: 0 },
        { eastMeters: 1, northMeters: 0 },
        { eastMeters: 2, northMeters: 0 },
      ],
      heightMeters: 1,
    }))).toThrow('counterclockwise with a nonzero area')
  })

  it('deep-clones polygon footprint vertices', () => {
    const original = createPrimitive(validGeometries[3])
    const clone = clonePrimitiveEntity(original)

    expect(clone).toEqual(original)
    expect(clone.geometry).not.toBe(original.geometry)
    if (
      clone.geometry.kind === 'polygonExtrusion' &&
      original.geometry.kind === 'polygonExtrusion'
    ) {
      expect(clone.geometry.footprint).not.toBe(original.geometry.footprint)
      expect(clone.geometry.footprint[0]).not.toBe(original.geometry.footprint[0])
    }
  })

  it('defaults early schema-v1 primitives without solar optics to opaque', () => {
    const primitive = createPrimitive(validGeometries[0])

    expect(getPrimitiveSolarOptics(primitive)).toEqual({ mode: 'opaque' })
    expect(createDefaultHouseEntity().solarOptics).toEqual({ mode: 'opaque' })
  })

  it('accepts bounded transmittance and rejects values outside zero to one', () => {
    const primitive = createPrimitive(validGeometries[4])

    expect(() => validatePrimitiveEntity({
      ...primitive,
      solarOptics: { mode: 'transmissive', transmittance: 0 },
    })).not.toThrow()
    expect(() => validatePrimitiveEntity({
      ...primitive,
      solarOptics: { mode: 'transmissive', transmittance: 1 },
    })).not.toThrow()
    expect(() => validatePrimitiveEntity({
      ...primitive,
      solarOptics: { mode: 'transmissive', transmittance: 1.01 },
    })).toThrow('Solar transmittance must be between zero and one')
    expect(() => validatePrimitiveEntity({
      ...primitive,
      solarOptics: { mode: 'transmissive', transmittance: Number.NaN },
    })).toThrow('Solar transmittance must be between zero and one')
  })

  it('clones solar optics independently from the source entity', () => {
    const original: PrimitiveEntity = {
      ...createPrimitive(validGeometries[4]),
      solarOptics: { mode: 'transmissive', transmittance: 0.35 },
    }
    const clone = clonePrimitiveEntity(original)

    expect(clone.solarOptics).toEqual(original.solarOptics)
    expect(clone.solarOptics).not.toBe(original.solarOptics)
  })
})
