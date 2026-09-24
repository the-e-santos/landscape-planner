import {
  DEFAULT_PARCEL_ID,
  PROJECT_SCHEMA_VERSION,
  type LandscapeProject,
} from './project'
import {
  validateIrrigationZoneEntity,
  validateLandscapeMemberships,
  validatePlantEntity,
  validatePlantingBedEntity,
  type IrrigationZoneEntity,
  type PlantEntity,
  type PlantingBedEntity,
} from './landscape'
import { validatePrimitiveEntity } from './primitive'
import { DEFAULT_TERRAIN_ID } from './terrain'

type JsonRecord = Record<string, unknown>

export class ProjectValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProjectValidationError'
  }
}

function fail(path: string, message: string): never {
  throw new ProjectValidationError(`${path}: ${message}`)
}

function record(value: unknown, path: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail(path, 'expected an object')
  }
  return value as JsonRecord
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    return fail(path, 'expected an array')
  }
  return value
}

function string(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fail(path, 'expected a non-empty string')
  }
  return value
}

function optionalString(value: unknown, path: string): void {
  if (value !== undefined && typeof value !== 'string') {
    fail(path, 'expected a string when present')
  }
}

function finiteNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fail(path, 'expected a finite number')
  }
  return value
}

function nonnegativeNumber(value: unknown, path: string): number {
  const result = finiteNumber(value, path)
  if (result < 0) {
    return fail(path, 'must be zero or greater')
  }
  return result
}

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    return fail(path, `expected one of: ${allowed.join(', ')}`)
  }
  return value as T
}

function validateSource(value: unknown, path: string): void {
  const source = record(value, path)
  oneOf(source.kind, ['survey', 'lidar', 'gis', 'estimated', 'user'], `${path}.kind`)
  optionalString(source.note, `${path}.note`)
}

function validateUncertainty(value: unknown, path: string): void {
  const uncertainty = record(value, path)
  nonnegativeNumber(uncertainty.horizontalMeters, `${path}.horizontalMeters`)
  nonnegativeNumber(uncertainty.verticalMeters, `${path}.verticalMeters`)
}

function validateProfilePoint(value: unknown, path: string): void {
  const point = record(value, path)
  string(point.id, `${path}.id`)
  finiteNumber(point.eastMeters, `${path}.eastMeters`)
  finiteNumber(point.northMeters, `${path}.northMeters`)
  finiteNumber(point.elevationMeters, `${path}.elevationMeters`)
}

function validateTerrain(value: JsonRecord, path: string): void {
  array(value.spotElevations, `${path}.spotElevations`).forEach((spotValue, index) => {
    const spotPath = `${path}.spotElevations[${index}]`
    const spot = record(spotValue, spotPath)
    string(spot.id, `${spotPath}.id`)
    finiteNumber(spot.eastMeters, `${spotPath}.eastMeters`)
    finiteNumber(spot.northMeters, `${spotPath}.northMeters`)
    finiteNumber(spot.elevationMeters, `${spotPath}.elevationMeters`)
    validateSource(spot.source, `${spotPath}.source`)
    validateUncertainty(spot.uncertainty, `${spotPath}.uncertainty`)
  })

  if (value.linearConstraints !== undefined) {
    array(value.linearConstraints, `${path}.linearConstraints`).forEach(
      (constraintValue, index) => {
        const constraintPath = `${path}.linearConstraints[${index}]`
        const constraint = record(constraintValue, constraintPath)
        string(constraint.id, `${constraintPath}.id`)
        string(constraint.name, `${constraintPath}.name`)
        oneOf(constraint.role, ['gradeBreak', 'ridge', 'swale'], `${constraintPath}.role`)
        array(constraint.spotElevationIds, `${constraintPath}.spotElevationIds`).forEach(
          (id, idIndex) => string(id, `${constraintPath}.spotElevationIds[${idIndex}]`),
        )
        validateSource(constraint.source, `${constraintPath}.source`)
      },
    )
  }

  if (value.retainingWalls !== undefined) {
    array(value.retainingWalls, `${path}.retainingWalls`).forEach(
      (wallValue, index) => {
        const wallPath = `${path}.retainingWalls[${index}]`
        const wall = record(wallValue, wallPath)
        string(wall.id, `${wallPath}.id`)
        string(wall.name, `${wallPath}.name`)
        oneOf(wall.upperSide, ['left', 'right'], `${wallPath}.upperSide`)
        array(wall.upperProfile, `${wallPath}.upperProfile`).forEach(
          (point, pointIndex) => validateProfilePoint(point, `${wallPath}.upperProfile[${pointIndex}]`),
        )
        array(wall.lowerProfile, `${wallPath}.lowerProfile`).forEach(
          (point, pointIndex) => validateProfilePoint(point, `${wallPath}.lowerProfile[${pointIndex}]`),
        )
        validateSource(wall.source, `${wallPath}.source`)
        validateUncertainty(wall.uncertainty, `${wallPath}.uncertainty`)
      },
    )
  }
}

