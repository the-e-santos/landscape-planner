import { describe, expect, it } from 'vitest'
import {
  clonePrimitiveEntity,
  createDefaultHouseEntity,
  getPrimitiveSolarOptics,
  insertPolygonExtrusionMidpoint,
  MIN_PRIMITIVE_DIMENSION_METERS,
  resizePrimitiveGeometry,
  snapPrimitiveGeometryDimensions,
  validatePolygonExtrusionFootprint,
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
    }))).toThrow('must have a nonzero area')
  })

  it('rejects clockwise and self-intersecting extrusion footprints', () => {
    expect(() => validatePolygonExtrusionFootprint([
      { eastMeters: -1, northMeters: -1 },
      { eastMeters: 0, northMeters: 1 },
      { eastMeters: 1, northMeters: -1 },
    ])).toThrow('vertices must be counterclockwise')

    expect(() => validatePolygonExtrusionFootprint([
      { eastMeters: -1, northMeters: -1 },
      { eastMeters: 1, northMeters: 1 },
      { eastMeters: -1, northMeters: 1 },
      { eastMeters: 1, northMeters: -1 },
    ])).toThrow('footprint must not self-intersect')
  })

  it('inserts a midpoint without changing polygon area or winding', () => {
    const footprint = validGeometries[3].kind === 'polygonExtrusion'
      ? validGeometries[3].footprint
      : []
    const withMidpoint = insertPolygonExtrusionMidpoint(footprint, 0)

    expect(withMidpoint).toEqual([
      { eastMeters: -1, northMeters: -1 },
      { eastMeters: 0, northMeters: -1 },
      { eastMeters: 1, northMeters: -1 },
      { eastMeters: 0, northMeters: 1 },
    ])
    expect(() => validatePolygonExtrusionFootprint(withMidpoint)).not.toThrow()
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

  it('resizes each parametric geometry without introducing persisted scale', () => {
    expect(resizePrimitiveGeometry(validGeometries[0], {
      x: 2,
      y: 0.5,
      z: 3,
    })).toEqual({
      kind: 'box',
      widthMeters: 4,
      heightMeters: 0.5,
      depthMeters: 9,
    })
    expect(resizePrimitiveGeometry(validGeometries[1], {
      x: 0.5,
      y: 2,
      z: 1,
    })).toEqual({
      kind: 'cylinder',
      radiusMeters: 0.5,
      heightMeters: 4,
    })
    expect(resizePrimitiveGeometry(validGeometries[2], {
      x: 2,
      y: 0.5,
      z: 3,
    })).toEqual({
      kind: 'wall',
      structure: 'fence',
      lengthMeters: 8,
      heightMeters: 0.9,
      thicknessMeters: 0.24,
    })
    expect(resizePrimitiveGeometry(validGeometries[3], {
      x: 2,
      y: 2,
      z: 3,
    })).toEqual({
      kind: 'polygonExtrusion',
      footprint: [
        { eastMeters: -2, northMeters: -3 },
        { eastMeters: 2, northMeters: -3 },
        { eastMeters: 0, northMeters: 3 },
      ],
      heightMeters: 1,
    })
    expect(resizePrimitiveGeometry(validGeometries[4], {
      x: 2,
      y: 0.5,
      z: 3,
    })).toEqual({
      kind: 'canopy',
      eastRadiusMeters: 4,
      verticalRadiusMeters: 0.75,
      northRadiusMeters: 5.25,
    })
  })

  it('prevents resize gestures from collapsing a dimension to zero', () => {
    const resized = resizePrimitiveGeometry(validGeometries[0], {
      x: 0,
      y: 0,
      z: 0,
    })

    expect(resized).toEqual({
      kind: 'box',
      widthMeters: MIN_PRIMITIVE_DIMENSION_METERS,
      heightMeters: MIN_PRIMITIVE_DIMENSION_METERS,
      depthMeters: MIN_PRIMITIVE_DIMENSION_METERS,
    })
  })

  it('optionally preserves proportions using the dominant resize axis', () => {
    expect(resizePrimitiveGeometry(
      validGeometries[0],
      { x: 2, y: 0.5, z: 1.2 },
      true,
    )).toEqual({
      kind: 'box',
      widthMeters: 4,
      heightMeters: 2,
      depthMeters: 6,
    })
    expect(resizePrimitiveGeometry(
      validGeometries[4],
      { x: 1, y: 2, z: 0.75 },
      true,
    )).toEqual({
      kind: 'canopy',
      eastRadiusMeters: 4,
      verticalRadiusMeters: 3,
      northRadiusMeters: 3.5,
    })
  })

  it('snaps authoritative dimensions in physical units', () => {
    const box: PrimitiveGeometry = {
      kind: 'box',
      widthMeters: 2.24,
      heightMeters: 1.26,
      depthMeters: 3.04,
    }
    expect(snapPrimitiveGeometryDimensions(box, 0.1)).toEqual({
      kind: 'box',
      widthMeters: 2.2,
      heightMeters: 1.3,
      depthMeters: 3,
    })
    expect(snapPrimitiveGeometryDimensions({
      kind: 'cylinder',
      radiusMeters: 0.74,
      heightMeters: 2.26,
    }, 0.1)).toEqual({
      kind: 'cylinder',
      radiusMeters: 0.7,
      heightMeters: 2.3,
    })
    expect(snapPrimitiveGeometryDimensions({
      kind: 'wall',
      structure: 'fence',
      lengthMeters: 4.24,
      heightMeters: 1.76,
      thicknessMeters: 0.12,
    }, 0.1)).toEqual({
      kind: 'wall',
      structure: 'fence',
      lengthMeters: 4.2,
      heightMeters: 1.8,
      thicknessMeters: 0.1,
    })
    expect(snapPrimitiveGeometryDimensions({
      kind: 'canopy',
      eastRadiusMeters: 2.24,
      verticalRadiusMeters: 1.46,
      northRadiusMeters: 1.84,
    }, 0.1)).toEqual({
      kind: 'canopy',
      eastRadiusMeters: 2.2,
      verticalRadiusMeters: 1.5,
      northRadiusMeters: 1.8,
    })

    const polygon = snapPrimitiveGeometryDimensions({
      kind: 'polygonExtrusion',
      footprint: [
        { eastMeters: -1.12, northMeters: -0.63 },
        { eastMeters: 1.12, northMeters: -0.63 },
        { eastMeters: 0, northMeters: 0.63 },
      ],
      heightMeters: 0.63,
    }, 0.1)
    expect(polygon.kind).toBe('polygonExtrusion')
    if (polygon.kind === 'polygonExtrusion') {
      const eastValues = polygon.footprint.map(({ eastMeters }) => eastMeters)
      const northValues = polygon.footprint.map(({ northMeters }) => northMeters)
      expect(Math.max(...eastValues) - Math.min(...eastValues)).toBeCloseTo(2.2)
      expect(Math.max(...northValues) - Math.min(...northValues)).toBeCloseTo(1.3)
      expect(polygon.heightMeters).toBe(0.6)
    }
  })

  it('rejects invalid physical resize snap increments', () => {
    expect(() => snapPrimitiveGeometryDimensions(
      validGeometries[0],
      0,
    )).toThrow('Resize snap increment must be a positive finite number')
  })

  it('keeps proportions locked while snapping a reference extent', () => {
    const snapped = snapPrimitiveGeometryDimensions({
      kind: 'box',
      widthMeters: 2.26,
      heightMeters: 1.13,
      depthMeters: 3.39,
    }, 0.1, true)

    expect(snapped.kind).toBe('box')
    if (snapped.kind === 'box') {
      expect(snapped.depthMeters).toBeCloseTo(3.4)
      expect(snapped.widthMeters / snapped.heightMeters).toBeCloseTo(2)
      expect(snapped.depthMeters / snapped.heightMeters).toBeCloseTo(3)
    }
  })
})
