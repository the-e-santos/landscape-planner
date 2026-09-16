import * as THREE from 'three/webgpu'
import type { PrimitiveEntity } from '../domain/primitive'
import type { PrimitiveExposureLayer } from '../solar/primitiveExposure'

export interface PrimitiveView {
  readonly object: THREE.Group
  update(entity: PrimitiveEntity): void
  setSelected(selected: boolean): void
  setExposureLayer(layer: PrimitiveExposureLayer | null): void
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
  let exposureGeometry: THREE.BufferGeometry | undefined
  let exposureMaterial: THREE.MeshBasicMaterial | undefined
  let exposureMesh: THREE.Mesh | undefined
  let selected = false
  const material = new THREE.MeshStandardMaterial({ color: 0xb8afa2 })

  const updateSelection = () => {
    material.emissive.setHex(selected ? 0x3d6f48 : 0x000000)
    material.emissiveIntensity = selected ? 0.7 : 0
  }

  const removeExposureLayer = () => {
    exposureMesh?.removeFromParent()
    exposureGeometry?.dispose()
    exposureMaterial?.dispose()
    exposureMesh = undefined
    exposureGeometry = undefined
    exposureMaterial = undefined
  }

  const setExposureLayer = (layer: PrimitiveExposureLayer | null) => {
    removeExposureLayer()
    object.userData.exposureLayer = layer
    if (!layer) return
    const low = new THREE.Color(0x28334f)
    const middle = new THREE.Color(0x2f8b83)
    const high = new THREE.Color(0xf1c75b)
    const scaleMaximum = Math.max(
      layer.scaleMaximum,
      1,
    )
    const colors = layer.vertices.flatMap((vertex) => {
      const irradiance = vertex.exposure[layer.displayChannel]
      const ratio = Math.max(0, Math.min(1, irradiance / scaleMaximum))
      const color = ratio < 0.5
        ? low.clone().lerp(middle, ratio * 2)
        : middle.clone().lerp(high, (ratio - 0.5) * 2)
      return [color.r, color.g, color.b]
    })
    exposureGeometry = new THREE.BufferGeometry()
    exposureGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        layer.vertices.flatMap(({ position, normal }) => [
          position.x + normal.x * 0.01,
          position.y + normal.y * 0.01,
          position.z + normal.z * 0.01,
        ]),
        3,
      ),
    )
    exposureGeometry.setAttribute(
      'color',
      new THREE.Float32BufferAttribute(colors, 3),
    )
    exposureGeometry.setIndex(layer.triangles.flatMap((triangle) => [...triangle]))
    exposureMaterial = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    })
    exposureMesh = new THREE.Mesh(exposureGeometry, exposureMaterial)
    exposureMesh.name = `primitive-direct-exposure:${layer.entityId}`
    exposureMesh.userData.entityId = layer.entityId
    exposureMesh.renderOrder = 2
    object.add(exposureMesh)
  }

  const update = (nextEntity: PrimitiveEntity) => {
    removeExposureLayer()
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
    setExposureLayer,
    dispose: () => {
      removeExposureLayer()
      geometry?.dispose()
      material.dispose()
      object.removeFromParent()
    },
  }
}
