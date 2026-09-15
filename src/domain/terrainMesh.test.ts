import { describe, expect, it } from 'vitest'
import {
  createFlatTerrainEntity,
  type SpotElevation,
  type TerrainEntity,
} from './terrain'
import {
  deriveTerrainMesh,
  projectedTriangleAreaSquareMeters,
} from './terrainMesh'

function createSpot(
  id: string,
  eastMeters: number,
  northMeters: number,
  elevationMeters: number,
): SpotElevation {
  return {
    id,
    eastMeters,
    northMeters,
    elevationMeters,
    source: { kind: 'survey' },
    uncertainty: { horizontalMeters: 0.01, verticalMeters: 0.005 },
  }
}

function createTerrain(
  spotElevations: readonly SpotElevation[],
): TerrainEntity {
  return {
    id: 'terrain.triangulation-fixture',
    kind: 'terrain',
    name: 'Triangulation fixture',
    spotElevations,
  }
}

describe('terrain mesh derivation', () => {
  it('triangulates a flat rectangle into two upward-facing triangles', () => {
    const result = deriveTerrainMesh(
      createFlatTerrainEntity({
        eastWestMeters: 20,
        northSouthMeters: 30,
        elevationMeters: 2.5,
      }),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.mesh.vertices).toHaveLength(4)
    expect(result.mesh.triangles).toHaveLength(2)
    expect(
      result.mesh.triangles.reduce(
        (area, triangle) =>
          area + projectedTriangleAreaSquareMeters(result.mesh, triangle),
        0,
      ),
    ).toBeCloseTo(600, 12)
    expect(
      result.mesh.vertices.every(({ elevationMeters }) => elevationMeters === 2.5),
    ).toBe(true)
    result.mesh.triangles.forEach(([aIndex, bIndex, cIndex]) => {
      const a = result.mesh.vertices[aIndex]
      const b = result.mesh.vertices[bIndex]
      const c = result.mesh.vertices[cIndex]
      const signedDoubleArea =
        (b.eastMeters - a.eastMeters) * (c.northMeters - a.northMeters) -
        (b.northMeters - a.northMeters) * (c.eastMeters - a.eastMeters)

      expect(signedDoubleArea).toBeGreaterThan(0)
    })
  })

  it('covers a planar slope with an interior spot and preserves elevations', () => {
    const elevationAt = (east: number, north: number) =>
      0.2 * east - 0.1 * north + 3
    const positions = [
      [-10, -15],
      [10, -15],
      [10, 15],
      [-10, 15],
      [0, 0],
    ] as const
    const terrain = createTerrain(
      positions.map(([east, north], index) =>
        createSpot(
          `spot.${index}`,
          east,
          north,
          elevationAt(east, north),
        ),
      ),
    )
    const result = deriveTerrainMesh(terrain)

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.mesh.triangles).toHaveLength(4)
    expect(
      result.mesh.triangles.reduce(
        (area, triangle) =>
          area + projectedTriangleAreaSquareMeters(result.mesh, triangle),
        0,
      ),
    ).toBeCloseTo(600, 12)
    result.mesh.vertices.forEach((vertex) => {
      expect(vertex.elevationMeters).toBeCloseTo(
        elevationAt(vertex.eastMeters, vertex.northMeters),
        12,
      )
    })
  })

  it('produces the same indexed mesh regardless of input order', () => {
    const terrain = createFlatTerrainEntity({
      eastWestMeters: 12,
      northSouthMeters: 18,
    })
    const reversedTerrain = {
      ...terrain,
      spotElevations: [...terrain.spotElevations].reverse(),
    }

    expect(deriveTerrainMesh(reversedTerrain)).toEqual(
      deriveTerrainMesh(terrain),
    )
  })

  it('returns validation issues instead of deriving an invalid mesh', () => {
    const result = deriveTerrainMesh(
      createTerrain([
        createSpot('spot.a', 0, 0, 0),
        createSpot('spot.b', 1, 1, 1),
        createSpot('spot.c', 2, 2, 2),
      ]),
    )

    expect(result).toEqual({
      ok: false,
      issues: [expect.objectContaining({ code: 'collinear-points' })],
    })
  })
})
