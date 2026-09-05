import * as THREE from 'three/webgpu'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { getParcelBounds, type ParcelGeometry } from '../domain/parcel'

export interface YardScene {
  updateParcel(parcel: ParcelGeometry): void
  dispose(): void
}

const PARCEL_HEIGHT = 0.035

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

  const parcelGroup = new THREE.Group()
  parcelGroup.name = 'parcel-view'
  scene.add(parcelGroup)

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

  let parcelGeometries = new Set<THREE.BufferGeometry>()
  let parcelMaterials = new Set<THREE.Material>()

  const clearParcelView = () => {
    parcelGroup.clear()
    parcelGeometries.forEach((geometry) => geometry.dispose())
    parcelMaterials.forEach((material) => material.dispose())
    parcelGeometries = new Set()
    parcelMaterials = new Set()
  }

  const updateParcel = (parcel: ParcelGeometry) => {
    clearParcelView()

    if (parcel.vertices.length < 3) {
      return
    }

    const worldPoints = parcel.vertices.map(
      (vertex) =>
        new THREE.Vector3(
          vertex.eastMeters,
          PARCEL_HEIGHT,
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
      parcelMaterials.add(corridorMaterial)
      parcelGeometries.add(cornerGeometry)

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
            PARCEL_HEIGHT / 2,
            -(vertex.northMeters + next.northMeters) / 2,
          )
          edge.rotation.y = Math.atan2(deltaNorth, deltaEast)
          parcelGeometries.add(edgeGeometry)
          parcelGroup.add(edge)
        }

        const corner = new THREE.Mesh(cornerGeometry, corridorMaterial)
        corner.position.set(
          vertex.eastMeters,
          PARCEL_HEIGHT / 2,
          -vertex.northMeters,
        )
        corner.scale.set(uncertainty, 1, uncertainty)
        parcelGroup.add(corner)
      })
    }

    const boundaryGeometry = new THREE.BufferGeometry().setFromPoints(worldPoints)
    const boundaryMaterial = new THREE.LineBasicMaterial({ color: 0xf8f3dc })
    const boundary = new THREE.LineLoop(boundaryGeometry, boundaryMaterial)
    parcelGeometries.add(boundaryGeometry)
    parcelMaterials.add(boundaryMaterial)
    parcelGroup.add(boundary)

    const markerGeometry = new THREE.CylinderGeometry(0.18, 0.18, 0.05, 20)
    const markerMaterial = new THREE.MeshBasicMaterial({ color: 0x24362a })
    parcelGeometries.add(markerGeometry)
    parcelMaterials.add(markerMaterial)

    parcel.vertices.forEach((vertex) => {
      const marker = new THREE.Mesh(markerGeometry, markerMaterial)
      marker.position.set(
        vertex.eastMeters,
        PARCEL_HEIGHT,
        -vertex.northMeters,
      )
      parcelGroup.add(marker)
    })

    const bounds = getParcelBounds(parcel.vertices)
    northArrow.position.set(
      bounds.maxEastMeters + uncertainty + 2,
      PARCEL_HEIGHT + 0.04,
      -bounds.minNorthMeters,
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
    updateParcel,
    dispose: () => {
      resizeObserver.disconnect()
      renderer.setAnimationLoop(null)
      controls.dispose()
      clearParcelView()
      groundGeometry.dispose()
      groundMaterial.dispose()
      houseGeometry.dispose()
      houseMaterial.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}
