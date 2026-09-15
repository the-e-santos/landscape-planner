import * as THREE from 'three/webgpu'
import type { ParcelEntity } from '../domain/project'

export const PARCEL_VIEW_HEIGHT = 0.035

export interface ParcelView {
  readonly object: THREE.Group
  update(entity: ParcelEntity): void
  dispose(): void
}

export function createParcelView(entity: ParcelEntity): ParcelView {
  const object = new THREE.Group()
  let geometries = new Set<THREE.BufferGeometry>()
  let materials = new Set<THREE.Material>()

  const clear = () => {
    object.clear()
    geometries.forEach((geometry) => geometry.dispose())
    materials.forEach((material) => material.dispose())
    geometries = new Set()
    materials = new Set()
  }

  const update = (nextEntity: ParcelEntity) => {
    clear()
    object.name = `parcel:${nextEntity.id}`
    object.userData.entityId = nextEntity.id

    const parcel = nextEntity.geometry

    if (parcel.vertices.length < 3) {
      return
    }

    const worldPoints = parcel.vertices.map(
      (vertex) =>
        new THREE.Vector3(
          vertex.eastMeters,
          PARCEL_VIEW_HEIGHT,
          -vertex.northMeters,
        ),
    )
    const uncertainty = Math.max(parcel.uncertaintyMeters, 0)

    if (uncertainty > 0) {
      const corridorMaterial = new THREE.MeshBasicMaterial({
        color: 0xf1c75b,
        opacity: 0.28,
        transparent: true,
        depthWrite: false,
      })
      const cornerGeometry = new THREE.CylinderGeometry(1, 1, 0.012, 32)
      materials.add(corridorMaterial)
      geometries.add(cornerGeometry)

      parcel.vertices.forEach((vertex, index) => {
        const next = parcel.vertices[(index + 1) % parcel.vertices.length]
        const deltaEast = next.eastMeters - vertex.eastMeters
        const deltaNorth = next.northMeters - vertex.northMeters
        const edgeLength = Math.hypot(deltaEast, deltaNorth)

        if (edgeLength > 0) {
          const edgeGeometry = new THREE.BoxGeometry(
            edgeLength + uncertainty * 2,
            0.012,
            uncertainty * 2,
          )
          const edge = new THREE.Mesh(edgeGeometry, corridorMaterial)
          edge.position.set(
            (vertex.eastMeters + next.eastMeters) / 2,
            PARCEL_VIEW_HEIGHT / 2,
            -(vertex.northMeters + next.northMeters) / 2,
          )
          edge.rotation.y = Math.atan2(deltaNorth, deltaEast)
          geometries.add(edgeGeometry)
          object.add(edge)
        }

        const corner = new THREE.Mesh(cornerGeometry, corridorMaterial)
        corner.position.set(
          vertex.eastMeters,
          PARCEL_VIEW_HEIGHT / 2,
          -vertex.northMeters,
        )
        corner.scale.set(uncertainty, 1, uncertainty)
        object.add(corner)
      })
    }

    const closedBoundaryPoints = [...worldPoints, worldPoints[0]]
    const boundaryGeometry = new THREE.BufferGeometry().setFromPoints(
      closedBoundaryPoints,
    )
    const boundaryMaterial = new THREE.LineBasicMaterial({ color: 0xf8f3dc })
    const boundary = new THREE.Line(boundaryGeometry, boundaryMaterial)
    geometries.add(boundaryGeometry)
    materials.add(boundaryMaterial)
    object.add(boundary)

    const markerGeometry = new THREE.CylinderGeometry(0.18, 0.18, 0.05, 20)
    const markerMaterial = new THREE.MeshBasicMaterial({ color: 0x24362a })
    geometries.add(markerGeometry)
    materials.add(markerMaterial)

    parcel.vertices.forEach((vertex) => {
      const marker = new THREE.Mesh(markerGeometry, markerMaterial)
      marker.position.set(
        vertex.eastMeters,
        PARCEL_VIEW_HEIGHT,
        -vertex.northMeters,
      )
      object.add(marker)
    })
  }

  update(entity)

  return {
    object,
    update,
    dispose: () => {
      clear()
      object.removeFromParent()
    },
  }
}
