import * as THREE from 'three/webgpu'
import { describe, expect, it } from 'vitest'
import { createDefaultHouseEntity } from '../domain/primitive'
import type { PrimitiveEntity, PrimitiveGeometry } from '../domain/primitive'
import { createPrimitiveView } from './createPrimitiveView'
import type { PrimitiveExposureLayer } from '../solar/primitiveExposure'

describe('primitive scene view', () => {
  it('projects a domain box into the project coordinate frame', () => {
    const entity = createDefaultHouseEntity()
    const view = createPrimitiveView(entity)
    const mesh = view.object.getObjectByName(`primitive-mesh:${entity.id}`)

    expect(mesh).toBeInstanceOf(THREE.Mesh)
    expect(view.object.position.toArray()).toEqual([-4, 2.2, -0])
    expect(view.object.userData.entityId).toBe(entity.id)
    if (mesh instanceof THREE.Mesh) {
      expect((mesh.geometry as THREE.BoxGeometry).parameters).toMatchObject({
        width: 6,
        height: 3,
        depth: 8,
      })
    }

    view.update({
      ...entity,
      transform: {
        ...entity.transform,
        position: { eastMeters: 2, elevationMeters: 1, northMeters: 4 },
      },
    })
    expect(view.object.position.toArray()).toEqual([2, 1, -4])

    view.dispose()
  })

  it.each([
    ['cylinder', { kind: 'cylinder', radiusMeters: 1, heightMeters: 2 }, [2, 2, 2]],
    [
      'wall',
      {
        kind: 'wall',
        structure: 'wall',
        lengthMeters: 4,
        heightMeters: 2,
        thicknessMeters: 0.25,
      },
      [4, 2, 0.25],
    ],
    [
      'polygonExtrusion',
      {
        kind: 'polygonExtrusion',
        footprint: [
          { eastMeters: -1, northMeters: -1 },
          { eastMeters: 1, northMeters: -1 },
          { eastMeters: 0, northMeters: 1 },
        ],
        heightMeters: 0.6,
      },
      [2, 0.6, 2],
    ],
    [
      'canopy',
      {
        kind: 'canopy',
        eastRadiusMeters: 2,
        verticalRadiusMeters: 1.5,
        northRadiusMeters: 1,
      },
      [4, 3, 2],
    ],
  ] satisfies readonly (
    readonly [string, PrimitiveGeometry, readonly number[]]
  )[])(
    'creates derived mesh geometry for %s',
    (_kind, geometry, expectedSize) => {
      const entity: PrimitiveEntity = {
        id: `primitive.${geometry.kind}.scene-test`,
        kind: 'primitive',
        name: 'Scene test',
        transform: {
          position: { eastMeters: 0, elevationMeters: 0, northMeters: 0 },
          rotation: { xRadians: 0, yRadians: 0, zRadians: 0 },
        },
        geometry,
      }
      const view = createPrimitiveView(entity)
      const mesh = view.object.getObjectByName(`primitive-mesh:${entity.id}`)

      expect(mesh).toBeInstanceOf(THREE.Mesh)
      if (mesh instanceof THREE.Mesh) {
        mesh.geometry.computeBoundingBox()
        expect(mesh.geometry.boundingBox).not.toBeNull()
        const size = mesh.geometry.boundingBox?.getSize(new THREE.Vector3())
        expect(size?.x).toBeCloseTo(expectedSize[0], 6)
        expect(size?.y).toBeCloseTo(expectedSize[1], 6)
        expect(size?.z).toBeCloseTo(expectedSize[2], 6)
      }

      view.dispose()
    },
  )

  it('centers an extruded polygon vertically around its local origin', () => {
    const entity: PrimitiveEntity = {
      id: 'primitive.extrusion.bounds',
      kind: 'primitive',
      name: 'Extrusion bounds',
      transform: {
        position: { eastMeters: 0, elevationMeters: 0, northMeters: 0 },
        rotation: { xRadians: 0, yRadians: 0, zRadians: 0 },
      },
      geometry: {
        kind: 'polygonExtrusion',
        footprint: [
          { eastMeters: -1, northMeters: -1 },
          { eastMeters: 1, northMeters: -1 },
          { eastMeters: 0, northMeters: 1 },
        ],
        heightMeters: 0.8,
      },
    }
    const view = createPrimitiveView(entity)
    const mesh = view.object.children[0]

    expect(mesh).toBeInstanceOf(THREE.Mesh)
    if (mesh instanceof THREE.Mesh) {
      mesh.geometry.computeBoundingBox()
      expect(mesh.geometry.boundingBox?.min.y).toBeCloseTo(-0.4, 6)
      expect(mesh.geometry.boundingBox?.max.y).toBeCloseTo(0.4, 6)
    }

    view.dispose()
  })

  it('highlights selection and retains it through a view update', () => {
    const entity = createDefaultHouseEntity()
    const view = createPrimitiveView(entity)
    const getMaterial = () => {
      const mesh = view.object.children[0]
      expect(mesh).toBeInstanceOf(THREE.Mesh)
      return (mesh as THREE.Mesh).material as THREE.MeshStandardMaterial
    }

    expect(getMaterial().emissiveIntensity).toBe(0)
    view.setSelected(true)
    expect(getMaterial().emissiveIntensity).toBe(0.7)
    expect(getMaterial().emissive.getHex()).toBe(0x3d6f48)

    view.update({ ...entity, name: 'Updated while selected' })
    expect(getMaterial().emissiveIntensity).toBe(0.7)

    view.setSelected(false)
    expect(getMaterial().emissiveIntensity).toBe(0)
    view.dispose()
  })

  it('adds and removes a local vertex-colored exposure atlas', () => {
    const entity = createDefaultHouseEntity()
    const view = createPrimitiveView(entity)
    const layer: PrimitiveExposureLayer = {
      entityId: entity.id,
      vertices: [
        {
          position: { x: -1, y: 1, z: -1 },
          normal: { x: 0, y: 1, z: 0 },
          exposure: { direct: 0, diffuse: 0, total: 0 },
        },
        {
          position: { x: 1, y: 1, z: -1 },
          normal: { x: 0, y: 1, z: 0 },
          exposure: { direct: 400, diffuse: 0, total: 400 },
        },
        {
          position: { x: 0, y: 1, z: 1 },
          normal: { x: 0, y: 1, z: 0 },
          exposure: { direct: 800, diffuse: 0, total: 800 },
        },
      ],
      triangles: [[0, 1, 2]],
      spacingMeters: 1,
      scaleMaximum: 800,
      displayChannel: 'direct',
      quantity: 'irradiance',
      unit: 'W/m²',
      directionCount: 1,
      temporalSampleCount: 1,
      evaluatedSampleCount: 3,
    }

    view.setExposureLayer(layer)
    const overlay = view.object.getObjectByName(
      `primitive-direct-exposure:${entity.id}`,
    )
    expect(overlay).toBeInstanceOf(THREE.Mesh)
    if (overlay instanceof THREE.Mesh) {
      expect(overlay.geometry.getAttribute('color').count).toBe(3)
      expect(overlay.userData.entityId).toBe(entity.id)
    }

    view.setExposureLayer(null)
    expect(view.object.getObjectByName(
      `primitive-direct-exposure:${entity.id}`,
    )).toBeUndefined()
    view.dispose()
  })
})
