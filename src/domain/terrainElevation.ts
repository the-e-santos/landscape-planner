import type { DerivedTerrainMesh, TerrainTriangle } from './terrainMesh'

const CONTAINMENT_EPSILON = 1e-9

function elevationInTriangle(
  mesh: DerivedTerrainMesh,
  triangle: TerrainTriangle,
  eastMeters: number,
  northMeters: number,
): number | undefined {
  const a = mesh.vertices[triangle[0]]
  const b = mesh.vertices[triangle[1]]
  const c = mesh.vertices[triangle[2]]
  const denominator =
    (b.northMeters - c.northMeters) * (a.eastMeters - c.eastMeters) +
    (c.eastMeters - b.eastMeters) * (a.northMeters - c.northMeters)
  if (Math.abs(denominator) <= Number.EPSILON) return undefined

  const aWeight = (
    (b.northMeters - c.northMeters) * (eastMeters - c.eastMeters) +
    (c.eastMeters - b.eastMeters) * (northMeters - c.northMeters)
  ) / denominator
  const bWeight = (
    (c.northMeters - a.northMeters) * (eastMeters - c.eastMeters) +
    (a.eastMeters - c.eastMeters) * (northMeters - c.northMeters)
  ) / denominator
  const cWeight = 1 - aWeight - bWeight
  if (
    aWeight < -CONTAINMENT_EPSILON ||
    bWeight < -CONTAINMENT_EPSILON ||
    cWeight < -CONTAINMENT_EPSILON
  ) {
    return undefined
  }

  return aWeight * a.elevationMeters +
    bWeight * b.elevationMeters +
    cWeight * c.elevationMeters
}

/**
 * Samples the piecewise-planar terrain at an east/north position.
 * At a retaining-wall edge shared by upper and lower faces, the upper surface wins.
 */
export function sampleTerrainElevation(
  mesh: DerivedTerrainMesh,
  eastMeters: number,
  northMeters: number,
): number | undefined {
  let elevation: number | undefined
  mesh.triangles.forEach((triangle) => {
    const candidate = elevationInTriangle(
      mesh,
      triangle,
      eastMeters,
      northMeters,
    )
    if (candidate !== undefined) {
      elevation = elevation === undefined
        ? candidate
        : Math.max(elevation, candidate)
    }
  })
  return elevation
}
