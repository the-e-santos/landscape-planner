import * as THREE from 'three/webgpu'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { getParcelBounds } from '../domain/parcel'
import type { LandscapeProject, ParcelEntity } from '../domain/project'
import {
  createParcelView,
  PARCEL_VIEW_HEIGHT,
  type ParcelView,
} from './createParcelView'

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

  const groundGeometry = new THREE.PlaneGeometry(100, 100)
  const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x7fa36b })
  const ground = new THREE.Mesh(groundGeometry, groundMaterial)
  ground.rotation.x = -Math.PI / 2
  scene.add(ground)

  const houseGeometry = new THREE.BoxGeometry(6, 3, 8)
  const houseMaterial = new THREE.MeshStandardMaterial({ color: 0xb8afa2 })
  const house = new THREE.Mesh(houseGeometry, houseMaterial)
  house.position.set(-4, 1.5, 0)
  scene.add(house)

  const grid = new THREE.GridHelper(100, 100, 0x59735d, 0x6f8b72)
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

  const parcelViews = new Map<string, ParcelView>()

  const updateProject = (project: LandscapeProject) => {
    const parcelEntities = project.entities.filter(
      (entity): entity is ParcelEntity => entity.kind === 'parcel',
    )
    const activeIds = new Set(parcelEntities.map(({ id }) => id))

    parcelViews.forEach((view, entityId) => {
      if (!activeIds.has(entityId)) {
        view.dispose()
        parcelViews.delete(entityId)
      }
    })

    parcelEntities.forEach((entity) => {
      const existingView = parcelViews.get(entity.id)

      if (existingView) {
        existingView.update(entity)
      } else {
        const view = createParcelView(entity)
        parcelViews.set(entity.id, view)
        scene.add(view.object)
      }
    })

    const parcel = parcelEntities[0]?.geometry
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
      parcelViews.forEach((view) => view.dispose())
      parcelViews.clear()
      groundGeometry.dispose()
      groundMaterial.dispose()
      houseGeometry.dispose()
      houseMaterial.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}
