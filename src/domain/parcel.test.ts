import { describe, expect, it } from 'vitest'
import {
  createRectangleVertices,
  getParcelBounds,
  insertParcelMidpoint,
} from './parcel'

describe('parcel geometry', () => {
  it('creates a centered rectangle in east/north coordinates', () => {
    const vertices = createRectangleVertices(20, 30)

    expect(vertices).toEqual([
      { eastMeters: -10, northMeters: -15 },
      { eastMeters: 10, northMeters: -15 },
      { eastMeters: 10, northMeters: 15 },
      { eastMeters: -10, northMeters: 15 },
    ])
  })

  it('calculates bounds for an irregular polygon', () => {
    const bounds = getParcelBounds([
      { eastMeters: -4, northMeters: 8 },
      { eastMeters: 12, northMeters: -3 },
      { eastMeters: 2, northMeters: 15 },
    ])

    expect(bounds).toEqual({
      minEastMeters: -4,
      maxEastMeters: 12,
      minNorthMeters: -3,
      maxNorthMeters: 15,
    })
  })

  it('inserts a midpoint without changing the parcel outline', () => {
    const vertices = createRectangleVertices(20, 30)
    const withMidpoint = insertParcelMidpoint(vertices, 1)

    expect(withMidpoint[2]).toEqual({
      eastMeters: 10,
      northMeters: 0,
    })
    expect(withMidpoint).toHaveLength(5)
  })
})