function validatePrimitive(value: JsonRecord, path: string): void {
  const transform = record(value.transform, `${path}.transform`)
  const position = record(transform.position, `${path}.transform.position`)
  finiteNumber(position.eastMeters, `${path}.transform.position.eastMeters`)
  finiteNumber(position.elevationMeters, `${path}.transform.position.elevationMeters`)
  finiteNumber(position.northMeters, `${path}.transform.position.northMeters`)
  const rotation = record(transform.rotation, `${path}.transform.rotation`)
  finiteNumber(rotation.xRadians, `${path}.transform.rotation.xRadians`)
  finiteNumber(rotation.yRadians, `${path}.transform.rotation.yRadians`)
  finiteNumber(rotation.zRadians, `${path}.transform.rotation.zRadians`)

  const geometry = record(value.geometry, `${path}.geometry`)
  const geometryKind = oneOf(
    geometry.kind,
    ['box', 'cylinder', 'wall', 'polygonExtrusion', 'canopy'],
    `${path}.geometry.kind`,
  )
  switch (geometryKind) {
    case 'box':
      finiteNumber(geometry.widthMeters, `${path}.geometry.widthMeters`)
      finiteNumber(geometry.heightMeters, `${path}.geometry.heightMeters`)
      finiteNumber(geometry.depthMeters, `${path}.geometry.depthMeters`)
      break
    case 'cylinder':
      finiteNumber(geometry.radiusMeters, `${path}.geometry.radiusMeters`)
      finiteNumber(geometry.heightMeters, `${path}.geometry.heightMeters`)
      break
    case 'wall':
      oneOf(geometry.structure, ['wall', 'fence'], `${path}.geometry.structure`)
      finiteNumber(geometry.lengthMeters, `${path}.geometry.lengthMeters`)
      finiteNumber(geometry.heightMeters, `${path}.geometry.heightMeters`)
      finiteNumber(geometry.thicknessMeters, `${path}.geometry.thicknessMeters`)
      break
    case 'polygonExtrusion':
      array(geometry.footprint, `${path}.geometry.footprint`).forEach(
        (pointValue, index) => {
          const pointPath = `${path}.geometry.footprint[${index}]`
          const point = record(pointValue, pointPath)
          finiteNumber(point.eastMeters, `${pointPath}.eastMeters`)
          finiteNumber(point.northMeters, `${pointPath}.northMeters`)
        },
      )
      finiteNumber(geometry.heightMeters, `${path}.geometry.heightMeters`)
      break
    case 'canopy':
      finiteNumber(geometry.eastRadiusMeters, `${path}.geometry.eastRadiusMeters`)
      finiteNumber(geometry.verticalRadiusMeters, `${path}.geometry.verticalRadiusMeters`)
      finiteNumber(geometry.northRadiusMeters, `${path}.geometry.northRadiusMeters`)
      break
  }

  if (value.solarOptics !== undefined) {
    const optics = record(value.solarOptics, `${path}.solarOptics`)
    const mode = oneOf(optics.mode, ['ignored', 'opaque', 'transmissive'], `${path}.solarOptics.mode`)
    if (mode === 'transmissive') {
      finiteNumber(optics.transmittance, `${path}.solarOptics.transmittance`)
    }
  }

  try {
    validatePrimitiveEntity(value as unknown as Parameters<typeof validatePrimitiveEntity>[0])
  } catch (error) {
    fail(path, error instanceof Error ? error.message : 'invalid primitive')
  }
}

