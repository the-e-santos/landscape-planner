import type { ParcelGeometry } from './parcel'
import type { EntityId, LandscapeProject, ProjectEntity } from './project'
import {
  cloneLandscapeSemanticEntity,
  validateLandscapeMemberships,
  validateLandscapeSemanticEntity,
  type LandscapeSemanticEntity,
} from './landscape'
import {
  clonePrimitiveEntity,
  validatePrimitiveEntity,
  type PrimitiveEntity,
} from './primitive'
import {
  getTerrainLinearConstraints,
  getTerrainRetainingWalls,
  type SpotElevation,
  type TerrainEntity,
  type TerrainLinearConstraint,
  type TerrainRetainingWall,
} from './terrain'

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
      readonly type: 'primitive.add'
      readonly primitive: PrimitiveEntity
    }
  | {
      readonly type: 'primitive.replace'
      readonly primitive: PrimitiveEntity
    }
  | {
      readonly type: 'primitive.remove'
      readonly entityId: EntityId
    }
  | {
      readonly type: 'landscapeSemantic.add'
      readonly entity: LandscapeSemanticEntity
    }
  | {
      readonly type: 'landscapeSemantic.replace'
      readonly entity: LandscapeSemanticEntity
    }
  | {
      readonly type: 'landscapeSemantic.remove'
      readonly entityId: EntityId
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
  | {
      readonly type: 'terrain.linearConstraint.add'
      readonly terrainEntityId: EntityId
      readonly constraint: TerrainLinearConstraint
    }
  | {
      readonly type: 'terrain.linearConstraint.replace'
      readonly terrainEntityId: EntityId
      readonly constraint: TerrainLinearConstraint
    }
  | {
      readonly type: 'terrain.linearConstraint.remove'
      readonly terrainEntityId: EntityId
      readonly constraintId: string
    }
  | {
      readonly type: 'terrain.retainingWall.add'
      readonly terrainEntityId: EntityId
      readonly retainingWall: TerrainRetainingWall
    }
  | {
      readonly type: 'terrain.retainingWall.replace'
      readonly terrainEntityId: EntityId
      readonly retainingWall: TerrainRetainingWall
    }
  | {
      readonly type: 'terrain.retainingWall.remove'
      readonly terrainEntityId: EntityId
      readonly retainingWallId: string
    }

function cloneSpotElevation(spot: SpotElevation): SpotElevation {
  return {
    ...spot,
    source: { ...spot.source },
    uncertainty: { ...spot.uncertainty },
  }
}

function cloneLinearConstraint(
  constraint: TerrainLinearConstraint,
): TerrainLinearConstraint {
  return {
    ...constraint,
    spotElevationIds: [...constraint.spotElevationIds],
    source: { ...constraint.source },
  }
}

function cloneRetainingWall(
  retainingWall: TerrainRetainingWall,
): TerrainRetainingWall {
  return {
    ...retainingWall,
    upperProfile: retainingWall.upperProfile.map((point) => ({ ...point })),
    lowerProfile: retainingWall.lowerProfile.map((point) => ({ ...point })),
    source: { ...retainingWall.source },
    uncertainty: { ...retainingWall.uncertainty },
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

function validateLandscapeResult(project: LandscapeProject): LandscapeProject {
  validateLandscapeMemberships(project)
  return project
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

    case 'primitive.add':
      validatePrimitiveEntity(command.primitive)
      if (project.entities.some(({ id }) => id === command.primitive.id)) {
        throw new Error(`Project entity already exists: ${command.primitive.id}`)
      }

      return {
        ...project,
        entities: [...project.entities, clonePrimitiveEntity(command.primitive)],
      }

    case 'primitive.replace':
      validatePrimitiveEntity(command.primitive)
      return replaceEntity(project, command.primitive.id, (entity) => {
        if (entity.kind !== 'primitive') {
          throw new Error(`Entity is not a primitive: ${command.primitive.id}`)
        }

        return clonePrimitiveEntity(command.primitive)
      })

    case 'primitive.remove':
      if (!project.entities.some(({ id }) => id === command.entityId)) {
        throw new Error(`Project entity not found: ${command.entityId}`)
      }
      if (
        project.entities.find(({ id }) => id === command.entityId)?.kind !==
        'primitive'
      ) {
        throw new Error(`Entity is not a primitive: ${command.entityId}`)
      }

      return {
        ...project,
        entities: project.entities.filter(({ id }) => id !== command.entityId),
      }

    case 'landscapeSemantic.add': {
      validateLandscapeSemanticEntity(command.entity)
      if (project.entities.some(({ id }) => id === command.entity.id)) {
        throw new Error(`Project entity already exists: ${command.entity.id}`)
      }

      return validateLandscapeResult({
        ...project,
        entities: [
          ...project.entities,
          cloneLandscapeSemanticEntity(command.entity),
        ],
      })
    }

    case 'landscapeSemantic.replace': {
      validateLandscapeSemanticEntity(command.entity)
      const result = replaceEntity(project, command.entity.id, (entity) => {
        if (
          entity.kind !== 'plantingBed' &&
          entity.kind !== 'irrigationZone' &&
          entity.kind !== 'plant'
        ) {
          throw new Error(
            `Entity is not a landscape semantic entity: ${command.entity.id}`,
          )
        }
        if (entity.kind !== command.entity.kind) {
          throw new Error(
            `Cannot change landscape entity kind from ${entity.kind} to ${command.entity.kind}`,
          )
        }

        return cloneLandscapeSemanticEntity(command.entity)
      })
      return validateLandscapeResult(result)
    }

    case 'landscapeSemantic.remove': {
      const entity = project.entities.find(({ id }) => id === command.entityId)
      if (!entity) {
        throw new Error(`Project entity not found: ${command.entityId}`)
      }
      if (
        entity.kind !== 'plantingBed' &&
        entity.kind !== 'irrigationZone' &&
        entity.kind !== 'plant'
      ) {
        throw new Error(
          `Entity is not a landscape semantic entity: ${command.entityId}`,
        )
      }

      return validateLandscapeResult({
        ...project,
        entities: project.entities.filter(({ id }) => id !== command.entityId),
      })
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

    case 'terrain.linearConstraint.add':
      return updateTerrain(project, command.terrainEntityId, (terrain) => {
        const linearConstraints = getTerrainLinearConstraints(terrain)
        if (linearConstraints.some(({ id }) => id === command.constraint.id)) {
          throw new Error(
            `Terrain constraint already exists: ${command.constraint.id}`,
          )
        }

        return {
          ...terrain,
          linearConstraints: [
            ...linearConstraints,
            cloneLinearConstraint(command.constraint),
          ],
        }
      })

    case 'terrain.linearConstraint.replace':
      return updateTerrain(project, command.terrainEntityId, (terrain) => {
        let found = false
        const linearConstraints = getTerrainLinearConstraints(terrain).map(
          (constraint) => {
            if (constraint.id !== command.constraint.id) {
              return constraint
            }

            found = true
            return cloneLinearConstraint(command.constraint)
          },
        )

        if (!found) {
          throw new Error(
            `Terrain constraint not found: ${command.constraint.id}`,
          )
        }

        return { ...terrain, linearConstraints }
      })

    case 'terrain.linearConstraint.remove':
      return updateTerrain(project, command.terrainEntityId, (terrain) => {
        const currentConstraints = getTerrainLinearConstraints(terrain)
        const linearConstraints = currentConstraints.filter(
          ({ id }) => id !== command.constraintId,
        )

        if (linearConstraints.length === currentConstraints.length) {
          throw new Error(
            `Terrain constraint not found: ${command.constraintId}`,
          )
        }

        return { ...terrain, linearConstraints }
      })

    case 'terrain.retainingWall.add':
      return updateTerrain(project, command.terrainEntityId, (terrain) => {
        const retainingWalls = getTerrainRetainingWalls(terrain)
        if (
          retainingWalls.some(({ id }) => id === command.retainingWall.id)
        ) {
          throw new Error(
            `Terrain retaining wall already exists: ${command.retainingWall.id}`,
          )
        }

        return {
          ...terrain,
          retainingWalls: [
            ...retainingWalls,
            cloneRetainingWall(command.retainingWall),
          ],
        }
      })

    case 'terrain.retainingWall.replace':
      return updateTerrain(project, command.terrainEntityId, (terrain) => {
        let found = false
        const retainingWalls = getTerrainRetainingWalls(terrain).map((wall) => {
          if (wall.id !== command.retainingWall.id) {
            return wall
          }

          found = true
          return cloneRetainingWall(command.retainingWall)
        })

        if (!found) {
          throw new Error(
            `Terrain retaining wall not found: ${command.retainingWall.id}`,
          )
        }

        return { ...terrain, retainingWalls }
      })

    case 'terrain.retainingWall.remove':
      return updateTerrain(project, command.terrainEntityId, (terrain) => {
        const currentWalls = getTerrainRetainingWalls(terrain)
        const retainingWalls = currentWalls.filter(
          ({ id }) => id !== command.retainingWallId,
        )

        if (retainingWalls.length === currentWalls.length) {
          throw new Error(
            `Terrain retaining wall not found: ${command.retainingWallId}`,
          )
        }

        return { ...terrain, retainingWalls }
      })
  }
}
