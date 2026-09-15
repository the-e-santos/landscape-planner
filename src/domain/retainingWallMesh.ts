import {
  getTerrainRetainingWalls,
  type RetainingWallProfilePoint,
  type TerrainEntity,
} from './terrain'
import {
  validateTerrain,
  type TerrainValidationIssue,
} from './terrainValidation'
import type { TerrainMeshVertex, TerrainTriangle } from './terrainMesh'

export interface DerivedRetainingWallFace {
  readonly retainingWallId: string
  /** Alternating upper and lower vertices at each ordered profile station. */
  readonly vertices: readonly TerrainMeshVertex[]
  readonly triangles: readonly TerrainTriangle[]
}

export type RetainingWallMeshResult =
  | { readonly ok: true; readonly faces: readonly DerivedRetainingWallFace[] }
  | {
      readonly ok: false
      readonly issues: readonly TerrainValidationIssue[]
    }

function toVertex(point: RetainingWallProfilePoint): TerrainMeshVertex {
  return {
    eastMeters: point.eastMeters,
    northMeters: point.northMeters,
    elevationMeters: point.elevationMeters,
  }
}

function triangleHasArea(
  vertices: readonly TerrainMeshVertex[],
  [aIndex, bIndex, cIndex]: TerrainTriangle,
): boolean {
  const a = vertices[aIndex]
  const b = vertices[bIndex]
  const c = vertices[cIndex]
  const ab = [
    b.eastMeters - a.eastMeters,
    b.elevationMeters - a.elevationMeters,
    b.northMeters - a.northMeters,
  ]
  const ac = [
    c.eastMeters - a.eastMeters,
    c.elevationMeters - a.elevationMeters,
    c.northMeters - a.northMeters,
  ]
  const cross = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ]
  return cross.some((component) => component !== 0)
}

export function deriveRetainingWallFaces(
  terrain: TerrainEntity,
): RetainingWallMeshResult {
  const issues = validateTerrain(terrain)
  if (issues.length > 0) {
    return { ok: false, issues }
  }

  const faces = getTerrainRetainingWalls(terrain).map((wall) => {
    const vertices = wall.upperProfile.flatMap((upper, index) => [
      toVertex(upper),
      toVertex(wall.lowerProfile[index]),
    ])
    const triangles: TerrainTriangle[] = []

    for (let index = 0; index < wall.upperProfile.length - 1; index += 1) {
      const upperStart = index * 2
      const lowerStart = upperStart + 1
      const upperEnd = upperStart + 2
      const lowerEnd = upperStart + 3
      const candidates: TerrainTriangle[] = [
        [upperStart, lowerStart, lowerEnd],
        [upperStart, lowerEnd, upperEnd],
      ]
      triangles.push(
        ...candidates.filter((triangle) => triangleHasArea(vertices, triangle)),
      )
    }

    return {
      retainingWallId: wall.id,
      vertices,
      triangles,
    }
  })

  return { ok: true, faces }
}
