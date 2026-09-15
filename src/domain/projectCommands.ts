import type { ParcelGeometry } from './parcel'
import type { EntityId, LandscapeProject, ProjectEntity } from './project'
import type { SpotElevation, TerrainEntity } from './terrain'

export type ProjectCommand =
  | {
      readonly type: 'parcel.geometry.replace'
      readonly entityId: EntityId
      readonly geometry: ParcelGeometry
    }
  | {
      readonly type: 'project.northRotation.set'
      readonly northRotationRadians: number
    }
  | {
      readonly type: 'terrain.spotElevation.add'
      readonly terrainEntityId: EntityId
      readonly spotElevation: SpotElevation
    }
  | {
      readonly type: 'terrain.spotElevation.replace'
      readonly terrainEntityId: EntityId
      readonly spotElevation: SpotElevation
    }
  | {
      readonly type: 'terrain.spotElevation.remove'
      readonly terrainEntityId: EntityId
      readonly spotElevationId: string
    }

function cloneSpotElevation(spot: SpotElevation): SpotElevation {
  return {
    ...spot,
    source: { ...spot.source },
    uncertainty: { ...spot.uncertainty },
  }
}

function updateTerrain(
  project: LandscapeProject,
  entityId: EntityId,
  update: (terrain: TerrainEntity) => TerrainEntity,
): LandscapeProject {
  return replaceEntity(project, entityId, (entity) => {
    if (entity.kind !== 'terrain') {
      throw new Error(`Entity is not terrain: ${entityId}`)
    }

    return update(entity)
  })
}

function replaceEntity(
  project: LandscapeProject,
  entityId: EntityId,
  update: (entity: ProjectEntity) => ProjectEntity,
): LandscapeProject {
  let found = false
  const entities = project.entities.map((entity) => {
    if (entity.id !== entityId) {
      return entity
    }

    found = true
    return update(entity)
  })

  if (!found) {
    throw new Error(`Project entity not found: ${entityId}`)
  }

  return { ...project, entities }
}

export function applyProjectCommand(
  project: LandscapeProject,
  command: ProjectCommand,
): LandscapeProject {
  switch (command.type) {
    case 'parcel.geometry.replace':
      return replaceEntity(project, command.entityId, (entity) => {
        if (entity.kind !== 'parcel') {
          throw new Error(`Entity is not a parcel: ${command.entityId}`)
        }

        return {
          ...entity,
          geometry: {
            vertices: command.geometry.vertices.map((vertex) => ({ ...vertex })),
            uncertaintyMeters: command.geometry.uncertaintyMeters,
          },
        }
      })

    case 'project.northRotation.set':
      if (!Number.isFinite(command.northRotationRadians)) {
        throw new Error('North rotation must be a finite number')
      }

      return {
        ...project,
        coordinates: {
          ...project.coordinates,
          northRotationRadians: command.northRotationRadians,
        },
      }

    case 'terrain.spotElevation.add':
      return updateTerrain(project, command.terrainEntityId, (terrain) => {
        if (
          terrain.spotElevations.some(
            ({ id }) => id === command.spotElevation.id,
          )
        ) {
          throw new Error(
            `Spot elevation already exists: ${command.spotElevation.id}`,
          )
        }

        return {
          ...terrain,
          spotElevations: [
            ...terrain.spotElevations,
            cloneSpotElevation(command.spotElevation),
          ],
        }
      })

    case 'terrain.spotElevation.replace':
      return updateTerrain(project, command.terrainEntityId, (terrain) => {
        let found = false
        const spotElevations = terrain.spotElevations.map((spot) => {
          if (spot.id !== command.spotElevation.id) {
            return spot
          }

          found = true
          return cloneSpotElevation(command.spotElevation)
        })

        if (!found) {
          throw new Error(
            `Spot elevation not found: ${command.spotElevation.id}`,
          )
        }

        return { ...terrain, spotElevations }
      })

    case 'terrain.spotElevation.remove':
      return updateTerrain(project, command.terrainEntityId, (terrain) => {
        const spotElevations = terrain.spotElevations.filter(
          ({ id }) => id !== command.spotElevationId,
        )

        if (spotElevations.length === terrain.spotElevations.length) {
          throw new Error(
            `Spot elevation not found: ${command.spotElevationId}`,
          )
        }

        return { ...terrain, spotElevations }
      })
  }
}
