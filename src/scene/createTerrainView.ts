import * as THREE from 'three/webgpu'
import type { ParcelGeometry } from '../domain/parcel'
import {
  getTerrainLinearConstraints,
  type TerrainEntity,
  type TerrainLinearConstraintRole,
} from '../domain/terrain'
import { clipTerrainMeshToParcel } from '../domain/terrainClipping'
import { deriveTerrainMesh } from '../domain/terrainMesh'

export interface TerrainView {
  readonly object: THREE.Group
  update(entity: TerrainEntity, parcel?: ParcelGeometry): void
  dispose(): void
}

const CONSTRAINT_COLORS: Record<TerrainLinearConstraintRole, number> = {
  gradeBreak: 0xd3832b,
  ridge: 0xb34d6b,
  swale: 0x327aa8,
}

export function createTerrainView(
  entity: TerrainEntity,
  parcel?: ParcelGeometry,
): TerrainView {
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

  const update = (
    nextEntity: TerrainEntity,
    nextParcel?: ParcelGeometry,
  ) => {
    clear()
    object.name = `terrain:${nextEntity.id}`
    object.userData.entityId = nextEntity.id

    const result = deriveTerrainMesh(nextEntity)
    object.userData.validationIssues = result.ok ? [] : result.issues

    if (!result.ok) {
      return
    }

    const clippedResult = nextParcel
      ? clipTerrainMeshToParcel(result.mesh, nextParcel.vertices)
      : result
    object.userData.clippingIssue = clippedResult.ok
      ? undefined
      : clippedResult.issue

    if (!clippedResult.ok) {
      return
    }

    const { mesh } = clippedResult
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

    const spotsById = new Map(
      nextEntity.spotElevations.map((spot) => [spot.id, spot]),
    )
    getTerrainLinearConstraints(nextEntity).forEach((constraint) => {
      const linePoints = constraint.spotElevationIds.flatMap((spotId) => {
        const spot = spotsById.get(spotId)
        return spot
          ? [spot.eastMeters, spot.elevationMeters + 0.04, -spot.northMeters]
          : []
      })
      if (linePoints.length < 6) {
        return
      }

      const constraintGeometry = new THREE.BufferGeometry()
      constraintGeometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(linePoints, 3),
      )
      const constraintMaterial = new THREE.LineBasicMaterial({
        color: CONSTRAINT_COLORS[constraint.role],
        depthWrite: false,
      })
      const constraintLine = new THREE.Line(
        constraintGeometry,
        constraintMaterial,
      )
      constraintLine.name = `terrain-constraint:${constraint.id}`
      constraintLine.userData.constraintId = constraint.id
      constraintLine.userData.role = constraint.role
      constraintLine.renderOrder = 3
      geometries.add(constraintGeometry)
      materials.add(constraintMaterial)
      object.add(constraintLine)
    })

    const markerGeometry = new THREE.SphereGeometry(0.22, 16, 10)
    const markerMaterial = new THREE.MeshBasicMaterial({ color: 0x274234 })
    geometries.add(markerGeometry)
    materials.add(markerMaterial)

    nextEntity.spotElevations.forEach((vertex) => {
      const marker = new THREE.Mesh(markerGeometry, markerMaterial)
      marker.name = `terrain-spot:${vertex.id}`
      marker.userData.spotElevationId = vertex.id
      marker.position.set(
        vertex.eastMeters,
        vertex.elevationMeters,
        -vertex.northMeters,
      )
      marker.renderOrder = 4
      object.add(marker)
    })
  }

  update(entity, parcel)

  return {
    object,
    update,
    dispose: () => {
      clear()
      object.removeFromParent()
    },
  }
}
