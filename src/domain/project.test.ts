import { describe, expect, it, vi } from 'vitest'
import { createRectangleVertices } from './parcel'
import {
  createDefaultProject,
  DEFAULT_PARCEL_ID,
  getParcelEntity,
  getTerrainEntity,
} from './project'
import { applyProjectCommand } from './projectCommands'
import {
  deserializeProject,
  serializeProject,
} from './projectSerialization'
import { createProjectStore } from './projectStore'
import {
  DEFAULT_TERRAIN_ID,
  type SpotElevation,
  type TerrainLinearConstraint,
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
    const project = applyProjectCommand(projectWithParcelUpdate, {
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

    expect(deserializeProject(serializeProject(project))).toEqual(project)
  })

  it('rejects JSON with an unsupported schema version', () => {
    expect(() =>
      deserializeProject(JSON.stringify({ schemaVersion: 2 })),
    ).toThrow('Unsupported project schema version')
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
})
