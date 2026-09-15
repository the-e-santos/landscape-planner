import * as THREE from 'three/webgpu'
import type { PrimitiveEntity } from '../domain/primitive'

export interface PrimitiveView {
  readonly object: THREE.Group
  update(entity: PrimitiveEntity): void
  dispose(): void
}

export function createPrimitiveView(entity: PrimitiveEntity): PrimitiveView {
  const object = new THREE.Group()
  let geometry: THREE.BufferGeometry | undefined
  const material = new THREE.MeshStandardMaterial({ color: 0xb8afa2 })

  const update = (nextEntity: PrimitiveEntity) => {
    object.clear()
    geometry?.dispose()

    geometry = new THREE.BoxGeometry(
      nextEntity.geometry.widthMeters,
      nextEntity.geometry.heightMeters,
      nextEntity.geometry.depthMeters,
    )
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = `primitive-mesh:${nextEntity.id}`
    mesh.userData.entityId = nextEntity.id
    object.add(mesh)

    object.name = `primitive:${nextEntity.id}`
    object.userData.entityId = nextEntity.id
    object.position.set(
      nextEntity.transform.position.eastMeters,
      nextEntity.transform.position.elevationMeters,
      -nextEntity.transform.position.northMeters,
    )
    object.rotation.set(
      nextEntity.transform.rotation.xRadians,
      nextEntity.transform.rotation.yRadians,
      nextEntity.transform.rotation.zRadians,
      'XYZ',
    )
  }

  update(entity)

  return {
    object,
    update,
    dispose: () => {
      geometry?.dispose()
      material.dispose()
      object.removeFromParent()
    },
  }
}
