import * as THREE from 'three/webgpu'
import { describe, expect, it } from 'vitest'
import { createRectangleVertices } from '../domain/parcel'
import { createDefaultProject, getTerrainEntity } from '../domain/project'
import {
  createFlatTerrainEntity,
  DEFAULT_TERRAIN_ID,
} from '../domain/terrain'
import { createTerrainView } from './createTerrainView'
import type { TerrainExposureLayer } from '../solar/terrainExposure'

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
    expect((surface.material as THREE.MeshStandardMaterial).side).toBe(
      THREE.DoubleSide,
    )
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

  it('renders an authoritative terrain line with its semantic role', () => {
    const baseTerrain = createFlatTerrainEntity({
      eastWestMeters: 20,
      northSouthMeters: 20,
      elevationMeters: 1,
    })
    const [start, end] = baseTerrain.spotElevations
    const terrain = {
      ...baseTerrain,
      linearConstraints: [
        {
          id: `${baseTerrain.id}.constraint.ridge`,
          name: 'Test ridge',
          role: 'ridge' as const,
          spotElevationIds: [start.id, end.id],
          source: { kind: 'survey' as const },
        },
      ],
    }
    const view = createTerrainView(terrain)
    const line = view.object.getObjectByName(
      `terrain-constraint:${terrain.linearConstraints[0].id}`,
    )

    expect(line).toBeInstanceOf(THREE.Line)
    if (!(line instanceof THREE.Line)) {
      return
    }

    expect(line.userData).toMatchObject({
      constraintId: terrain.linearConstraints[0].id,
      role: 'ridge',
    })
    const position = line.geometry.getAttribute('position')
    expect(position.count).toBe(2)
    expect(position.getY(0)).toBeCloseTo(1.04, 6)
    expect((line.material as THREE.LineBasicMaterial).color.getHex()).toBe(
      0xb34d6b,
    )

    view.dispose()
  })

  it('renders explicit retaining-wall faces and edges', () => {
    const baseTerrain = createFlatTerrainEntity({
      eastWestMeters: 20,
      northSouthMeters: 20,
    })
    const terrain = {
      ...baseTerrain,
      retainingWalls: [
        {
          id: 'wall.scene',
          name: 'Scene wall',
          upperProfile: [
            { id: 'upper.1', eastMeters: -2, northMeters: 0, elevationMeters: 2 },
            { id: 'upper.2', eastMeters: 2, northMeters: 0, elevationMeters: 2 },
          ],
          lowerProfile: [
            { id: 'lower.1', eastMeters: -2, northMeters: 0, elevationMeters: 0 },
            { id: 'lower.2', eastMeters: 2, northMeters: 0, elevationMeters: 0 },
          ],
          upperSide: 'left' as const,
          source: { kind: 'user' as const },
          uncertainty: { horizontalMeters: 0.1, verticalMeters: 0.05 },
        },
      ],
    }
    const view = createTerrainView(terrain)
    const wall = view.object.getObjectByName('terrain-retaining-wall:wall.scene')
    const edges = view.object.getObjectByName(
      'terrain-retaining-wall-edges:wall.scene',
    )

    expect(wall).toBeInstanceOf(THREE.Mesh)
    expect(edges).toBeInstanceOf(THREE.LineSegments)
    if (wall instanceof THREE.Mesh) {
      expect(wall.geometry.getAttribute('position').count).toBe(4)
      expect(wall.geometry.index?.count).toBe(6)
      expect(wall.userData.retainingWallId).toBe('wall.scene')
    }

    view.dispose()
  })

  it('adds and removes a vertex-colored direct-exposure overlay', () => {
    const terrain = createFlatTerrainEntity({
      eastWestMeters: 2,
      northSouthMeters: 2,
    })
    const view = createTerrainView(terrain)
    const layer: TerrainExposureLayer = {
      vertices: [
        { eastMeters: -1, elevationMeters: 0, northMeters: -1, directIrradianceWattsPerSquareMeter: 0, diffuseIrradianceWattsPerSquareMeter: 0, totalIrradianceWattsPerSquareMeter: 0 },
        { eastMeters: 1, elevationMeters: 0, northMeters: -1, directIrradianceWattsPerSquareMeter: 400, diffuseIrradianceWattsPerSquareMeter: 0, totalIrradianceWattsPerSquareMeter: 400 },
        { eastMeters: 0, elevationMeters: 0, northMeters: 1, directIrradianceWattsPerSquareMeter: 800, diffuseIrradianceWattsPerSquareMeter: 0, totalIrradianceWattsPerSquareMeter: 800 },
      ],
      triangles: [[0, 1, 2]],
      spacingMeters: 1,
      minimumIrradianceWattsPerSquareMeter: 0,
      maximumIrradianceWattsPerSquareMeter: 800,
      scaleMaximumIrradianceWattsPerSquareMeter: 800,
      displayChannel: 'direct',
    }

    view.setExposureLayer(layer)
    const overlay = view.object.getObjectByName('terrain-direct-exposure')
    expect(overlay).toBeInstanceOf(THREE.Mesh)
    if (overlay instanceof THREE.Mesh) {
      expect(overlay.geometry.getAttribute('color').count).toBe(3)
      expect((overlay.material as THREE.MeshBasicMaterial).vertexColors).toBe(true)
    }

    view.setExposureLayer(null)
    expect(view.object.getObjectByName('terrain-direct-exposure')).toBeUndefined()
    view.dispose()
  })
})
