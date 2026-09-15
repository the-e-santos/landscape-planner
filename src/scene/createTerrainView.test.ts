import * as THREE from 'three/webgpu'
import { describe, expect, it } from 'vitest'
import { createRectangleVertices } from '../domain/parcel'
import { createDefaultProject, getTerrainEntity } from '../domain/project'
import {
  createFlatTerrainEntity,
  DEFAULT_TERRAIN_ID,
} from '../domain/terrain'
import { createTerrainView } from './createTerrainView'

describe('terrain scene view', () => {
  it('projects a derived terrain mesh into world coordinates', () => {
    const terrain = createFlatTerrainEntity({
      eastWestMeters: 20,
      northSouthMeters: 30,
      elevationMeters: 2.5,
    })
    const view = createTerrainView(terrain)
    const surface = view.object.getObjectByName('terrain-surface')

    expect(surface).toBeInstanceOf(THREE.Mesh)
    if (!(surface instanceof THREE.Mesh)) {
      return
    }

    const position = surface.geometry.getAttribute('position')
    expect(position.count).toBe(4)
    expect(surface.geometry.index?.count).toBe(6)
    expect([position.getX(0), position.getY(0), position.getZ(0)]).toEqual([
      -10,
      2.5,
      15,
    ])
    expect(view.object.getObjectByName('terrain-wireframe')).toBeInstanceOf(
      THREE.LineSegments,
    )
    expect(
      view.object.children.filter(({ name }) => name.startsWith('terrain-spot:')),
    ).toHaveLength(4)

    view.dispose()
  })

  it('clears derived geometry when terrain input becomes invalid', () => {
    const terrain = createFlatTerrainEntity({
      eastWestMeters: 20,
      northSouthMeters: 30,
    })
    const view = createTerrainView(terrain)

    view.update({
      ...terrain,
      spotElevations: terrain.spotElevations.slice(0, 2),
    })

    expect(view.object.children).toHaveLength(0)
    expect(view.object.userData.validationIssues).toEqual([
      expect.objectContaining({ code: 'insufficient-points' }),
    ])

    view.dispose()
  })

  it('renders the default terrain with visible relief and four faces', () => {
    const terrain = getTerrainEntity(
      createDefaultProject(),
      DEFAULT_TERRAIN_ID,
    )
    const view = createTerrainView(terrain)
    const surface = view.object.getObjectByName('terrain-surface')

    expect(surface).toBeInstanceOf(THREE.Mesh)
    if (!(surface instanceof THREE.Mesh)) {
      return
    }

    const position = surface.geometry.getAttribute('position')
    const elevations = Array.from(
      { length: position.count },
      (_, index) => position.getY(index),
    )
    expect(Math.max(...elevations) - Math.min(...elevations)).toBeGreaterThan(1)
    expect(surface.geometry.index?.count).toBe(12)

    view.dispose()
  })

  it('clips the surface while retaining authoritative outside spot markers', () => {
    const terrain = createFlatTerrainEntity({
      eastWestMeters: 20,
      northSouthMeters: 20,
    })
    const view = createTerrainView(terrain, {
      vertices: createRectangleVertices(10, 10),
      uncertaintyMeters: 0,
    })
    const surface = view.object.getObjectByName('terrain-surface')

    expect(surface).toBeInstanceOf(THREE.Mesh)
    if (!(surface instanceof THREE.Mesh)) {
      return
    }

    const position = surface.geometry.getAttribute('position')
    const eastValues = Array.from(
      { length: position.count },
      (_, index) => position.getX(index),
    )
    expect(Math.min(...eastValues)).toBeCloseTo(-5, 6)
    expect(Math.max(...eastValues)).toBeCloseTo(5, 6)
    expect(
      view.object.children.filter(({ name }) => name.startsWith('terrain-spot:')),
    ).toHaveLength(4)

    view.dispose()
  })
})
