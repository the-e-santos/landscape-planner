import { describe, expect, it } from 'vitest'
import type { DerivedTerrainMesh } from './terrainMesh'
import { sampleTerrainElevation } from './terrainElevation'

const mesh: DerivedTerrainMesh = {
  vertices: [
    { eastMeters: 0, northMeters: 0, elevationMeters: 0 },
    { eastMeters: 2, northMeters: 0, elevationMeters: 2 },
    { eastMeters: 0, northMeters: 2, elevationMeters: 4 },
  ],
  triangles: [[0, 1, 2]],
}

describe('terrain elevation sampling', () => {
  it('interpolates elevation inside a derived terrain triangle', () => {
    expect(sampleTerrainElevation(mesh, 0.5, 0.5)).toBeCloseTo(1.5)
    expect(sampleTerrainElevation(mesh, 0, 0)).toBe(0)
  })

  it('returns undefined outside the terrain mesh', () => {
    expect(sampleTerrainElevation(mesh, 2, 2)).toBeUndefined()
  })

  it('chooses the upper surface on a duplicated retaining-wall edge', () => {
    const stepped: DerivedTerrainMesh = {
      vertices: [
        ...mesh.vertices,
        { eastMeters: 0, northMeters: 0, elevationMeters: -1 },
        { eastMeters: 2, northMeters: 0, elevationMeters: -1 },
        { eastMeters: 1, northMeters: -1, elevationMeters: -1 },
      ],
      triangles: [...mesh.triangles, [3, 5, 4]],
    }

    expect(sampleTerrainElevation(stepped, 1, 0)).toBe(1)
  })
})
