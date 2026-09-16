import * as THREE from 'three/webgpu'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { getParcelBounds, type ParcelGeometry } from '../domain/parcel'
import type { LandscapeProject, ParcelEntity } from '../domain/project'
import {
  resizePrimitiveGeometry,
  snapPrimitiveGeometryDimensions,
  type PrimitiveEntity,
} from '../domain/primitive'
import type { TerrainEntity } from '../domain/terrain'
import {
  createParcelView,
  PARCEL_VIEW_HEIGHT,
  type ParcelView,
} from './createParcelView'
import { createTerrainView, type TerrainView } from './createTerrainView'
import {
  createPrimitiveView,
  type PrimitiveView,
} from './createPrimitiveView'
import {
  generateTerrainExposureLayer,
  type InstantSolarHeatmapSettings,
} from '../solar/terrainExposure'
import { generatePrimitiveExposureLayer } from '../solar/primitiveExposure'
import type { SurfacePoint } from '../solar/pointSolar'

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
  setSelectedEntityId(entityId: string | null): void
  setManipulationMode(mode: PrimitiveManipulationMode): void
  setSnapSettings(settings: PrimitiveSnapSettings): void
  setResizeProportionsLocked(locked: boolean): void
  setSolarHeatmap(settings: InstantSolarHeatmapSettings): void
  setSolarProbeEnabled(enabled: boolean): void
  dispose(): void
}

export type PrimitiveManipulationMode = 'translate' | 'rotate' | 'resize'

export interface PrimitiveSnapSettings {
  readonly enabled: boolean
  readonly translationMeters: number
  readonly rotationRadians: number
  readonly resizeMeters: number
}

export interface YardSceneOptions {
  readonly onSelectionChange?: (entityId: string | null) => void
  readonly onManipulationStart?: () => void
  readonly onPrimitiveChange?: (primitive: PrimitiveEntity) => void
  readonly onManipulationEnd?: () => void
  readonly onManipulationCancel?: () => void
  readonly onSolarProbe?: (surface: SurfacePoint) => void
}

export function getPrimitiveEntityIdFromObject(
  object: THREE.Object3D,
): string | null {
  let candidate: THREE.Object3D | null = object
  while (candidate) {
    if (typeof candidate.userData.entityId === 'string') {
      return candidate.userData.entityId
    }
    candidate = candidate.parent
  }
  return null
}