function validateFootprint(value: unknown, path: string): void {
  array(value, path).forEach((pointValue, index) => {
    const pointPath = `${path}[${index}]`
    const point = record(pointValue, pointPath)
    finiteNumber(point.eastMeters, `${pointPath}.eastMeters`)
    finiteNumber(point.northMeters, `${pointPath}.northMeters`)
  })
}

function validatePlantingBed(value: JsonRecord, path: string): void {
  validateFootprint(value.footprint, `${path}.footprint`)
  const soil = record(value.soil, `${path}.soil`)
  oneOf(
    soil.texture,
    ['sand', 'loam', 'clay', 'silt', 'unknown', 'custom'],
    `${path}.soil.texture`,
  )
  optionalString(soil.customTextureLabel, `${path}.soil.customTextureLabel`)
  oneOf(
    soil.drainage,
    ['rapid', 'wellDrained', 'moderate', 'poor', 'unknown'],
    `${path}.soil.drainage`,
  )
  oneOf(
    soil.surfaceCover,
    [
      'bareSoil',
      'mulch',
      'turf',
      'groundcover',
      'gravel',
      'concrete',
      'pavers',
      'other',
    ],
    `${path}.soil.surfaceCover`,
  )
  finiteNumber(soil.usableRootDepthMeters, `${path}.soil.usableRootDepthMeters`)
  if (soil.ph !== undefined) finiteNumber(soil.ph, `${path}.soil.ph`)
  if (soil.organicMatterPercent !== undefined) {
    finiteNumber(soil.organicMatterPercent, `${path}.soil.organicMatterPercent`)
  }
  optionalString(soil.notes, `${path}.soil.notes`)

  try {
    validatePlantingBedEntity(value as unknown as PlantingBedEntity)
  } catch (error) {
    fail(path, error instanceof Error ? error.message : 'invalid planting bed')
  }
}

function validateIrrigationZone(value: JsonRecord, path: string): void {
  if (value.footprint !== undefined) {
    validateFootprint(value.footprint, `${path}.footprint`)
  }
  oneOf(
    value.deliveryMethod,
    ['drip', 'spray', 'soaker', 'manual', 'other'],
    `${path}.deliveryMethod`,
  )
  if (value.weeklyTargetMillimeters !== undefined) {
    finiteNumber(value.weeklyTargetMillimeters, `${path}.weeklyTargetMillimeters`)
  }
  optionalString(value.notes, `${path}.notes`)

  try {
    validateIrrigationZoneEntity(value as unknown as IrrigationZoneEntity)
  } catch (error) {
    fail(path, error instanceof Error ? error.message : 'invalid irrigation zone')
  }
}

function validatePlant(value: JsonRecord, path: string): void {
  string(value.taxonId, `${path}.taxonId`)
  string(value.scientificName, `${path}.scientificName`)
  optionalString(value.cultivar, `${path}.cultivar`)
  optionalString(value.commonName, `${path}.commonName`)
  const position = record(value.position, `${path}.position`)
  finiteNumber(position.eastMeters, `${path}.position.eastMeters`)
  finiteNumber(position.elevationMeters, `${path}.position.elevationMeters`)
  finiteNumber(position.northMeters, `${path}.position.northMeters`)
  finiteNumber(value.canopyRadiusMeters, `${path}.canopyRadiusMeters`)
  optionalString(value.plantingBedId, `${path}.plantingBedId`)
  array(value.irrigationZoneIds, `${path}.irrigationZoneIds`).forEach(
    (zoneId, index) => string(zoneId, `${path}.irrigationZoneIds[${index}]`),
  )
  array(value.interactionGroupIds, `${path}.interactionGroupIds`).forEach(
    (groupId, index) => string(groupId, `${path}.interactionGroupIds[${index}]`),
  )

  try {
    validatePlantEntity(value as unknown as PlantEntity)
  } catch (error) {
    fail(path, error instanceof Error ? error.message : 'invalid plant')
  }
}

