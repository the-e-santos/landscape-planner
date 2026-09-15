import { describe, expect, it, vi } from 'vitest'
import { createRectangleVertices } from './parcel'
import {
  createDefaultProject,
  DEFAULT_PARCEL_ID,
  getProjectEntity,
} from './project'
import { applyProjectCommand } from './projectCommands'
import {
  deserializeProject,
  serializeProject,
} from './projectSerialization'
import { createProjectStore } from './projectStore'

describe('project model', () => {
  it('round-trips a representative versioned project through JSON', () => {
    const project = applyProjectCommand(createDefaultProject(), {
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

    expect(getProjectEntity(updated, DEFAULT_PARCEL_ID).geometry).toEqual(
      geometry,
    )
    expect(getProjectEntity(original, DEFAULT_PARCEL_ID).geometry).not.toEqual(
      geometry,
    )
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
