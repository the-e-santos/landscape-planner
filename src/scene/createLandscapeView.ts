import * as THREE from 'three/webgpu'
import type {
  IrrigationZoneEntity,
  PlantEntity,
  PlantingBedEntity,
  SurfaceCover,
} from '../domain/landscape'
import type { ParcelPoint } from '../domain/parcel'

export type TerrainElevationSampler = (
  eastMeters: number,
  northMeters: number,
) => number | undefined

export interface LandscapeEntityView<Entity> {
  readonly object: THREE.Group
  update(entity: Entity): void
  dispose(): void
}

const SURFACE_COVER_COLORS: Readonly<Record<SurfaceCover, number>> = {
  bareSoil: 0x8a6648,
  mulch: 0x563a2a,
  turf: 0x6f9d5d,
  groundcover: 0x4f7f50,
  gravel: 0x99938a,
  concrete: 0xaeb3b6,
  pavers: 0xad8065,
  other: 0x81786b,
}

export function getSurfaceCoverColor(surfaceCover: SurfaceCover): number {
  return SURFACE_COVER_COLORS[surfaceCover]
}

function createDrapedShapeGeometry(
  footprint: readonly ParcelPoint[],
  elevationAt: TerrainElevationSampler,
  verticalOffset: number,
): THREE.ShapeGeometry {
  const shape = new THREE.Shape(
    footprint.map(
      ({ eastMeters, northMeters }) =>
        new THREE.Vector2(eastMeters, northMeters),
    ),
  )
  const geometry = new THREE.ShapeGeometry(shape)
  const positions = geometry.getAttribute('position')
  for (let index = 0; index < positions.count; index += 1) {
    const eastMeters = positions.getX(index)
    const northMeters = positions.getY(index)
    positions.setXYZ(
      index,
      eastMeters,
      (elevationAt(eastMeters, northMeters) ?? 0) + verticalOffset,
      -northMeters,
    )
  }
  positions.needsUpdate = true
  geometry.computeVertexNormals()
  return geometry
}

function createDrapedLoopGeometry(
  footprint: readonly ParcelPoint[],
  elevationAt: TerrainElevationSampler,
  verticalOffset: number,
): THREE.BufferGeometry {
  return new THREE.BufferGeometry().setFromPoints(
    footprint.map(
      ({ eastMeters, northMeters }) => new THREE.Vector3(
        eastMeters,
        (elevationAt(eastMeters, northMeters) ?? 0) + verticalOffset,
        -northMeters,
      ),
    ),
  )
}

export function createPlantingBedView(
  entity: PlantingBedEntity,
  elevationAt: TerrainElevationSampler = () => 0,
): LandscapeEntityView<PlantingBedEntity> {
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
  const update = (nextEntity: PlantingBedEntity) => {
    clear()
    object.name = `planting-bed:${nextEntity.id}`
    object.userData.entityId = nextEntity.id
    object.userData.surfaceCover = nextEntity.soil.surfaceCover

    const surfaceGeometry = createDrapedShapeGeometry(
      nextEntity.footprint,
      elevationAt,
      0.035,
    )
    const surfaceMaterial = new THREE.MeshStandardMaterial({
      color: getSurfaceCoverColor(nextEntity.soil.surfaceCover),
      roughness: 0.92,
      side: THREE.DoubleSide,
    })
    const surface = new THREE.Mesh(surfaceGeometry, surfaceMaterial)
    surface.name = `planting-bed-surface:${nextEntity.id}`
    surface.userData.entityId = nextEntity.id
    surface.renderOrder = 2
    geometries.add(surfaceGeometry)
    materials.add(surfaceMaterial)
    object.add(surface)

    const outlineGeometry = createDrapedLoopGeometry(
      nextEntity.footprint,
      elevationAt,
      0.05,
    )
    const outlineMaterial = new THREE.LineBasicMaterial({ color: 0x342820 })
    const outline = new THREE.LineLoop(outlineGeometry, outlineMaterial)
    outline.name = `planting-bed-outline:${nextEntity.id}`
    outline.renderOrder = 3
    geometries.add(outlineGeometry)
    materials.add(outlineMaterial)
    object.add(outline)
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

export function createIrrigationZoneView(
  entity: IrrigationZoneEntity,
  elevationAt: TerrainElevationSampler = () => 0,
): LandscapeEntityView<IrrigationZoneEntity> {
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
  const update = (nextEntity: IrrigationZoneEntity) => {
    clear()
    object.name = `irrigation-zone:${nextEntity.id}`
    object.userData.entityId = nextEntity.id
    if (!nextEntity.footprint) return

    const fillGeometry = createDrapedShapeGeometry(
      nextEntity.footprint,
      elevationAt,
      0.065,
    )
    const fillMaterial = new THREE.MeshBasicMaterial({
      color: 0x3d88b8,
      opacity: 0.16,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const fill = new THREE.Mesh(fillGeometry, fillMaterial)
    fill.name = `irrigation-zone-fill:${nextEntity.id}`
    fill.renderOrder = 4
    geometries.add(fillGeometry)
    materials.add(fillMaterial)
    object.add(fill)

    const outlineGeometry = createDrapedLoopGeometry(
      nextEntity.footprint,
      elevationAt,
      0.075,
    )
    const outlineMaterial = new THREE.LineBasicMaterial({ color: 0x236b9a })
    const outline = new THREE.LineLoop(outlineGeometry, outlineMaterial)
    outline.name = `irrigation-zone-outline:${nextEntity.id}`
    outline.renderOrder = 5
    geometries.add(outlineGeometry)
    materials.add(outlineMaterial)
    object.add(outline)
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

export function createPlantView(
  entity: PlantEntity,
): LandscapeEntityView<PlantEntity> {
  const object = new THREE.Group()
  let geometry: THREE.SphereGeometry | undefined
  const material = new THREE.MeshStandardMaterial({
    color: 0x3f7748,
    opacity: 0.72,
    transparent: true,
    roughness: 0.86,
  })
  const update = (nextEntity: PlantEntity) => {
    object.clear()
    geometry?.dispose()
    geometry = new THREE.SphereGeometry(
      nextEntity.canopyRadiusMeters,
      24,
      14,
    )
    const canopy = new THREE.Mesh(geometry, material)
    canopy.name = `plant-canopy:${nextEntity.id}`
    canopy.userData.entityId = nextEntity.id
    object.add(canopy)
    object.name = `plant:${nextEntity.id}`
    object.userData.entityId = nextEntity.id
    object.position.set(
      nextEntity.position.eastMeters,
      nextEntity.position.elevationMeters,
      -nextEntity.position.northMeters,
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
