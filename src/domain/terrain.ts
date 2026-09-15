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

export interface TerrainEntity {
  readonly id: string
  readonly kind: 'terrain'
  readonly name: string
  /** Authoritative inputs; a triangulated surface is derived and not persisted. */
  readonly spotElevations: readonly SpotElevation[]
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
