import { describe, expect, it } from 'vitest'
import {
  createFlatTerrainEntity,
  type SpotElevation,
  type TerrainEntity,
  type TerrainLinearConstraint,
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
  linearConstraints: readonly TerrainLinearConstraint[] = [],
): TerrainEntity {
  return {
    id: 'terrain.triangulation-fixture',
    kind: 'terrain',
    name: 'Triangulation fixture',
    spotElevations,
    linearConstraints,
  }
}

function meshHasEdge(
  triangles: readonly (readonly [number, number, number])[],
  first: number,
  second: number,
): boolean {
  return triangles.some(([a, b, c]) =>
    [
      [a, b],
      [b, c],
      [c, a],
    ].some(
      ([edgeStart, edgeEnd]) =>
        (edgeStart === first && edgeEnd === second) ||
        (edgeStart === second && edgeEnd === first),
    ),
  )
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

  it('flips a Delaunay diagonal to enforce a linear constraint', () => {
    const terrain = createFlatTerrainEntity({
      eastWestMeters: 20,
      northSouthMeters: 20,
    })
    const unconstrained = deriveTerrainMesh(terrain)

    expect(unconstrained.ok).toBe(true)
    if (!unconstrained.ok) {
      return
    }

    const byId = new Map(
      unconstrained.mesh.vertices.map((vertex, index) => [
        vertex.spotElevationId,
        index,
      ]),
    )
    const southwest = byId.get(`${terrain.id}.spot.southwest`)!
    const southeast = byId.get(`${terrain.id}.spot.southeast`)!
    const northeast = byId.get(`${terrain.id}.spot.northeast`)!
    const northwest = byId.get(`${terrain.id}.spot.northwest`)!
    const constrainedPair = meshHasEdge(
      unconstrained.mesh.triangles,
      southwest,
      northeast,
    )
      ? [southeast, northwest]
      : [southwest, northeast]
    const constrainedSpotIds = constrainedPair.map(
      (vertexIndex) => unconstrained.mesh.vertices[vertexIndex].spotElevationId!,
    )
    const constraint: TerrainLinearConstraint = {
      id: 'constraint.alternate-diagonal',
      name: 'Alternate diagonal',
      role: 'gradeBreak',
      spotElevationIds: constrainedSpotIds,
      source: { kind: 'user' },
    }
    const result = deriveTerrainMesh({
      ...terrain,
      linearConstraints: [constraint],
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(
        meshHasEdge(
          result.mesh.triangles,
          constrainedPair[0],
          constrainedPair[1],
        ),
      ).toBe(true)
    }
  })

  it('splits a constraint at an existing collinear spot', () => {
    const spots = [
      createSpot('spot.a', -2, -2, 0),
      createSpot('spot.b', 0, 0, 1),
      createSpot('spot.c', 2, 2, 2),
      createSpot('spot.d', -2, 2, 0),
      createSpot('spot.e', 2, -2, 0),
    ]
    const result = deriveTerrainMesh(
      createTerrain(spots, [
        {
          id: 'constraint.with-interior-spot',
          name: 'Three-point ridge',
          role: 'ridge',
          spotElevationIds: ['spot.a', 'spot.c'],
          source: { kind: 'survey' },
        },
      ]),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    const byId = new Map(
      result.mesh.vertices.map((vertex, index) => [
        vertex.spotElevationId,
        index,
      ]),
    )
    expect(
      meshHasEdge(result.mesh.triangles, byId.get('spot.a')!, byId.get('spot.b')!),
    ).toBe(true)
    expect(
      meshHasEdge(result.mesh.triangles, byId.get('spot.b')!, byId.get('spot.c')!),
    ).toBe(true)
  })

  it('enforces a constraint crossing several existing triangles', () => {
    const spots = [
      createSpot('spot.southwest', -5, -5, 0),
      createSpot('spot.northwest', -5, 5, 0),
      createSpot('spot.northeast', 5, 5, 0),
      createSpot('spot.southeast', 5, -5, 0),
      createSpot('spot.inner-west', -2, 1, 0.5),
      createSpot('spot.inner-south', 1, -2, 0.5),
      createSpot('spot.inner-north', 0, 3, 0.5),
      createSpot('spot.inner-east', 3, 0, 0.5),
    ]
    const terrain = createTerrain(spots)
    const unconstrained = deriveTerrainMesh(terrain)

    expect(unconstrained.ok).toBe(true)
    if (!unconstrained.ok) {
      return
    }
    const unconstrainedById = new Map(
      unconstrained.mesh.vertices.map((vertex, index) => [
        vertex.spotElevationId,
        index,
      ]),
    )
    expect(
      meshHasEdge(
        unconstrained.mesh.triangles,
        unconstrainedById.get('spot.southwest')!,
        unconstrainedById.get('spot.northeast')!,
      ),
    ).toBe(false)

    const result = deriveTerrainMesh({
      ...terrain,
      linearConstraints: [
        {
          id: 'constraint.long-diagonal',
          name: 'Long grade break',
          role: 'gradeBreak',
          spotElevationIds: ['spot.southwest', 'spot.northeast'],
          source: { kind: 'survey' },
        },
      ],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    const byId = new Map(
      result.mesh.vertices.map((vertex, index) => [
        vertex.spotElevationId,
        index,
      ]),
    )
    expect(
      meshHasEdge(
        result.mesh.triangles,
        byId.get('spot.southwest')!,
        byId.get('spot.northeast')!,
      ),
    ).toBe(true)
  })
})
