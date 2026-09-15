import * as THREE from 'three/webgpu'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { getParcelBounds, type ParcelGeometry } from '../domain/parcel'
import type { LandscapeProject, ParcelEntity } from '../domain/project'
import type { TerrainEntity } from '../domain/terrain'
import {
  createParcelView,
  PARCEL_VIEW_HEIGHT,
  type ParcelView,
} from './createParcelView'
import { createTerrainView, type TerrainView } from './createTerrainView'

interface SceneEntity {
  readonly id: string
}

interface SceneEntityView<Entity> {
  readonly object: THREE.Object3D
  update(entity: Entity): void
  dispose(): void
}

interface SceneViewEntry<Entity, View> {
  entity: Entity
  readonly view: View
}

interface TerrainViewEntry {
  terrain: TerrainEntity
  parcel?: ParcelGeometry
  readonly view: TerrainView
}

function synchronizeEntityViews<
  Entity extends SceneEntity,
  View extends SceneEntityView<Entity>,
>(
  scene: THREE.Scene,
  entries: Map<string, SceneViewEntry<Entity, View>>,
  entities: readonly Entity[],
  createView: (entity: Entity) => View,
): void {
  const activeIds = new Set(entities.map(({ id }) => id))

  entries.forEach((entry, entityId) => {
    if (!activeIds.has(entityId)) {
      entry.view.dispose()
      entries.delete(entityId)
    }
  })

  entities.forEach((entity) => {
    const existing = entries.get(entity.id)

    if (existing) {
      if (existing.entity !== entity) {
        existing.view.update(entity)
        existing.entity = entity
      }
      return
    }

    const view = createView(entity)
    entries.set(entity.id, { entity, view })
    scene.add(view.object)
  })
}

export interface YardScene {
  updateProject(project: LandscapeProject): void
  dispose(): void
}

export function createYardScene(viewport: HTMLDivElement): YardScene {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0xdde8f0)

  const camera = new THREE.PerspectiveCamera(
    50,
    viewport.clientWidth / Math.max(viewport.clientHeight, 1),
    0.1,
    1000,
  )
  camera.position.set(38, 32, 38)

  const renderer = new THREE.WebGPURenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(viewport.clientWidth, viewport.clientHeight)
  viewport.appendChild(renderer.domElement)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.set(0, 0, 0)
  controls.enableDamping = true

  const houseGeometry = new THREE.BoxGeometry(6, 3, 8)
  const houseMaterial = new THREE.MeshStandardMaterial({ color: 0xb8afa2 })
  const house = new THREE.Mesh(houseGeometry, houseMaterial)
  house.position.set(-4, 2.2, 0)
  scene.add(house)

  const grid = new THREE.GridHelper(100, 100, 0x59735d, 0x6f8b72)
  grid.position.y = 0.015
  scene.add(grid)

  const skyLight = new THREE.HemisphereLight(0xffffff, 0x444444, 2)
  scene.add(skyLight)

  const sunLight = new THREE.DirectionalLight(0xffffff, 3)
  sunLight.position.set(10, 15, 5)
  scene.add(sunLight)

  const northArrow = new THREE.ArrowHelper(
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(),
    4,
    0xc83232,
    0.8,
    0.45,
  )
  northArrow.name = 'true-north'
  scene.add(northArrow)

  const parcelViews = new Map<
    string,
    SceneViewEntry<ParcelEntity, ParcelView>
  >()
  const terrainViews = new Map<
    string,
    TerrainViewEntry
  >()

  const updateProject = (project: LandscapeProject) => {
    const parcelEntities = project.entities.filter(
      (entity): entity is ParcelEntity => entity.kind === 'parcel',
    )
    const terrainEntities = project.entities.filter(
      (entity): entity is TerrainEntity => entity.kind === 'terrain',
    )
    const parcel = parcelEntities[0]?.geometry
    synchronizeEntityViews(scene, parcelViews, parcelEntities, createParcelView)
    const activeTerrainIds = new Set(terrainEntities.map(({ id }) => id))
    terrainViews.forEach((entry, entityId) => {
      if (!activeTerrainIds.has(entityId)) {
        entry.view.dispose()
        terrainViews.delete(entityId)
      }
    })
    terrainEntities.forEach((terrain) => {
      const existing = terrainViews.get(terrain.id)
      if (existing) {
        if (existing.terrain !== terrain || existing.parcel !== parcel) {
          existing.view.update(terrain, parcel)
          existing.terrain = terrain
          existing.parcel = parcel
        }
      } else {
        const view = createTerrainView(terrain, parcel)
        terrainViews.set(terrain.id, { terrain, parcel, view })
        scene.add(view.object)
      }
    })

    if (parcel) {
      const bounds = getParcelBounds(parcel.vertices)
      const uncertainty = Math.max(parcel.uncertaintyMeters, 0)
      northArrow.position.set(
        bounds.maxEastMeters + uncertainty + 2,
        PARCEL_VIEW_HEIGHT + 0.04,
        -bounds.minNorthMeters,
      )
    }

    northArrow.setDirection(
      new THREE.Vector3(0, 0, -1).applyAxisAngle(
        new THREE.Vector3(0, 1, 0),
        project.coordinates.northRotationRadians,
      ),
    )
  }

  const handleResize = () => {
    const width = Math.max(viewport.clientWidth, 1)
    const height = Math.max(viewport.clientHeight, 1)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height)
  }
  const resizeObserver = new ResizeObserver(handleResize)
  resizeObserver.observe(viewport)

  renderer.setAnimationLoop(() => {
    controls.update()
    renderer.render(scene, camera)
  })

  return {
    updateProject,
    dispose: () => {
      resizeObserver.disconnect()
      renderer.setAnimationLoop(null)
      controls.dispose()
      parcelViews.forEach(({ view }) => view.dispose())
      parcelViews.clear()
      terrainViews.forEach(({ view }) => view.dispose())
      terrainViews.clear()
      houseGeometry.dispose()
      houseMaterial.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}
