import { describe, expect, it } from 'vitest'
import type { PrimitiveEntity } from '../domain/primitive'
import {
  conservativePrimitiveBounds,
  conservativelyInvalidatedTileIds,
  createExposureTiles,
} from './tileInvalidation'

describe('conservative exposure tile invalidation', () => {
  const tiles = createExposureTiles([
    { eastMeters: 1, northMeters: 1, elevationMeters: 0 },
    { eastMeters: -1, northMeters: 1, elevationMeters: 0 },
    { eastMeters: -9, northMeters: 1, elevationMeters: 0 },
    { eastMeters: 9, northMeters: 1, elevationMeters: 0 },
  ])

  it('groups samples into stable plan tiles', () => {
    expect(tiles.map(({ id }) => id)).toEqual(['-1:0', '-2:0', '0:0', '1:0'])
  })

  it('projects a conservative shadow envelope opposite the sun', () => {
    const dirty = conservativelyInvalidatedTileIds(
      tiles,
      [{
        minEastMeters: -0.5,
        maxEastMeters: 0.5,
        minNorthMeters: -0.5,
        maxNorthMeters: 0.5,
        minElevationMeters: 0,
        maxElevationMeters: 7,
      }],
      [{ east: 1, up: 1, north: 0 }],
    )

    expect(dirty).toEqual(new Set(['-1:0', '0:0']))
  })

  it('uses rotation-independent bounding spheres for changed primitives', () => {
    const primitive: PrimitiveEntity = {
      id: 'bounds.wall',
      kind: 'primitive',
      name: 'Wall',
      transform: {
        position: { eastMeters: 3, elevationMeters: 2, northMeters: 4 },
        rotation: { xRadians: 0.2, yRadians: 1, zRadians: 0 },
      },
      geometry: {
        kind: 'wall', structure: 'wall', lengthMeters: 4,
        heightMeters: 2, thicknessMeters: 0.2,
      },
    }
    const bounds = conservativePrimitiveBounds(primitive)

    expect(bounds.minEastMeters).toBeLessThan(1)
    expect(bounds.maxEastMeters).toBeGreaterThan(5)
    expect(bounds.minNorthMeters).toBeLessThan(2)
    expect(bounds.maxNorthMeters).toBeGreaterThan(6)
  })
})
