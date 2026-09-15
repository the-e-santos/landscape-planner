import { describe, expect, it } from 'vitest'
import { createRectangleVertices, type ParcelPoint } from './parcel'
import { createFlatTerrainEntity } from './terrain'
import { clipTerrainMeshToParcel } from './terrainClipping'
import {
  deriveTerrainMesh,
  projectedTriangleAreaSquareMeters,
  type DerivedTerrainMesh,
} from './terrainMesh'

function deriveFlatMesh(): DerivedTerrainMesh {
  const result = deriveTerrainMesh(
    createFlatTerrainEntity({
      eastWestMeters: 30,
      northSouthMeters: 30,
      elevationMeters: 2,
    }),
  )

  if (!result.ok) {
    throw new Error('Expected valid terrain fixture')
  }
  return result.mesh
}

function meshArea(mesh: DerivedTerrainMesh): number {
  return mesh.triangles.reduce(
    (area, triangle) =>
      area + projectedTriangleAreaSquareMeters(mesh, triangle),
    0,
  )
}

describe('terrain parcel clipping', () => {
  it('clips terrain triangles to a smaller rectangular parcel', () => {
    const result = clipTerrainMeshToParcel(
      deriveFlatMesh(),
      createRectangleVertices(10, 12),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(meshArea(result.mesh)).toBeCloseTo(120, 10)
    result.mesh.vertices.forEach(({ eastMeters, northMeters, elevationMeters }) => {
      expect(Math.abs(eastMeters)).toBeLessThanOrEqual(5)
      expect(Math.abs(northMeters)).toBeLessThanOrEqual(6)
      expect(elevationMeters).toBeCloseTo(2, 12)
    })
  })

  it('clips to a concave simple parcel', () => {
    const concaveParcel: ParcelPoint[] = [
      { eastMeters: -10, northMeters: -10 },
      { eastMeters: 10, northMeters: -10 },
      { eastMeters: 10, northMeters: 0 },
      { eastMeters: 0, northMeters: 0 },
      { eastMeters: 0, northMeters: 10 },
      { eastMeters: -10, northMeters: 10 },
    ]
    const result = clipTerrainMeshToParcel(deriveFlatMesh(), concaveParcel)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(meshArea(result.mesh)).toBeCloseTo(300, 10)
    }
  })

  it('interpolates clipped boundary elevations on the source plane', () => {
    const elevationAt = (east: number, north: number) =>
      0.2 * east - 0.1 * north + 3
    const terrain = createFlatTerrainEntity({
      eastWestMeters: 20,
      northSouthMeters: 20,
    })
    const slopedTerrain = {
      ...terrain,
      spotElevations: terrain.spotElevations.map((spot) => ({
        ...spot,
        elevationMeters: elevationAt(spot.eastMeters, spot.northMeters),
      })),
    }
    const meshResult = deriveTerrainMesh(slopedTerrain)

    expect(meshResult.ok).toBe(true)
    if (!meshResult.ok) {
      return
    }

    const clipResult = clipTerrainMeshToParcel(
      meshResult.mesh,
      createRectangleVertices(8, 12),
    )
    expect(clipResult.ok).toBe(true)
    if (!clipResult.ok) {
      return
    }

    clipResult.mesh.vertices.forEach((vertex) => {
      expect(vertex.elevationMeters).toBeCloseTo(
        elevationAt(vertex.eastMeters, vertex.northMeters),
        10,
      )
    })
  })

  it('ignores a redundant midpoint without changing the clipped area', () => {
    const boundary = createRectangleVertices(10, 12)
    boundary.splice(1, 0, { eastMeters: 0, northMeters: -6 })
    const result = clipTerrainMeshToParcel(deriveFlatMesh(), boundary)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(meshArea(result.mesh)).toBeCloseTo(120, 10)
    }
  })

  it('rejects a self-intersecting parcel boundary', () => {
    const result = clipTerrainMeshToParcel(deriveFlatMesh(), [
      { eastMeters: -5, northMeters: -5 },
      { eastMeters: 5, northMeters: 5 },
      { eastMeters: -5, northMeters: 5 },
      { eastMeters: 5, northMeters: -5 },
    ])

    expect(result).toEqual({
      ok: false,
      issue: expect.objectContaining({ code: 'invalid-parcel-boundary' }),
    })
  })
})
