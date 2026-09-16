import * as THREE from 'three/webgpu'
import type { ParcelGeometry } from '../domain/parcel'
import {
  getTerrainLinearConstraints,
  type TerrainEntity,
  type TerrainLinearConstraintRole,
} from '../domain/terrain'
import { clipTerrainMeshToParcel } from '../domain/terrainClipping'
import { deriveRetainingWallFaces } from '../domain/retainingWallMesh'
import { deriveTerrainMesh } from '../domain/terrainMesh'
import type { TerrainExposureLayer } from '../solar/terrainExposure'

export interface TerrainView {
  readonly object: THREE.Group
  update(entity: TerrainEntity, parcel?: ParcelGeometry): void
  setExposureLayer(layer: TerrainExposureLayer | null): void
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
  let exposureMesh: THREE.Mesh | undefined
  let exposureGeometry: THREE.BufferGeometry | undefined
  let exposureMaterial: THREE.MeshBasicMaterial | undefined

  const removeExposureLayer = () => {
    exposureMesh?.removeFromParent()
    if (exposureGeometry) {
      geometries.delete(exposureGeometry)
      exposureGeometry.dispose()
    }
    if (exposureMaterial) {
      materials.delete(exposureMaterial)
      exposureMaterial.dispose()
    }
    exposureMesh = undefined
    exposureGeometry = undefined
    exposureMaterial = undefined
  }

  const clear = () => {
    object.clear()
    geometries.forEach((geometry) => geometry.dispose())
    materials.forEach((material) => material.dispose())
    geometries = new Set()
    materials = new Set()
    exposureMesh = undefined
    exposureGeometry = undefined
    exposureMaterial = undefined
  }

  const setExposureLayer = (layer: TerrainExposureLayer | null) => {
    removeExposureLayer()
    object.userData.exposureLayer = layer
    if (!layer) return

    const low = new THREE.Color(0x28334f)
    const middle = new THREE.Color(0x2f8b83)
    const high = new THREE.Color(0xf1c75b)
    const scaleMaximum = Math.max(
      layer.scaleMaximumIrradianceWattsPerSquareMeter,
      1,
    )
    const colors = layer.vertices.flatMap((vertex) => {
      const irradiance = layer.displayChannel === 'direct'
        ? vertex.directIrradianceWattsPerSquareMeter
        : layer.displayChannel === 'diffuse'
          ? vertex.diffuseIrradianceWattsPerSquareMeter
          : vertex.totalIrradianceWattsPerSquareMeter
      const ratio = Math.max(
        0,
        Math.min(1, irradiance / scaleMaximum),
      )
      const color = ratio < 0.5
        ? low.clone().lerp(middle, ratio * 2)
        : middle.clone().lerp(high, (ratio - 0.5) * 2)
      return [color.r, color.g, color.b]
    })
    exposureGeometry = new THREE.BufferGeometry()
    exposureGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        layer.vertices.flatMap(
          ({ eastMeters, elevationMeters, northMeters }) => [
            eastMeters,
            elevationMeters + 0.025,
            -northMeters,
          ],
        ),
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
    exposureMesh.name = 'terrain-direct-exposure'
    exposureMesh.renderOrder = 1
    geometries.add(exposureGeometry)
    materials.add(exposureMaterial)
    object.add(exposureMesh)
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
      // Very steep valid grades should not look like missing geometry when
      // viewed from their back side. This does not change domain geometry.
      side: THREE.DoubleSide,
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

    const retainingWallResult = deriveRetainingWallFaces(nextEntity)
    if (retainingWallResult.ok) {
      retainingWallResult.faces.forEach((face) => {
        const wallGeometry = new THREE.BufferGeometry()
        wallGeometry.setAttribute(
          'position',
          new THREE.Float32BufferAttribute(
            face.vertices.flatMap(
              ({ eastMeters, elevationMeters, northMeters }) => [
                eastMeters,
                elevationMeters,
                -northMeters,
              ],
            ),
            3,
          ),
        )
        wallGeometry.setIndex(face.triangles.flatMap((triangle) => [...triangle]))
        wallGeometry.computeVertexNormals()
        const wallMaterial = new THREE.MeshStandardMaterial({
          color: 0x8d8174,
          roughness: 0.95,
          side: THREE.DoubleSide,
        })
        const wallMesh = new THREE.Mesh(wallGeometry, wallMaterial)
        wallMesh.name = `terrain-retaining-wall:${face.retainingWallId}`
        wallMesh.userData.retainingWallId = face.retainingWallId
        wallMesh.renderOrder = 2
        geometries.add(wallGeometry)
        materials.add(wallMaterial)
        object.add(wallMesh)

        const wallEdgeGeometry = new THREE.WireframeGeometry(wallGeometry)
        const wallEdgeMaterial = new THREE.LineBasicMaterial({
          color: 0x463f38,
          depthWrite: false,
        })
        const wallEdges = new THREE.LineSegments(
          wallEdgeGeometry,
          wallEdgeMaterial,
        )
        wallEdges.name = `terrain-retaining-wall-edges:${face.retainingWallId}`
        wallEdges.userData.retainingWallId = face.retainingWallId
        wallEdges.renderOrder = 3
        geometries.add(wallEdgeGeometry)
        materials.add(wallEdgeMaterial)
        object.add(wallEdges)
      })
    }

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
    setExposureLayer,
    dispose: () => {
      clear()
      object.removeFromParent()
    },
  }
}
