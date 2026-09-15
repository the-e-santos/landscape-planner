import type { ParcelGeometry } from './parcel'
import type { EntityId, LandscapeProject, ProjectEntity } from './project'

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
  }
}