export function validateProjectData(value: unknown): LandscapeProject {
  const project = record(value, 'project')
  if (
    typeof project.schemaVersion !== 'number' ||
    !Number.isInteger(project.schemaVersion)
  ) {
    return fail('project.schemaVersion', 'expected an integer schema version')
  }
  if (project.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    return fail(
      'project.schemaVersion',
      `Unsupported project schema version ${project.schemaVersion}; this app supports only version ${PROJECT_SCHEMA_VERSION}`,
    )
  }
  string(project.id, 'project.id')
  string(project.name, 'project.name')
  const coordinates = record(project.coordinates, 'project.coordinates')
  finiteNumber(coordinates.northRotationRadians, 'project.coordinates.northRotationRadians')
  optionalString(project.interactionCatalogId, 'project.interactionCatalogId')

  const entityKinds = new Map<string, string>()
  const entities = array(project.entities, 'project.entities')
  entities.forEach((entityValue, index) => {
    const path = `project.entities[${index}]`
    const entity = record(entityValue, path)
    const id = string(entity.id, `${path}.id`)
    if (entityKinds.has(id)) {
      fail(`${path}.id`, `duplicate entity ID "${id}"`)
    }
    string(entity.name, `${path}.name`)
    const kind = oneOf(
      entity.kind,
      ['parcel', 'terrain', 'primitive', 'plantingBed', 'irrigationZone', 'plant'],
      `${path}.kind`,
    )
    entityKinds.set(id, kind)
    if (kind === 'parcel') {
      const geometry = record(entity.geometry, `${path}.geometry`)
      const vertices = array(geometry.vertices, `${path}.geometry.vertices`)
      if (vertices.length < 3) {
        fail(`${path}.geometry.vertices`, 'expected at least three vertices')
      }
      vertices.forEach((pointValue, pointIndex) => {
        const pointPath = `${path}.geometry.vertices[${pointIndex}]`
        const point = record(pointValue, pointPath)
        finiteNumber(point.eastMeters, `${pointPath}.eastMeters`)
        finiteNumber(point.northMeters, `${pointPath}.northMeters`)
      })
      nonnegativeNumber(geometry.uncertaintyMeters, `${path}.geometry.uncertaintyMeters`)
    } else if (kind === 'terrain') {
      validateTerrain(entity, path)
    } else if (kind === 'primitive') {
      validatePrimitive(entity, path)
    } else if (kind === 'plantingBed') {
      validatePlantingBed(entity, path)
    } else if (kind === 'irrigationZone') {
      validateIrrigationZone(entity, path)
    } else {
      validatePlant(entity, path)
    }
  })

  if (!entityKinds.has(DEFAULT_PARCEL_ID)) {
    fail('project.entities', `missing required parcel "${DEFAULT_PARCEL_ID}"`)
  }
  if (entityKinds.get(DEFAULT_PARCEL_ID) !== 'parcel') {
    fail('project.entities', `required entity "${DEFAULT_PARCEL_ID}" must be a parcel`)
  }
  if (!entityKinds.has(DEFAULT_TERRAIN_ID)) {
    fail('project.entities', `missing required terrain "${DEFAULT_TERRAIN_ID}"`)
  }
  if (entityKinds.get(DEFAULT_TERRAIN_ID) !== 'terrain') {
    fail('project.entities', `required entity "${DEFAULT_TERRAIN_ID}" must be terrain`)
  }

  const validatedProject = project as unknown as LandscapeProject
  try {
    validateLandscapeMemberships(validatedProject)
  } catch (error) {
    fail(
      'project.entities',
      error instanceof Error ? error.message : 'invalid landscape membership',
    )
  }
  return validatedProject
}

export function serializeProject(project: LandscapeProject): string {
  return JSON.stringify(project, null, 2)
}

export function deserializeProject(json: string): LandscapeProject {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown parsing error'
    throw new ProjectValidationError(`Project JSON is not valid JSON: ${detail}`)
  }
  return validateProjectData(parsed)
}
