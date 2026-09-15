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
      triangles.push(
        [upperStart, lowerStart, lowerEnd],
        [upperStart, lowerEnd, upperEnd],
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
