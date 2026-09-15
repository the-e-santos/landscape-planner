import * as THREE from 'three/webgpu'
import { describe, expect, it } from 'vitest'
import { createDefaultHouseEntity } from '../domain/primitive'
import { createPrimitiveView } from './createPrimitiveView'

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
})
