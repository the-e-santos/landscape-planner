import type { ParcelGeometry } from './parcel'
import {
  createFlatTerrainEntity,
  type TerrainEntity,
} from './terrain'

export const PROJECT_SCHEMA_VERSION = 1 as const

export type ProjectId = string
export type EntityId = string

export interface ProjectCoordinates {
  /** Rotation from the local -Z axis to true north, in radians around +Y. */
  readonly northRotationRadians: number
}

export interface ParcelEntity {
  readonly id: EntityId
  readonly kind: 'parcel'
  readonly name: string
  readonly geometry: ParcelGeometry
}

export type ProjectEntity = ParcelEntity | TerrainEntity

export interface LandscapeProject {
  readonly schemaVersion: typeof PROJECT_SCHEMA_VERSION
  readonly id: ProjectId
  readonly name: string
  readonly coordinates: ProjectCoordinates
  readonly entities: readonly ProjectEntity[]
}

export const DEFAULT_PROJECT_ID = 'project.default'
export const DEFAULT_PARCEL_ID = 'parcel.main'

export function createDefaultProject(): LandscapeProject {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: DEFAULT_PROJECT_ID,
    name: 'Untitled landscape',
    coordinates: {
      northRotationRadians: 0,
    },
    entities: [
      {
        id: DEFAULT_PARCEL_ID,
        kind: 'parcel',
        name: 'Property boundary',
        geometry: {
          vertices: [
            { eastMeters: -15, northMeters: -20 },
            { eastMeters: 15, northMeters: -20 },
            { eastMeters: 15, northMeters: 20 },
            { eastMeters: -15, northMeters: 20 },
          ],
          uncertaintyMeters: 0.3,
        },
      },
      createFlatTerrainEntity({
        eastWestMeters: 30,
        northSouthMeters: 40,
      }),
    ],
  }
}

export function getParcelEntity(
  project: LandscapeProject,
  entityId: EntityId,
): ParcelEntity {
  const entity = getProjectEntity(project, entityId)

  if (entity.kind !== 'parcel') {
    throw new Error(`Entity is not a parcel: ${entityId}`)
  }

  return entity
}

export function getTerrainEntity(
  project: LandscapeProject,
  entityId: EntityId,
): TerrainEntity {
  const entity = getProjectEntity(project, entityId)

  if (entity.kind !== 'terrain') {
    throw new Error(`Entity is not terrain: ${entityId}`)
  }

  return entity
}

export function getProjectEntity(
  project: LandscapeProject,
  entityId: EntityId,
): ProjectEntity {
  const entity = project.entities.find(({ id }) => id === entityId)

  if (!entity) {
    throw new Error(`Project entity not found: ${entityId}`)
  }

  return entity
}
