export type TerrainMeasurementSourceKind =
  | 'survey'
  | 'lidar'
  | 'gis'
  | 'estimated'
  | 'user'

export interface TerrainMeasurementSource {
  readonly kind: TerrainMeasurementSourceKind
  readonly note?: string
}

export interface TerrainPointUncertainty {
  readonly horizontalMeters: number
  readonly verticalMeters: number
}

export interface SpotElevation {
  readonly id: string
  readonly eastMeters: number
  readonly northMeters: number
  /** Height along local +Y, relative to the project's local elevation datum. */
  readonly elevationMeters: number
  readonly source: TerrainMeasurementSource
  readonly uncertainty: TerrainPointUncertainty
}

export type TerrainLinearConstraintRole = 'gradeBreak' | 'ridge' | 'swale'

export interface TerrainLinearConstraint {
  readonly id: string
  readonly name: string
  readonly role: TerrainLinearConstraintRole
  /** Ordered spot-elevation IDs forming the constraint polyline. */
  readonly spotElevationIds: readonly string[]
  readonly source: TerrainMeasurementSource
}

export interface RetainingWallProfilePoint {
  readonly id: string
  readonly eastMeters: number
  readonly northMeters: number
  readonly elevationMeters: number
}

export type RetainingWallUpperSide = 'left' | 'right'

export interface TerrainRetainingWall {
  readonly id: string
  readonly name: string
  /** Corresponding upper/lower points share plan coordinates and ordering. */
  readonly upperProfile: readonly RetainingWallProfilePoint[]
  readonly lowerProfile: readonly RetainingWallProfilePoint[]
  /** Side of the ordered profile carrying the upper adjoining terrain. */
  readonly upperSide: RetainingWallUpperSide
  readonly source: TerrainMeasurementSource
  readonly uncertainty: TerrainPointUncertainty
}

export interface TerrainEntity {
  readonly id: string
  readonly kind: 'terrain'
  readonly name: string
  /** Authoritative inputs; a triangulated surface is derived and not persisted. */
  readonly spotElevations: readonly SpotElevation[]
  /** Missing on early schema-v1 files and treated as an empty collection. */
  readonly linearConstraints?: readonly TerrainLinearConstraint[]
  /** Missing on early schema-v1 files and treated as an empty collection. */
  readonly retainingWalls?: readonly TerrainRetainingWall[]
}

export const DEFAULT_TERRAIN_ID = 'terrain.main'

export interface FlatTerrainOptions {
  readonly id?: string
  readonly name?: string
  readonly eastWestMeters: number
  readonly northSouthMeters: number
  readonly elevationMeters?: number
  readonly source?: TerrainMeasurementSource
  readonly uncertainty?: TerrainPointUncertainty
}

export function createFlatTerrainEntity({
  id = DEFAULT_TERRAIN_ID,
  name = 'Existing grade',
  eastWestMeters,
  northSouthMeters,
  elevationMeters = 0,
  source = { kind: 'estimated', note: 'Initial flat terrain' },
  uncertainty = { horizontalMeters: 0.3, verticalMeters: 0.15 },
}: FlatTerrainOptions): TerrainEntity {
  const halfWidth = eastWestMeters / 2
  const halfDepth = northSouthMeters / 2
  const positions = [
    { suffix: 'southwest', eastMeters: -halfWidth, northMeters: -halfDepth },
    { suffix: 'southeast', eastMeters: halfWidth, northMeters: -halfDepth },
    { suffix: 'northeast', eastMeters: halfWidth, northMeters: halfDepth },
    { suffix: 'northwest', eastMeters: -halfWidth, northMeters: halfDepth },
  ]

  return {
    id,
    kind: 'terrain',
    name,
    linearConstraints: [],
    retainingWalls: [],
    spotElevations: positions.map((position) => ({
      id: `${id}.spot.${position.suffix}`,
      eastMeters: position.eastMeters,
      northMeters: position.northMeters,
      elevationMeters,
      source: { ...source },
      uncertainty: { ...uncertainty },
    })),
  }
}

export function getTerrainLinearConstraints(
  terrain: TerrainEntity,
): readonly TerrainLinearConstraint[] {
  return terrain.linearConstraints ?? []
}

export function getTerrainRetainingWalls(
  terrain: TerrainEntity,
): readonly TerrainRetainingWall[] {
  return terrain.retainingWalls ?? []
}
