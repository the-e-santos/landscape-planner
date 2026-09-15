import * as THREE from 'three/webgpu'
import type { TerrainEntity } from '../domain/terrain'
import { deriveTerrainMesh } from '../domain/terrainMesh'

export interface TerrainView {
  readonly object: THREE.Group
  update(entity: TerrainEntity): void
  dispose(): void
}

export function createTerrainView(entity: TerrainEntity): TerrainView {
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

  const update = (nextEntity: TerrainEntity) => {
    clear()
    object.name = `terrain:${nextEntity.id}`
    object.userData.entityId = nextEntity.id

    const result = deriveTerrainMesh(nextEntity)
    object.userData.validationIssues = result.ok ? [] : result.issues

    if (!result.ok) {
      return
    }

    const { mesh } = result
    const positions = mesh.vertices.flatMap(
      ({ eastMeters, elevationMeters, northMeters }) => [
        eastMeters,
        elevationMeters,
        -northMeters,
      ],
    )
    const indices = mesh.triangles.flatMap((triangle) => [...triangle])
    const surfaceGeometry = new THREE.BufferGeometry()
    surfaceGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    )
    surfaceGeometry.setIndex(indices)
    surfaceGeometry.computeVertexNormals()

    const surfaceMaterial = new THREE.MeshStandardMaterial({
      color: 0x91b978,
      roughness: 0.9,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    })
    const surface = new THREE.Mesh(surfaceGeometry, surfaceMaterial)
    surface.name = 'terrain-surface'
    geometries.add(surfaceGeometry)
    materials.add(surfaceMaterial)
    object.add(surface)

    const wireframeGeometry = new THREE.WireframeGeometry(surfaceGeometry)
    const wireframeMaterial = new THREE.LineBasicMaterial({
      color: 0x496b4d,
      depthWrite: false,
      transparent: true,
      opacity: 0.65,
    })
    const wireframe = new THREE.LineSegments(
      wireframeGeometry,
      wireframeMaterial,
    )
    wireframe.name = 'terrain-wireframe'
    wireframe.renderOrder = 2
    geometries.add(wireframeGeometry)
    materials.add(wireframeMaterial)
    object.add(wireframe)

    const markerGeometry = new THREE.SphereGeometry(0.22, 16, 10)
    const markerMaterial = new THREE.MeshBasicMaterial({ color: 0x274234 })
    geometries.add(markerGeometry)
    materials.add(markerMaterial)

    mesh.vertices.forEach((vertex) => {
      const marker = new THREE.Mesh(markerGeometry, markerMaterial)
      marker.name = `terrain-spot:${vertex.spotElevationId}`
      marker.userData.spotElevationId = vertex.spotElevationId
      marker.position.set(
        vertex.eastMeters,
        vertex.elevationMeters,
        -vertex.northMeters,
      )
      marker.renderOrder = 3
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
