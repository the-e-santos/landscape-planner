import { describe, expect, it, vi } from 'vitest'
import { createRectangleVertices } from './parcel'
import {
  createDefaultProject,
  DEFAULT_PARCEL_ID,
  getParcelEntity,
  getPrimitiveEntity,
  getTerrainEntity,
} from './project'
import { applyProjectCommand } from './projectCommands'
import {
  deserializeProject,
  serializeProject,
} from './projectSerialization'
import { createProjectStore } from './projectStore'
import {
  DEFAULT_HOUSE_ID,
  type PrimitiveEntity,
  type PrimitiveGeometry,
} from './primitive'
import {
  DEFAULT_TERRAIN_ID,
  type SpotElevation,
  type TerrainLinearConstraint,
  type TerrainRetainingWall,
} from './terrain'

describe('project model', () => {
  it('round-trips a representative versioned project through JSON', () => {
    const projectWithParcelUpdate = applyProjectCommand(createDefaultProject(), {
      type: 'parcel.geometry.replace',
      entityId: DEFAULT_PARCEL_ID,
      geometry: {
        vertices: [
          { eastMeters: -7.25, northMeters: -4 },
          { eastMeters: 8.5, northMeters: -3.5 },
          { eastMeters: 6, northMeters: 9.75 },
        ],
        uncertaintyMeters: 0.42,
      },
    })
    const constraintSpotIds = getTerrainEntity(
      projectWithParcelUpdate,
      DEFAULT_TERRAIN_ID,
    ).spotElevations
      .slice(0, 3)
      .map(({ id }) => id)
    const projectWithConstraint = applyProjectCommand(projectWithParcelUpdate, {
      type: 'terrain.linearConstraint.add',
      terrainEntityId: DEFAULT_TERRAIN_ID,
      constraint: {
        id: 'terrain.main.constraint.round-trip',
        name: 'Measured grade break',
        role: 'gradeBreak',
        spotElevationIds: constraintSpotIds,
        source: { kind: 'survey', note: 'Serialization fixture' },
      },
    })
    const project = applyProjectCommand(projectWithConstraint, {
      type: 'terrain.retainingWall.add',
      terrainEntityId: DEFAULT_TERRAIN_ID,
      retainingWall: {
        id: 'terrain.main.wall.round-trip',
        name: 'Measured retaining wall',
        upperProfile: [
          { id: 'upper.1', eastMeters: -2, northMeters: 1, elevationMeters: 2 },
          { id: 'upper.2', eastMeters: 2, northMeters: 1, elevationMeters: 2.2 },
        ],
        lowerProfile: [
          { id: 'lower.1', eastMeters: -2, northMeters: 1, elevationMeters: 0.5 },
          { id: 'lower.2', eastMeters: 2, northMeters: 1, elevationMeters: 0.6 },
        ],
        upperSide: 'left',
        source: { kind: 'survey', note: 'Serialization fixture' },
        uncertainty: { horizontalMeters: 0.02, verticalMeters: 0.01 },
      },
    })

    expect(deserializeProject(serializeProject(project))).toEqual(project)
    expect(
      getPrimitiveEntity(
        deserializeProject(serializeProject(project)),
        DEFAULT_HOUSE_ID,
      ).geometry.kind,
    ).toBe('box')
  })

  it('rejects JSON with an unsupported schema version', () => {
    expect(() =>
      deserializeProject(JSON.stringify({ schemaVersion: 2 })),
    ).toThrow('Unsupported project schema version')
  })

  it('round-trips every supported primitive geometry variant', () => {
    const geometries: readonly PrimitiveGeometry[] = [
      { kind: 'cylinder', radiusMeters: 0.7, heightMeters: 2.5 },
      {
        kind: 'wall',
        structure: 'fence',
        lengthMeters: 5,
        heightMeters: 1.8,
        thicknessMeters: 0.08,
      },
      {
        kind: 'polygonExtrusion',
        footprint: [
          { eastMeters: -1, northMeters: -1 },
          { eastMeters: 2, northMeters: -1 },
          { eastMeters: 0, northMeters: 2 },
        ],
        heightMeters: 0.75,
      },
      {
        kind: 'canopy',
        eastRadiusMeters: 2.2,
        verticalRadiusMeters: 1.4,
        northRadiusMeters: 1.8,
      },
    ]
    const base = createDefaultProject()
    const primitives: PrimitiveEntity[] = geometries.map((geometry, index) => ({
      id: `primitive.catalog.${index + 1}`,
      kind: 'primitive',
      name: `Catalog primitive ${index + 1}`,
      transform: {
        position: {
          eastMeters: index,
          elevationMeters: 1,
          northMeters: index,
        },
        rotation: { xRadians: 0, yRadians: index * 0.1, zRadians: 0 },
      },
      geometry,
    }))
    const project = { ...base, entities: [...base.entities, ...primitives] }

    expect(deserializeProject(serializeProject(project))).toEqual(project)
  })

  it('updates an entity by ID without mutating the previous project', () => {
    const original = createDefaultProject()
    const geometry = {
      vertices: createRectangleVertices(12, 18),
      uncertaintyMeters: 0.1,
    }
    const updated = applyProjectCommand(original, {
      type: 'parcel.geometry.replace',
      entityId: DEFAULT_PARCEL_ID,
      geometry,
    })

    expect(getParcelEntity(updated, DEFAULT_PARCEL_ID).geometry).toEqual(
      geometry,
    )
    expect(getParcelEntity(original, DEFAULT_PARCEL_ID).geometry).not.toEqual(
      geometry,
    )
  })

  it('adds, replaces, and removes a spot elevation by stable ID', () => {
    const original = createDefaultProject()
    const addedSpot: SpotElevation = {
      id: 'terrain.main.spot.center',
      eastMeters: 0,
      northMeters: 0,
      elevationMeters: 1,
      source: { kind: 'user' },
      uncertainty: { horizontalMeters: 0.1, verticalMeters: 0.05 },
    }
    const withAddedSpot = applyProjectCommand(original, {
      type: 'terrain.spotElevation.add',
      terrainEntityId: DEFAULT_TERRAIN_ID,
      spotElevation: addedSpot,
    })
    const replacedSpot = { ...addedSpot, elevationMeters: 1.75 }
    const withReplacedSpot = applyProjectCommand(withAddedSpot, {
      type: 'terrain.spotElevation.replace',
      terrainEntityId: DEFAULT_TERRAIN_ID,
      spotElevation: replacedSpot,
    })
    const withRemovedSpot = applyProjectCommand(withReplacedSpot, {
      type: 'terrain.spotElevation.remove',
      terrainEntityId: DEFAULT_TERRAIN_ID,
      spotElevationId: addedSpot.id,
    })

    expect(
      getTerrainEntity(original, DEFAULT_TERRAIN_ID).spotElevations,
    ).not.toContainEqual(addedSpot)
    expect(
      getTerrainEntity(withAddedSpot, DEFAULT_TERRAIN_ID).spotElevations,
    ).toContainEqual(addedSpot)
    expect(
      getTerrainEntity(withReplacedSpot, DEFAULT_TERRAIN_ID).spotElevations,
    ).toContainEqual(replacedSpot)
    expect(
      getTerrainEntity(withRemovedSpot, DEFAULT_TERRAIN_ID).spotElevations,
    ).not.toContainEqual(replacedSpot)
  })

  it('adds, replaces, and removes a linear constraint by stable ID', () => {
    const original = createDefaultProject()
    const spotIds = getTerrainEntity(
      original,
      DEFAULT_TERRAIN_ID,
    ).spotElevations.map(({ id }) => id)
    const constraint: TerrainLinearConstraint = {
      id: 'terrain.main.constraint.test',
      name: 'Test grade break',
      role: 'gradeBreak',
      spotElevationIds: spotIds.slice(0, 2),
      source: { kind: 'user' },
    }
    const withConstraint = applyProjectCommand(original, {
      type: 'terrain.linearConstraint.add',
      terrainEntityId: DEFAULT_TERRAIN_ID,
      constraint,
    })
    const replacement = { ...constraint, name: 'Test ridge', role: 'ridge' as const }
    const withReplacement = applyProjectCommand(withConstraint, {
      type: 'terrain.linearConstraint.replace',
      terrainEntityId: DEFAULT_TERRAIN_ID,
      constraint: replacement,
    })
    const withoutConstraint = applyProjectCommand(withReplacement, {
      type: 'terrain.linearConstraint.remove',
      terrainEntityId: DEFAULT_TERRAIN_ID,
      constraintId: constraint.id,
    })

    expect(
      getTerrainEntity(original, DEFAULT_TERRAIN_ID).linearConstraints,
    ).toEqual([])
    expect(
      getTerrainEntity(withConstraint, DEFAULT_TERRAIN_ID).linearConstraints,
    ).toContainEqual(constraint)
    expect(
      getTerrainEntity(withReplacement, DEFAULT_TERRAIN_ID).linearConstraints,
    ).toContainEqual(replacement)
    expect(
      getTerrainEntity(withoutConstraint, DEFAULT_TERRAIN_ID).linearConstraints,
    ).toEqual([])
  })

  it('adds, replaces, and removes a retaining wall by stable ID', () => {
    const original = createDefaultProject()
    const retainingWall: TerrainRetainingWall = {
      id: 'terrain.main.wall.test',
      name: 'Test wall',
      upperProfile: [
        { id: 'upper.1', eastMeters: -1, northMeters: 0, elevationMeters: 1 },
        { id: 'upper.2', eastMeters: 1, northMeters: 0, elevationMeters: 1 },
      ],
      lowerProfile: [
        { id: 'lower.1', eastMeters: -1, northMeters: 0, elevationMeters: 0 },
        { id: 'lower.2', eastMeters: 1, northMeters: 0, elevationMeters: 0 },
      ],
      upperSide: 'right',
      source: { kind: 'user' },
      uncertainty: { horizontalMeters: 0.1, verticalMeters: 0.05 },
    }
    const withWall = applyProjectCommand(original, {
      type: 'terrain.retainingWall.add',
      terrainEntityId: DEFAULT_TERRAIN_ID,
      retainingWall,
    })
    const replacement = { ...retainingWall, name: 'Revised wall' }
    const withReplacement = applyProjectCommand(withWall, {
      type: 'terrain.retainingWall.replace',
      terrainEntityId: DEFAULT_TERRAIN_ID,
      retainingWall: replacement,
    })
    const withoutWall = applyProjectCommand(withReplacement, {
      type: 'terrain.retainingWall.remove',
      terrainEntityId: DEFAULT_TERRAIN_ID,
      retainingWallId: retainingWall.id,
    })

    expect(getTerrainEntity(original, DEFAULT_TERRAIN_ID).retainingWalls).toEqual([])
    expect(getTerrainEntity(withWall, DEFAULT_TERRAIN_ID).retainingWalls).toContainEqual(
      retainingWall,
    )
    expect(
      getTerrainEntity(withReplacement, DEFAULT_TERRAIN_ID).retainingWalls,
    ).toContainEqual(replacement)
    expect(getTerrainEntity(withoutWall, DEFAULT_TERRAIN_ID).retainingWalls).toEqual([])
  })

  it('notifies subscribers after dispatching a command', () => {
    const store = createProjectStore(createDefaultProject())
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)

    store.dispatch({
      type: 'project.northRotation.set',
      northRotationRadians: Math.PI / 4,
    })

    expect(listener).toHaveBeenCalledOnce()
    expect(store.getSnapshot().coordinates.northRotationRadians).toBe(
      Math.PI / 4,
    )

    unsubscribe()
  })

  it('adds, replaces, and removes a primitive by stable ID', () => {
    const original = createDefaultProject()
    const primitive = {
      id: 'primitive.box.test',
      kind: 'primitive',
      name: 'Test box',
      transform: {
        position: { eastMeters: 1, elevationMeters: 0.5, northMeters: 2 },
        rotation: { xRadians: 0, yRadians: 0.25, zRadians: 0 },
      },
      geometry: {
        kind: 'box',
        widthMeters: 1,
        heightMeters: 1,
        depthMeters: 2,
      },
    } satisfies PrimitiveEntity
    const withPrimitive = applyProjectCommand(original, {
      type: 'primitive.add',
      primitive,
    })
    const replacement = {
      ...primitive,
      geometry: { ...primitive.geometry, widthMeters: 3 },
    }
    const withReplacement = applyProjectCommand(withPrimitive, {
      type: 'primitive.replace',
      primitive: replacement,
    })
    const withoutPrimitive = applyProjectCommand(withReplacement, {
      type: 'primitive.remove',
      entityId: primitive.id,
    })

    expect(getPrimitiveEntity(withPrimitive, primitive.id)).toEqual(primitive)
    expect(getPrimitiveEntity(withReplacement, primitive.id)).toEqual(replacement)
    expect(withoutPrimitive.entities.some(({ id }) => id === primitive.id)).toBe(false)
    expect(() => applyProjectCommand(original, {
      type: 'primitive.add',
      primitive: { ...primitive, geometry: { ...primitive.geometry, heightMeters: 0 } },
    })).toThrow('Primitive dimensions must be greater than zero')
  })

  it('undoes and redoes commands while clearing stale redo history', () => {
    const store = createProjectStore(createDefaultProject())
    store.dispatch({
      type: 'project.northRotation.set',
      northRotationRadians: 0.5,
    })

    expect(store.canUndo()).toBe(true)
    store.undo()
    expect(store.getSnapshot().coordinates.northRotationRadians).toBe(0)
    expect(store.canRedo()).toBe(true)
    store.redo()
    expect(store.getSnapshot().coordinates.northRotationRadians).toBe(0.5)

    store.undo()
    store.dispatch({
      type: 'project.northRotation.set',
      northRotationRadians: 0.75,
    })
    expect(store.canRedo()).toBe(false)
  })
})
