import * as THREE from 'three/webgpu'
import type { PrimitiveEntity } from '../domain/primitive'

export interface PrimitiveView {
  readonly object: THREE.Group
  update(entity: PrimitiveEntity): void
  setSelected(selected: boolean): void
  dispose(): void
}

function createGeometry(entity: PrimitiveEntity): THREE.BufferGeometry {
  switch (entity.geometry.kind) {
    case 'box':
      return new THREE.BoxGeometry(
        entity.geometry.widthMeters,
        entity.geometry.heightMeters,
        entity.geometry.depthMeters,
      )

    case 'cylinder':
      return new THREE.CylinderGeometry(
        entity.geometry.radiusMeters,
        entity.geometry.radiusMeters,
        entity.geometry.heightMeters,
        32,
      )

    case 'wall':
      return new THREE.BoxGeometry(
        entity.geometry.lengthMeters,
        entity.geometry.heightMeters,
        entity.geometry.thicknessMeters,
      )

    case 'polygonExtrusion': {
      const shape = new THREE.Shape(
        entity.geometry.footprint.map(
          (point) => new THREE.Vector2(point.eastMeters, point.northMeters),
        ),
      )
      const extrusion = new THREE.ExtrudeGeometry(shape, {
        depth: entity.geometry.heightMeters,
        bevelEnabled: false,
      })
      extrusion.rotateX(-Math.PI / 2)
      extrusion.translate(0, -entity.geometry.heightMeters / 2, 0)
      return extrusion
    }

    case 'canopy': {
      const canopy = new THREE.SphereGeometry(1, 32, 16)
      canopy.scale(
        entity.geometry.eastRadiusMeters,
        entity.geometry.verticalRadiusMeters,
        entity.geometry.northRadiusMeters,
      )
      return canopy
    }
  }
}

function updateMaterial(
  material: THREE.MeshStandardMaterial,
  entity: PrimitiveEntity,
): void {
  if (entity.geometry.kind === 'canopy') {
    material.color.setHex(0x588b57)
    material.opacity = 0.72
    material.transparent = true
  } else if (
    entity.geometry.kind === 'wall' &&
    entity.geometry.structure === 'fence'
  ) {
    material.color.setHex(0x9a7958)
    material.opacity = 1
    material.transparent = false
  } else {
    material.color.setHex(0xb8afa2)
    material.opacity = 1
    material.transparent = false
  }
  material.needsUpdate = true
}

export function createPrimitiveView(entity: PrimitiveEntity): PrimitiveView {
  const object = new THREE.Group()
  let geometry: THREE.BufferGeometry | undefined
  let selected = false
  const material = new THREE.MeshStandardMaterial({ color: 0xb8afa2 })

  const updateSelection = () => {
    material.emissive.setHex(selected ? 0x3d6f48 : 0x000000)
    material.emissiveIntensity = selected ? 0.7 : 0
  }

  const update = (nextEntity: PrimitiveEntity) => {
    object.clear()
    geometry?.dispose()

    geometry = createGeometry(nextEntity)
    updateMaterial(material, nextEntity)
    updateSelection()
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
    setSelected: (nextSelected) => {
      selected = nextSelected
      updateSelection()
    },
    dispose: () => {
      geometry?.dispose()
      material.dispose()
      object.removeFromParent()
    },
  }
}