export function createYardScene(
  viewport: HTMLDivElement,
  options: YardSceneOptions = {},
): YardScene {
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

  const transformControls = new TransformControls(camera, renderer.domElement)
  const transformHelper = transformControls.getHelper()
  const transformProxy = new THREE.Object3D()
  transformProxy.name = 'primitive-transform-proxy'
  scene.add(transformHelper, transformProxy)

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

  const probeMarkerMaterial = new THREE.MeshBasicMaterial({ color: 0xfff4a8 })
  const probeMarkerGeometry = new THREE.SphereGeometry(0.14, 16, 10)
  const probeMarker = new THREE.Group()
  const probePoint = new THREE.Mesh(probeMarkerGeometry, probeMarkerMaterial)
  const probeNormal = new THREE.ArrowHelper(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(),
    0.8,
    0xfff4a8,
    0.22,
    0.12,
  )
  probeMarker.name = 'solar-probe-marker'
  probeMarker.visible = false
  probeMarker.add(probePoint, probeNormal)
  scene.add(probeMarker)

  const parcelViews = new Map<
    string,
    SceneViewEntry<ParcelEntity, ParcelView>
  >()
  const terrainViews = new Map<
    string,
    TerrainViewEntry
  >()
  const primitiveViews = new Map<
    string,
    SceneViewEntry<PrimitiveEntity, PrimitiveView>
  >()
  let selectedEntityId: string | null = null
  let manipulationMode: PrimitiveManipulationMode = 'translate'
  let manipulationStartEntity: PrimitiveEntity | null = null
  let manipulating = false
  let resizeProportionsLocked = false
  let snapSettings: PrimitiveSnapSettings = {
    enabled: false,
    translationMeters: 0.25,
    rotationRadians: Math.PI / 12,
    resizeMeters: 0.1,
  }
  let currentProject: LandscapeProject | undefined
  let heatmapSettings: InstantSolarHeatmapSettings = { enabled: false }
  let solarProbeEnabled = false

  const updateSolarHeatmap = () => {
    if (!currentProject || !heatmapSettings.enabled || manipulating) {
      terrainViews.forEach(({ view }) => view.setExposureLayer(null))
      primitiveViews.forEach(({ view }) => view.setExposureLayer(null))
      return
    }
    const parcel = currentProject.entities.find(
      (entity): entity is ParcelEntity => entity.kind === 'parcel',
    )?.geometry
    terrainViews.forEach(({ terrain, view }) => {
      try {
        view.setExposureLayer(generateTerrainExposureLayer(
          currentProject!,
          terrain,
          parcel,
          heatmapSettings as Extract<
            InstantSolarHeatmapSettings,
            { readonly enabled: true }
          >,
        ))
      } catch (error) {
        view.setExposureLayer(null)
        view.object.userData.exposureError = error instanceof Error
          ? error.message
          : 'Exposure calculation failed'
      }
    })
    primitiveViews.forEach(({ entity, view }) => {
      try {
        view.setExposureLayer(generatePrimitiveExposureLayer(
          currentProject!,
          entity,
          heatmapSettings as Extract<
            InstantSolarHeatmapSettings,
            { readonly enabled: true }
          >,
        ))
      } catch (error) {
        view.setExposureLayer(null)
        view.object.userData.exposureError = error instanceof Error
          ? error.message
          : 'Exposure calculation failed'
      }
    })
  }

  const synchronizeManipulator = () => {
    const entry = selectedEntityId
      ? primitiveViews.get(selectedEntityId)
      : undefined
    if (!entry) {
      transformControls.detach()
      return
    }

    if (!manipulating) {
      transformProxy.position.copy(entry.view.object.position)
      transformProxy.rotation.copy(entry.view.object.rotation)
      transformProxy.scale.set(1, 1, 1)
      transformProxy.updateMatrixWorld(true)
    }
    if (transformControls.object !== transformProxy) {
      transformControls.attach(transformProxy)
    }
  }

  const updateProject = (project: LandscapeProject) => {
    currentProject = project
    const parcelEntities = project.entities.filter(
      (entity): entity is ParcelEntity => entity.kind === 'parcel',
    )
    const terrainEntities = project.entities.filter(
      (entity): entity is TerrainEntity => entity.kind === 'terrain',
    )
    const primitiveEntities = project.entities.filter(
      (entity): entity is PrimitiveEntity => entity.kind === 'primitive',
    )
    const parcel = parcelEntities[0]?.geometry
    synchronizeEntityViews(scene, parcelViews, parcelEntities, createParcelView)
    synchronizeEntityViews(
      scene,
      primitiveViews,
      primitiveEntities,
      createPrimitiveView,
    )
    primitiveViews.forEach(({ view }, entityId) => {
      view.setSelected(entityId === selectedEntityId)
    })
    synchronizeManipulator()
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
    updateSolarHeatmap()
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

  const raycaster = new THREE.Raycaster()
  let pointerStart:
    | { readonly pointerId: number; readonly x: number; readonly y: number }
    | undefined
  const handlePointerDown = (event: PointerEvent) => {
    if (event.button === 0 && !manipulating) {
      pointerStart = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      }
    }
  }
  const handlePointerUp = (event: PointerEvent) => {
    const start = pointerStart
    pointerStart = undefined
    if (
      !start ||
      start.pointerId !== event.pointerId ||
      Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4
    ) {
      return
    }

    const bounds = renderer.domElement.getBoundingClientRect()
    const pointer = new THREE.Vector2(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    )
    raycaster.setFromCamera(pointer, camera)
    if (solarProbeEnabled) {
      const probeRoots = [
        ...terrainViews.values(),
        ...primitiveViews.values(),
      ].map(({ view }) => view.object)
      const intersection = raycaster.intersectObjects(probeRoots, true).find(
        ({ object, face }) =>
          face && (
            object.name === 'terrain-surface' ||
            object.name.startsWith('primitive-mesh:')
          ),
      )
      if (!intersection?.face) return
      const normal = intersection.face.normal.clone().transformDirection(
        intersection.object.matrixWorld,
      ).normalize()
      const entityId = getPrimitiveEntityIdFromObject(intersection.object)
      const owningEntityId = currentProject?.entities.some(
        (entity) => entity.id === entityId && entity.kind === 'primitive',
      )
        ? entityId ?? undefined
        : undefined
      probeMarker.position.copy(intersection.point)
      probeNormal.setDirection(normal)
      probeMarker.visible = true
      options.onSolarProbe?.({
        eastMeters: intersection.point.x,
        elevationMeters: intersection.point.y,
        northMeters: -intersection.point.z,
        normal: { east: normal.x, up: normal.y, north: -normal.z },
        ...(owningEntityId ? { owningEntityId } : {}),
      })
      return
    }
    const roots = [...primitiveViews.values()].map(({ view }) => view.object)
    const intersection = raycaster.intersectObjects(roots, true)[0]
    options.onSelectionChange?.(
      intersection ? getPrimitiveEntityIdFromObject(intersection.object) : null,
    )
  }
  const handlePointerCancel = () => {
    pointerStart = undefined
  }
  renderer.domElement.addEventListener('pointerdown', handlePointerDown)
  renderer.domElement.addEventListener('pointerup', handlePointerUp)
  renderer.domElement.addEventListener('pointercancel', handlePointerCancel)

  const handleManipulationStart = () => {
    if (!selectedEntityId) {
      return
    }
    const entry = primitiveViews.get(selectedEntityId)
    if (!entry) {
      return
    }

    manipulating = true
    manipulationStartEntity = entry.entity
    transformProxy.scale.set(1, 1, 1)
    options.onManipulationStart?.()
  }
  const handlePrimitiveChange = () => {
    const start = manipulationStartEntity
    if (!manipulating || !start) {
      return
    }

    const transform = manipulationMode === 'resize'
      ? start.transform
      : {
          position: {
            eastMeters: transformProxy.position.x,
            elevationMeters: transformProxy.position.y,
            northMeters: -transformProxy.position.z,
          },
          rotation: {
            xRadians: transformProxy.rotation.x,
            yRadians: transformProxy.rotation.y,
            zRadians: transformProxy.rotation.z,
          },
        }
    const resizedGeometry = manipulationMode === 'resize'
      ? resizePrimitiveGeometry(
          start.geometry,
          transformProxy.scale,
          resizeProportionsLocked,
        )
      : start.geometry
    options.onPrimitiveChange?.({
      ...start,
      transform,
      geometry: manipulationMode === 'resize' && snapSettings.enabled
        ? snapPrimitiveGeometryDimensions(
            resizedGeometry,
            snapSettings.resizeMeters,
            resizeProportionsLocked,
          )
        : resizedGeometry,
    })
  }
  const handleManipulationEnd = () => {
    if (!manipulating) {
      return
    }

    manipulating = false
    manipulationStartEntity = null
    transformProxy.scale.set(1, 1, 1)
    options.onManipulationEnd?.()
    updateSolarHeatmap()
  }
  const handleDraggingChanged = (event: { value: unknown }) => {
    controls.enabled = event.value !== true
  }
  transformControls.addEventListener('mouseDown', handleManipulationStart)
  transformControls.addEventListener('objectChange', handlePrimitiveChange)
  transformControls.addEventListener('mouseUp', handleManipulationEnd)
  transformControls.addEventListener('dragging-changed', handleDraggingChanged)

  renderer.setAnimationLoop(() => {
    controls.update()
    renderer.render(scene, camera)
  })

  return {
    updateProject,
    setSelectedEntityId: (entityId) => {
      selectedEntityId = entityId
      primitiveViews.forEach(({ view }, primitiveEntityId) => {
        view.setSelected(primitiveEntityId === selectedEntityId)
      })
      synchronizeManipulator()
    },
    setManipulationMode: (mode) => {
      manipulationMode = mode
      transformControls.setMode(mode === 'resize' ? 'scale' : mode)
      transformControls.setSpace(mode === 'translate' ? 'world' : 'local')
    },
    setSnapSettings: (settings) => {
      if (
        !Number.isFinite(settings.translationMeters) ||
        settings.translationMeters <= 0 ||
        !Number.isFinite(settings.rotationRadians) ||
        settings.rotationRadians <= 0 ||
        !Number.isFinite(settings.resizeMeters) ||
        settings.resizeMeters <= 0
      ) {
        throw new Error('Snap increments must be positive finite numbers')
      }
      snapSettings = { ...settings }
      transformControls.setTranslationSnap(
        settings.enabled ? settings.translationMeters : null,
      )
      transformControls.setRotationSnap(
        settings.enabled ? settings.rotationRadians : null,
      )
      // Resize is snapped in physical units after shape-specific conversion.
      transformControls.setScaleSnap(null)
    },
    setResizeProportionsLocked: (locked) => {
      resizeProportionsLocked = locked
    },
    setSolarHeatmap: (settings) => {
      heatmapSettings = settings
      updateSolarHeatmap()
    },
    setSolarProbeEnabled: (enabled) => {
      solarProbeEnabled = enabled
      if (!enabled) probeMarker.visible = false
    },
    dispose: () => {
      if (manipulating) {
        options.onManipulationCancel?.()
      }
      manipulating = false
      resizeObserver.disconnect()
      renderer.setAnimationLoop(null)
      controls.dispose()
      transformControls.removeEventListener(
        'mouseDown',
        handleManipulationStart,
      )
      transformControls.removeEventListener(
        'objectChange',
        handlePrimitiveChange,
      )
      transformControls.removeEventListener('mouseUp', handleManipulationEnd)
      transformControls.removeEventListener(
        'dragging-changed',
        handleDraggingChanged,
      )
      transformControls.detach()
      transformControls.dispose()
      transformHelper.removeFromParent()
      transformProxy.removeFromParent()
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown)
      renderer.domElement.removeEventListener('pointerup', handlePointerUp)
      renderer.domElement.removeEventListener(
        'pointercancel',
        handlePointerCancel,
      )
      parcelViews.forEach(({ view }) => view.dispose())
      parcelViews.clear()
      terrainViews.forEach(({ view }) => view.dispose())
      terrainViews.clear()
      primitiveViews.forEach(({ view }) => view.dispose())
      primitiveViews.clear()
      probeMarkerGeometry.dispose()
      probeMarkerMaterial.dispose()
      probeNormal.line.geometry.dispose()
      probeNormal.cone.geometry.dispose()
      ;(probeNormal.line.material as THREE.Material).dispose()
      ;(probeNormal.cone.material as THREE.Material).dispose()
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}
