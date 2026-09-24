import type { ParcelPoint } from './parcel'
import type { EntityId, LandscapeProject } from './project'
import { validatePolygonExtrusionFootprint } from './primitive'

export type SoilTexture = 'sand' | 'loam' | 'clay' | 'silt' | 'unknown' | 'custom'
export type SoilDrainage = 'rapid' | 'wellDrained' | 'moderate' | 'poor' | 'unknown'
export type SurfaceCover =
  | 'bareSoil'
  | 'mulch'
  | 'turf'
  | 'groundcover'
  | 'gravel'
  | 'concrete'
  | 'pavers'
  | 'other'

export interface SoilProfile {
  readonly texture: SoilTexture
  readonly customTextureLabel?: string
  readonly drainage: SoilDrainage
  /** Visible cover above this soil profile; rendering may derive its appearance. */
  readonly surfaceCover: SurfaceCover
  readonly usableRootDepthMeters: number
  readonly ph?: number
  readonly organicMatterPercent?: number
  readonly notes?: string
}

export interface PlantingBedEntity {
  readonly id: EntityId
  readonly kind: 'plantingBed'
  readonly name: string
  /** Counterclockwise world-space footprint in east/north meters. */
  readonly footprint: readonly ParcelPoint[]
  readonly soil: SoilProfile
}

export type IrrigationDeliveryMethod =
  | 'drip'
  | 'spray'
  | 'soaker'
  | 'manual'
  | 'other'

export interface IrrigationZoneEntity {
  readonly id: EntityId
  readonly kind: 'irrigationZone'
  readonly name: string
  /** Optional visual/organizational extent; membership remains explicit. */
  readonly footprint?: readonly ParcelPoint[]
  readonly deliveryMethod: IrrigationDeliveryMethod
  readonly weeklyTargetMillimeters?: number
  readonly notes?: string
}

export interface PlantPosition {
  readonly eastMeters: number
  readonly elevationMeters: number
  readonly northMeters: number
}

export interface PlantEntity {
  readonly id: EntityId
  readonly kind: 'plant'
  readonly name: string
  readonly taxonId: string
  readonly scientificName: string
  readonly cultivar?: string
  readonly commonName?: string
  readonly position: PlantPosition
  /** Simplified spherical foliage extent used only for proximity queries. */
  readonly canopyRadiusMeters: number
  readonly plantingBedId?: EntityId
  readonly irrigationZoneIds: readonly EntityId[]
  /** Explicit zero-to-many memberships used by the user-authored rule catalog. */
  readonly interactionGroupIds: readonly string[]
}

export type LandscapeSemanticEntity =
  | PlantingBedEntity
  | IrrigationZoneEntity
  | PlantEntity

function requireText(value: string, label: string): void {
  if (value.trim().length === 0) throw new Error(`${label} must not be empty`)
}

function requireFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`)
}

function validateFootprint(
  footprint: readonly ParcelPoint[],
  label: string,
): void {
  try {
    validatePolygonExtrusionFootprint(footprint)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid footprint'
    throw new Error(message.replace('Polygon extrusion footprint', label))
  }
}

export function validatePlantingBedEntity(entity: PlantingBedEntity): void {
  requireText(entity.id, 'Planting bed ID')
  requireText(entity.name, 'Planting bed name')
  validateFootprint(entity.footprint, 'Planting bed footprint')
  if (!['sand', 'loam', 'clay', 'silt', 'unknown', 'custom'].includes(entity.soil.texture)) {
    throw new Error('Planting bed soil texture is invalid')
  }
  if (entity.soil.texture === 'custom') {
    requireText(entity.soil.customTextureLabel ?? '', 'Custom soil texture label')
  }
  if (!['rapid', 'wellDrained', 'moderate', 'poor', 'unknown'].includes(entity.soil.drainage)) {
    throw new Error('Planting bed drainage is invalid')
  }
  if (![
    'bareSoil',
    'mulch',
    'turf',
    'groundcover',
    'gravel',
    'concrete',
    'pavers',
    'other',
  ].includes(entity.soil.surfaceCover)) {
    throw new Error('Planting bed surface cover is invalid')
  }
  requireFinite(entity.soil.usableRootDepthMeters, 'Usable root depth')
  if (entity.soil.usableRootDepthMeters <= 0) {
    throw new Error('Usable root depth must be greater than zero')
  }
  if (entity.soil.ph !== undefined) {
    requireFinite(entity.soil.ph, 'Soil pH')
    if (entity.soil.ph < 0 || entity.soil.ph > 14) {
      throw new Error('Soil pH must be between 0 and 14')
    }
  }
  if (entity.soil.organicMatterPercent !== undefined) {
    requireFinite(entity.soil.organicMatterPercent, 'Organic matter percentage')
    if (entity.soil.organicMatterPercent < 0 || entity.soil.organicMatterPercent > 100) {
      throw new Error('Organic matter percentage must be between 0 and 100')
    }
  }
}

export function validateIrrigationZoneEntity(entity: IrrigationZoneEntity): void {
  requireText(entity.id, 'Irrigation zone ID')
  requireText(entity.name, 'Irrigation zone name')
  if (entity.footprint) validateFootprint(entity.footprint, 'Irrigation zone footprint')
  if (!['drip', 'spray', 'soaker', 'manual', 'other'].includes(entity.deliveryMethod)) {
    throw new Error('Irrigation delivery method is invalid')
  }
  if (entity.weeklyTargetMillimeters !== undefined) {
    requireFinite(entity.weeklyTargetMillimeters, 'Weekly irrigation target')
    if (entity.weeklyTargetMillimeters < 0) {
      throw new Error('Weekly irrigation target must not be negative')
    }
  }
}

export function validatePlantEntity(entity: PlantEntity): void {
  requireText(entity.id, 'Plant ID')
  requireText(entity.name, 'Plant name')
  requireText(entity.taxonId, 'Plant taxon ID')
  requireText(entity.scientificName, 'Plant scientific name')
  requireFinite(entity.position.eastMeters, 'Plant east position')
  requireFinite(entity.position.elevationMeters, 'Plant elevation')
  requireFinite(entity.position.northMeters, 'Plant north position')
  requireFinite(entity.canopyRadiusMeters, 'Plant canopy radius')
  if (entity.canopyRadiusMeters <= 0) {
    throw new Error('Plant canopy radius must be greater than zero')
  }
  if (entity.plantingBedId !== undefined) requireText(entity.plantingBedId, 'Planting bed ID')
  const uniqueZones = new Set(entity.irrigationZoneIds)
  if (uniqueZones.size !== entity.irrigationZoneIds.length) {
    throw new Error('Plant irrigation-zone memberships must not contain duplicates')
  }
  entity.irrigationZoneIds.forEach((id) => requireText(id, 'Irrigation zone ID'))
  const uniqueGroups = new Set(entity.interactionGroupIds)
  if (uniqueGroups.size !== entity.interactionGroupIds.length) {
    throw new Error('Plant interaction-group memberships must not contain duplicates')
  }
  entity.interactionGroupIds.forEach((id) => requireText(id, 'Interaction group ID'))
}

export function validateLandscapeSemanticEntity(
  entity: LandscapeSemanticEntity,
): void {
  switch (entity.kind) {
    case 'plantingBed':
      validatePlantingBedEntity(entity)
      break
    case 'irrigationZone':
      validateIrrigationZoneEntity(entity)
      break
    case 'plant':
      validatePlantEntity(entity)
      break
  }
}

export function cloneLandscapeSemanticEntity<T extends LandscapeSemanticEntity>(
  entity: T,
): T {
  switch (entity.kind) {
    case 'plantingBed':
      return {
        ...entity,
        footprint: entity.footprint.map((point) => ({ ...point })),
        soil: { ...entity.soil },
      } as T
    case 'irrigationZone':
      return {
        ...entity,
        ...(entity.footprint
          ? { footprint: entity.footprint.map((point) => ({ ...point })) }
          : {}),
      } as T
    case 'plant':
      return {
        ...entity,
        position: { ...entity.position },
        irrigationZoneIds: [...entity.irrigationZoneIds],
        interactionGroupIds: [...entity.interactionGroupIds],
      } as T
  }
}

export function validateLandscapeMemberships(project: LandscapeProject): void {
  const beds = new Set(project.entities
    .filter((entity) => entity.kind === 'plantingBed')
    .map(({ id }) => id))
  const zones = new Set(project.entities
    .filter((entity) => entity.kind === 'irrigationZone')
    .map(({ id }) => id))
  project.entities.forEach((entity) => {
    if (entity.kind !== 'plant') return
    if (entity.plantingBedId && !beds.has(entity.plantingBedId)) {
      throw new Error(`Plant ${entity.id} references missing planting bed ${entity.plantingBedId}`)
    }
    entity.irrigationZoneIds.forEach((zoneId) => {
      if (!zones.has(zoneId)) {
        throw new Error(`Plant ${entity.id} references missing irrigation zone ${zoneId}`)
      }
    })
  })
}

export function getPlantingBedMembers(
  project: LandscapeProject,
  plantingBedId: EntityId,
): readonly PlantEntity[] {
  if (!project.entities.some((entity) =>
    entity.kind === 'plantingBed' && entity.id === plantingBedId
  )) throw new Error(`Planting bed not found: ${plantingBedId}`)
  return project.entities.filter(
    (entity): entity is PlantEntity =>
      entity.kind === 'plant' && entity.plantingBedId === plantingBedId,
  )
}

export function getIrrigationZoneMembers(
  project: LandscapeProject,
  irrigationZoneId: EntityId,
): readonly PlantEntity[] {
  if (!project.entities.some((entity) =>
    entity.kind === 'irrigationZone' && entity.id === irrigationZoneId
  )) throw new Error(`Irrigation zone not found: ${irrigationZoneId}`)
  return project.entities.filter(
    (entity): entity is PlantEntity =>
      entity.kind === 'plant' && entity.irrigationZoneIds.includes(irrigationZoneId),
  )
}

export function plantsSharePlantingBed(left: PlantEntity, right: PlantEntity): boolean {
  return left.plantingBedId !== undefined && left.plantingBedId === right.plantingBedId
}

export function sharedIrrigationZoneIds(
  left: PlantEntity,
  right: PlantEntity,
): readonly EntityId[] {
  const rightZones = new Set(right.irrigationZoneIds)
  return left.irrigationZoneIds.filter((id) => rightZones.has(id))
}

export function foliageGapMeters(left: PlantEntity, right: PlantEntity): number {
  const centerDistance = Math.hypot(
    left.position.eastMeters - right.position.eastMeters,
    left.position.elevationMeters - right.position.elevationMeters,
    left.position.northMeters - right.position.northMeters,
  )
  return Math.max(0, centerDistance - left.canopyRadiusMeters - right.canopyRadiusMeters)
}

export function getFoliageNeighbors(
  project: LandscapeProject,
  plantId: EntityId,
  maximumGapMeters: number,
): readonly { readonly plant: PlantEntity; readonly foliageGapMeters: number }[] {
  requireFinite(maximumGapMeters, 'Maximum foliage gap')
  if (maximumGapMeters < 0) throw new Error('Maximum foliage gap must not be negative')
  const source = project.entities.find(
    (entity): entity is PlantEntity => entity.kind === 'plant' && entity.id === plantId,
  )
  if (!source) throw new Error(`Plant not found: ${plantId}`)
  return project.entities
    .filter((entity): entity is PlantEntity =>
      entity.kind === 'plant' && entity.id !== plantId
    )
    .map((plant) => ({ plant, foliageGapMeters: foliageGapMeters(source, plant) }))
    .filter(({ foliageGapMeters: gap }) => gap <= maximumGapMeters)
    .sort((left, right) =>
      left.foliageGapMeters - right.foliageGapMeters ||
      left.plant.id.localeCompare(right.plant.id)
    )
}
