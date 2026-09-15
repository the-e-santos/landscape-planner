import { describe, expect, it } from 'vitest'
import { deriveRetainingWallFaces } from './retainingWallMesh'
import { createFlatTerrainEntity, type TerrainEntity } from './terrain'

describe('retaining-wall face derivation', () => {
  it('creates two explicit vertical triangles per profile segment', () => {
    const base = createFlatTerrainEntity({
      eastWestMeters: 10,
      northSouthMeters: 10,
    })
    const terrain: TerrainEntity = {
      ...base,
      retainingWalls: [
        {
          id: 'wall.analytical',
          name: 'Analytical wall',
          upperProfile: [
            { id: 'upper.1', eastMeters: -2, northMeters: 0, elevationMeters: 2 },
            { id: 'upper.2', eastMeters: 2, northMeters: 0, elevationMeters: 2 },
          ],
          lowerProfile: [
            { id: 'lower.1', eastMeters: -2, northMeters: 0, elevationMeters: 0 },
            { id: 'lower.2', eastMeters: 2, northMeters: 0, elevationMeters: 0 },
          ],
          upperSide: 'left',
          source: { kind: 'survey' },
          uncertainty: { horizontalMeters: 0.01, verticalMeters: 0.005 },
        },
      ],
    }
    const result = deriveRetainingWallFaces(terrain)

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.faces).toEqual([
      {
        retainingWallId: 'wall.analytical',
        vertices: [
          { eastMeters: -2, northMeters: 0, elevationMeters: 2 },
          { eastMeters: -2, northMeters: 0, elevationMeters: 0 },
          { eastMeters: 2, northMeters: 0, elevationMeters: 2 },
          { eastMeters: 2, northMeters: 0, elevationMeters: 0 },
        ],
        triangles: [
          [0, 1, 3],
          [0, 3, 2],
        ],
      },
    ])
  })
})
