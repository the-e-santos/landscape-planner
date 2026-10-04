import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { ParcelEditor, type ParcelMode } from './components/ParcelEditor'
import { ProjectPersistence } from './components/ProjectPersistence'
import {
  ObjectEditor,
  type PrimitiveCreationKind,
} from './components/ObjectEditor'
import { TerrainEditor } from './components/TerrainEditor'
import {
  LandscapeEditor,
  type LandscapeCreationKind,
} from './components/LandscapeEditor'
import { SolarAnalysisPanel } from './components/SolarAnalysisPanel'
import {
  PanelPalette,
  type WorkspacePanelId,
  type WorkspacePanelVisibility,
} from './components/PanelPalette'
import {
  createRectangleVertices,
  insertParcelMidpoint,
  type ParcelPoint,
} from './domain/parcel'
import {
  createDefaultProject,
  DEFAULT_PARCEL_ID,
  getParcelEntity,
  getTerrainEntity,
  type LandscapeProject,
} from './domain/project'
import { deserializeProject } from './domain/projectSerialization'
import { createProjectStore } from './domain/projectStore'
import {
  clonePrimitiveEntity,
  type PrimitiveEntity,
  type PrimitiveGeometry,
} from './domain/primitive'
import {
  DEFAULT_TERRAIN_ID,
  getTerrainLinearConstraints,
  getTerrainRetainingWalls,
  type SpotElevation,
  type TerrainEntity,
  type TerrainLinearConstraint,
  type TerrainRetainingWall,
} from './domain/terrain'
import { validateTerrain } from './domain/terrainValidation'
import type { DisplayUnit } from './domain/units'
import type {
  IrrigationZoneEntity,
  LandscapeSemanticEntity,
  PlantEntity,
  PlantingBedEntity,
} from './domain/landscape'
import {
  evaluatePlantInteractionRules,
  getInteractionReferenceIssues,
  type PlantInteractionCatalogDocument,
  type PlantInteractionGroup,
  type PlantInteractionRule,
} from './domain/plantInteractions'
import {
  applyInteractionCatalogCommand,
  createInteractionCatalog,
  deserializeInteractionCatalog,
  type InteractionCatalogCommand,
} from './domain/interactionCatalog'
import type {
  SolarCalculationProgress,
  SolarHeatmapSettings,
} from './solar/exposureSettings'
import type { SolarComputePreference } from './solar/computeBackend'
import type { SurfacePoint } from './solar/pointSolar'
import {
  clearProjectAutosave,
  loadProjectAutosave,
  saveProjectAutosave,
} from './persistence/projectAutosave'
import {
  loadCatalogAutosave,
  saveCatalogAutosave,
} from './persistence/catalogAutosave'
import {
  createYardScene,
  type PrimitiveManipulationMode,
  type PrimitiveSnapSettings,
  type YardScene,
} from './scene/createYardScene'
import './App.css'

function createUserSpotElevation(terrain: TerrainEntity): SpotElevation {
  const usedIds = new Set(terrain.spotElevations.map(({ id }) => id))
  let sequence = 1
  let id = `${terrain.id}.spot.user-${sequence}`
  while (usedIds.has(id)) {
    sequence += 1
    id = `${terrain.id}.spot.user-${sequence}`
  }

  const count = terrain.spotElevations.length
  const centerEast =
    count === 0
      ? 0
      : terrain.spotElevations.reduce(
          (sum, spot) => sum + spot.eastMeters,
          0,
        ) / count
  const centerNorth =
    count === 0
      ? 0
      : terrain.spotElevations.reduce(
          (sum, spot) => sum + spot.northMeters,
          0,
        ) / count
  const elevation =
    count === 0
      ? 0
      : terrain.spotElevations.reduce(
          (sum, spot) => sum + spot.elevationMeters,
          0,
        ) / count
  let eastMeters = centerEast

  while (
    terrain.spotElevations.some(
      (spot) =>
        spot.eastMeters === eastMeters && spot.northMeters === centerNorth,
    )
  ) {
    eastMeters += 0.5
  }

  return {
    id,
    eastMeters,
    northMeters: centerNorth,
    elevationMeters: elevation,
    source: { kind: 'user' },
    uncertainty: { horizontalMeters: 0.1, verticalMeters: 0.05 },
  }
}

function createUserLinearConstraint(
  terrain: TerrainEntity,
): TerrainLinearConstraint {
  const constraints = getTerrainLinearConstraints(terrain)
  const usedIds = new Set(constraints.map(({ id }) => id))
  let sequence = 1
  let id = `${terrain.id}.constraint.user-${sequence}`
  while (usedIds.has(id)) {
    sequence += 1
    id = `${terrain.id}.constraint.user-${sequence}`
  }

  return {
    id,
    name: `Grade break ${constraints.length + 1}`,
    role: 'gradeBreak',
    spotElevationIds: terrain.spotElevations.slice(0, 2).map(({ id }) => id),
    source: { kind: 'user' },
  }
}

function createUserRetainingWall(terrain: TerrainEntity): TerrainRetainingWall {
  const walls = getTerrainRetainingWalls(terrain)
  const usedIds = new Set(walls.map(({ id }) => id))
  let sequence = 1
  let id = `${terrain.id}.retaining-wall.user-${sequence}`
  while (usedIds.has(id)) {
    sequence += 1
    id = `${terrain.id}.retaining-wall.user-${sequence}`
  }

  const eastValues = terrain.spotElevations.map(({ eastMeters }) => eastMeters)
  const northValues = terrain.spotElevations.map(({ northMeters }) => northMeters)
  const elevations = terrain.spotElevations.map(
    ({ elevationMeters }) => elevationMeters,
  )
  const centerEast = (Math.min(...eastValues) + Math.max(...eastValues)) / 2
  const centerNorth = (Math.min(...northValues) + Math.max(...northValues)) / 2
  const halfLength = Math.max(
    Math.min((Math.max(...eastValues) - Math.min(...eastValues)) / 6, 4),
    1,
  )
  const averageElevation =
    elevations.reduce((sum, elevation) => sum + elevation, 0) /
    elevations.length
  const stations = [
    centerEast - halfLength,
    centerEast - halfLength * 0.75,
    centerEast + halfLength * 0.75,
    centerEast + halfLength,
  ]

  return {
    id,
    name: `Retaining wall ${walls.length + 1}`,
    upperProfile: stations.map((eastMeters, index) => ({
      id: `${id}.upper.${index + 1}`,
      eastMeters,
      northMeters: centerNorth,
      elevationMeters:
        index === 0 || index === stations.length - 1
          ? averageElevation
          : averageElevation + 0.6,
    })),
    lowerProfile: stations.map((eastMeters, index) => ({
      id: `${id}.lower.${index + 1}`,
      eastMeters,
      northMeters: centerNorth,
      elevationMeters:
        index === 0 || index === stations.length - 1
          ? averageElevation
          : averageElevation - 0.4,
    })),
    upperSide: 'left',
    source: { kind: 'user' },
    uncertainty: { horizontalMeters: 0.1, verticalMeters: 0.05 },
  }
}

function createUserPrimitive(
  kind: PrimitiveCreationKind,
  primitives: readonly PrimitiveEntity[],
): PrimitiveEntity {
  const idKind = kind === 'polygonExtrusion' ? 'extrusion' : kind
  const usedIds = new Set(primitives.map(({ id }) => id))
  let sequence = 1
  let id = `primitive.${idKind}.user-${sequence}`
  while (usedIds.has(id)) {
    sequence += 1
    id = `primitive.${idKind}.user-${sequence}`
  }

  let geometry: PrimitiveGeometry
  let elevationMeters: number
  switch (kind) {
    case 'box':
      geometry = { kind: 'box', widthMeters: 1, heightMeters: 1, depthMeters: 1 }
      elevationMeters = 0.5
      break
    case 'cylinder':
      geometry = { kind: 'cylinder', radiusMeters: 0.5, heightMeters: 2 }
      elevationMeters = 1
      break
    case 'wall':
    case 'fence':
      geometry = {
        kind: 'wall',
        structure: kind,
        lengthMeters: 4,
        heightMeters: kind === 'wall' ? 2 : 1.8,
        thicknessMeters: kind === 'wall' ? 0.25 : 0.08,
      }
      elevationMeters = geometry.heightMeters / 2
      break
    case 'polygonExtrusion':
      geometry = {
        kind: 'polygonExtrusion',
        footprint: [
          { eastMeters: -1.2, northMeters: -0.8 },
          { eastMeters: 1.2, northMeters: -0.8 },
          { eastMeters: 0.8, northMeters: 1 },
          { eastMeters: -1, northMeters: 1.2 },
        ],
        heightMeters: 0.6,
      }
      elevationMeters = 0.3
      break
    case 'canopy':
      geometry = {
        kind: 'canopy',
        eastRadiusMeters: 2,
        verticalRadiusMeters: 1.5,
        northRadiusMeters: 2,
      }
      elevationMeters = 2.5
      break
  }

  const labels: Record<PrimitiveCreationKind, string> = {
    box: 'Box',
    cylinder: 'Cylinder',
    wall: 'Wall',
    fence: 'Fence',
    polygonExtrusion: 'Polygon extrusion',
    canopy: 'Canopy',
  }
  const placementIndex = primitives.length

  return {
    id,
    kind: 'primitive',
    name: `${labels[kind]} ${sequence}`,
    transform: {
      position: {
        eastMeters: -10 + (placementIndex % 6) * 4,
        elevationMeters,
        northMeters: -8 + Math.floor(placementIndex / 6) * 4,
      },
      rotation: { xRadians: 0, yRadians: 0, zRadians: 0 },
    },
    geometry,
    solarOptics: kind === 'canopy'
      ? { mode: 'transmissive', transmittance: 0.5 }
      : { mode: 'opaque' },
  }
}

function duplicateUserPrimitive(
  source: PrimitiveEntity,
  primitives: readonly PrimitiveEntity[],
): PrimitiveEntity {
  const usedIds = new Set(primitives.map(({ id }) => id))
  let sequence = 1
  let id = `${source.id}.copy-${sequence}`
  while (usedIds.has(id)) {
    sequence += 1
    id = `${source.id}.copy-${sequence}`
  }

  const clone = clonePrimitiveEntity(source)
  return {
    ...clone,
    id,
    name: `${source.name} copy`,
    transform: {
      ...clone.transform,
      position: {
        ...clone.transform.position,
        eastMeters: clone.transform.position.eastMeters + 1,
        northMeters: clone.transform.position.northMeters + 1,
      },
    },
  }
}

function nextLandscapeId(
  prefix: string,
  entityIds: ReadonlySet<string>,
): { readonly id: string; readonly sequence: number } {
  let sequence = 1
  let id = `${prefix}.user-${sequence}`
  while (entityIds.has(id)) {
    sequence += 1
    id = `${prefix}.user-${sequence}`
  }
  return { id, sequence }
}

function createUserLandscapeEntity(
  kind: LandscapeCreationKind,
  entities: readonly LandscapeSemanticEntity[],
  projectEntityIds: ReadonlySet<string>,
): LandscapeSemanticEntity {
  const kindEntities = entities.filter((entity) => entity.kind === kind)
  const placementIndex = kindEntities.length
  const centerEast = -9 + (placementIndex % 5) * 4
  const centerNorth = 5 + Math.floor(placementIndex / 5) * 4
  const footprint = [
    { eastMeters: centerEast - 1.5, northMeters: centerNorth - 1 },
    { eastMeters: centerEast + 1.5, northMeters: centerNorth - 1 },
    { eastMeters: centerEast + 1.5, northMeters: centerNorth + 1 },
    { eastMeters: centerEast - 1.5, northMeters: centerNorth + 1 },
  ]

  switch (kind) {
    case 'plantingBed': {
      const { id, sequence } = nextLandscapeId('bed', projectEntityIds)
      return {
        id,
        kind,
        name: `Planting bed ${sequence}`,
        footprint,
        soil: {
          texture: 'unknown',
          drainage: 'unknown',
          surfaceCover: 'bareSoil',
          usableRootDepthMeters: 0.45,
        },
      }
    }
    case 'irrigationZone': {
      const { id, sequence } = nextLandscapeId('irrigation', projectEntityIds)
      return {
        id,
        kind,
        name: `Irrigation zone ${sequence}`,
        footprint,
        deliveryMethod: 'drip',
        weeklyTargetMillimeters: 25,
      }
    }
    case 'plant': {
      const { id, sequence } = nextLandscapeId('plant', projectEntityIds)
      return {
        id,
        kind,
        name: `Plant ${sequence}`,
        taxonId: `taxon:unidentified-${sequence}`,
        scientificName: 'Unidentified plant',
        position: {
          eastMeters: centerEast,
          elevationMeters: 1,
          northMeters: centerNorth,
        },
        canopyRadiusMeters: 0.75,
        irrigationZoneIds: [],
        interactionGroupIds: [],
      }
    }
  }
}

function nextCatalogId(prefix: string, usedIds: ReadonlySet<string>): string {
  let sequence = 1
  let id = `${prefix}.user-${sequence}`
  while (usedIds.has(id)) {
    sequence += 1
    id = `${prefix}.user-${sequence}`
  }
  return id
}

function createUserInteractionGroup(
  groups: readonly PlantInteractionGroup[],
): PlantInteractionGroup {
  const id = nextCatalogId(
    'interaction-group',
    new Set(groups.map((group) => group.id)),
  )
  return { id, name: `Group ${groups.length + 1}` }
}

function createUserInteractionRule(
  groups: readonly PlantInteractionGroup[],
  rules: readonly PlantInteractionRule[],
): PlantInteractionRule | undefined {
  const group = groups[0]
  if (!group) return undefined
  const id = nextCatalogId(
    'interaction-rule',
    new Set(rules.map((rule) => rule.id)),
  )
  return {
    id,
    sourceGroupId: group.id,
    targetGroupId: group.id,
    direction: 'symmetric',
    effectType: 'irrigationCompatibility',
    polarity: 'contextDependent',
    domain: { type: 'sharedIrrigationZone' },
    strength: 'weak',
    confidence: 'low',
    sources: [{
      id: `${id}.source-1`,
      kind: 'personalObservation',
      title: 'User-defined observation',
    }],
  }
}

interface AppProps {
  readonly solarComputePreference?: SolarComputePreference
}

function App({ solarComputePreference = 'auto' }: AppProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const yardSceneRef = useRef<YardScene | null>(null)
  const [mode, setMode] = useState<ParcelMode>('rectangle')
  const [unit, setUnit] = useState<DisplayUnit>('meters')
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null)
  const [selectedLandscapeEntityId, setSelectedLandscapeEntityId] =
    useState<string | null>(null)
  const [manipulationMode, setManipulationMode] =
    useState<PrimitiveManipulationMode>('translate')
  const [snapSettings, setSnapSettings] = useState<PrimitiveSnapSettings>({
    enabled: true,
    translationMeters: 0.25,
    rotationRadians: Math.PI / 12,
    resizeMeters: 0.1,
  })
  const [snapOverrideActive, setSnapOverrideActive] = useState(false)
  const [resizeProportionsLocked, setResizeProportionsLocked] = useState(false)
  const [panelVisibility, setPanelVisibility] =
    useState<WorkspacePanelVisibility>({
      project: false,
      parcel: true,
      terrain: false,
      objects: false,
      landscape: false,
      solar: false,
    })
  const [solarHeatmapSettings, setSolarHeatmapSettings] =
    useState<SolarHeatmapSettings>({ enabled: false })
  const [solarProbeEnabled, setSolarProbeEnabled] = useState(false)
  const [solarProbeSurface, setSolarProbeSurface] =
    useState<SurfacePoint | null>(null)
  const [solarProgress, setSolarProgress] = useState<SolarCalculationProgress>({
    status: 'idle',
    stage: 0,
    stageCount: 0,
    message: 'Exposure layer is off.',
  })
  const [recoveryProject, setRecoveryProject] = useState<{
    project: LandscapeProject
    savedAt: string
  } | null>(null)
  const [autosaveEnabled, setAutosaveEnabled] = useState(false)
  const [persistenceStatus, setPersistenceStatus] = useState(
    'Checking local recovery…',
  )
  const [persistenceError, setPersistenceError] = useState<string | null>(null)
  const [interactionCatalog, setInteractionCatalog] =
    useState<PlantInteractionCatalogDocument | null>(null)
  const [catalogStatus, setCatalogStatus] = useState('No catalog attached.')
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [rectangle, setRectangle] = useState({
    eastWestMeters: 30,
    northSouthMeters: 40,
  })
  const [projectStore] = useState(() =>
    createProjectStore(createDefaultProject()),
  )
  const project = useSyncExternalStore(
    projectStore.subscribe,
    projectStore.getSnapshot,
  )
  const parcel = getParcelEntity(project, DEFAULT_PARCEL_ID).geometry
  const terrain = getTerrainEntity(project, DEFAULT_TERRAIN_ID)
  const primitives = useMemo(
    () => project.entities.filter(
      (entity): entity is PrimitiveEntity => entity.kind === 'primitive',
    ),
    [project],
  )
  const landscapeEntities = useMemo(
    () => project.entities.filter(
      (entity): entity is LandscapeSemanticEntity =>
        entity.kind === 'plantingBed' ||
        entity.kind === 'irrigationZone' ||
        entity.kind === 'plant',
    ),
    [project],
  )
  const plantingBeds = useMemo(
    () => landscapeEntities.filter(
      (entity): entity is PlantingBedEntity => entity.kind === 'plantingBed',
    ),
    [landscapeEntities],
  )
  const irrigationZones = useMemo(
    () => landscapeEntities.filter(
      (entity): entity is IrrigationZoneEntity =>
        entity.kind === 'irrigationZone',
    ),
    [landscapeEntities],
  )
  const plants = useMemo(
    () => landscapeEntities.filter(
      (entity): entity is PlantEntity => entity.kind === 'plant',
    ),
    [landscapeEntities],
  )
  const resolvedInteractionCatalog =
    interactionCatalog?.id === project.interactionCatalogId
      ? interactionCatalog
      : null
  const interactionFindings = useMemo(
    () => resolvedInteractionCatalog
      ? evaluatePlantInteractionRules(project, resolvedInteractionCatalog)
      : [],
    [project, resolvedInteractionCatalog],
  )
  const interactionReferenceIssues = useMemo(
    () => getInteractionReferenceIssues(project, resolvedInteractionCatalog),
    [project, resolvedInteractionCatalog],
  )
  const activeSelectedLandscapeEntityId = landscapeEntities.some(
    ({ id }) => id === selectedLandscapeEntityId,
  )
    ? selectedLandscapeEntityId
    : null
  const activeSelectedEntityId = primitives.some(
    ({ id }) => id === selectedEntityId,
  )
    ? selectedEntityId
    : null
  const terrainIssues = validateTerrain(terrain)
  const togglePanel = (panelId: WorkspacePanelId) => {
    setPanelVisibility((visibility) => ({
      ...visibility,
      [panelId]: !visibility[panelId],
    }))
  }
  const closePanel = (panelId: WorkspacePanelId) => {
    setPanelVisibility((visibility) => ({
      ...visibility,
      [panelId]: false,
    }))
  }

  useEffect(() => {
    let active = true
    loadProjectAutosave()
      .then((autosave) => {
        if (!active) return
        if (autosave) {
          setRecoveryProject({
            project: deserializeProject(autosave.json),
            savedAt: autosave.savedAt,
          })
          setPanelVisibility((visibility) => ({
            ...visibility,
            project: true,
          }))
          setPersistenceStatus('Choose whether to restore the local recovery copy.')
        } else {
          setAutosaveEnabled(true)
          setPersistenceStatus('Autosave ready.')
        }
      })
      .catch((error: unknown) => {
        if (!active) return
        setPersistenceError(
          `Local recovery could not be read: ${error instanceof Error ? error.message : 'unknown error'}`,
        )
        setAutosaveEnabled(true)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!autosaveEnabled) return
    const timer = window.setTimeout(() => {
      saveProjectAutosave(project)
        .then(() => {
          setPersistenceError(null)
          setPersistenceStatus(`Autosaved at ${new Date().toLocaleTimeString()}.`)
        })
        .catch((error: unknown) => setPersistenceError(
          `Autosave failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        ))
    }, 750)
    return () => window.clearTimeout(timer)
  }, [autosaveEnabled, project])

  useEffect(() => {
    const catalogId = project.interactionCatalogId
    if (!catalogId) return
    if (interactionCatalog?.id === catalogId) return
    let active = true
    loadCatalogAutosave(catalogId)
      .then((record) => {
        if (!active) return
        if (!record) {
          setInteractionCatalog(null)
          setCatalogStatus(`Catalog ${catalogId} is unavailable. Memberships are retained.`)
          return
        }
        const catalog = deserializeInteractionCatalog(record.json)
        setInteractionCatalog(catalog)
        setCatalogError(null)
        setCatalogStatus(`Loaded local catalog ${catalog.name}.`)
      })
      .catch((error: unknown) => {
        if (!active) return
        setCatalogError(
          `Catalog recovery failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        )
      })
    return () => { active = false }
  }, [interactionCatalog?.id, project.interactionCatalogId])

  useEffect(() => {
    if (!interactionCatalog) return
    const timer = window.setTimeout(() => {
      saveCatalogAutosave(interactionCatalog)
        .then(() => {
          setCatalogError(null)
          setCatalogStatus(`Catalog autosaved at ${new Date().toLocaleTimeString()}.`)
        })
        .catch((error: unknown) => setCatalogError(
          `Catalog autosave failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        ))
    }, 750)
    return () => window.clearTimeout(timer)
  }, [interactionCatalog])

  const dispatchCatalog = (command: InteractionCatalogCommand) => {
    setInteractionCatalog((catalog) => {
      if (!catalog) throw new Error('No interaction catalog is loaded')
      return applyInteractionCatalogCommand(catalog, command)
    })
  }

  const rectangleVertices = useMemo(
    () =>
      createRectangleVertices(
        rectangle.eastWestMeters,
        rectangle.northSouthMeters,
      ),
    [rectangle],
  )
  const replaceParcelGeometry = (
    vertices: readonly ParcelPoint[],
    uncertaintyMeters = parcel.uncertaintyMeters,
  ) => {
    projectStore.dispatch({
      type: 'parcel.geometry.replace',
      entityId: DEFAULT_PARCEL_ID,
      geometry: { vertices, uncertaintyMeters },
    })
  }

  useEffect(() => {
    const viewport = viewportRef.current

    if (!viewport) {
      return
    }

    const yardScene = createYardScene(viewport, {
      onSelectionChange: setSelectedEntityId,
      onManipulationStart: projectStore.beginTransaction,
      onPrimitiveChange: (primitive) => projectStore.dispatch({
        type: 'primitive.replace',
        primitive,
      }),
      onManipulationEnd: projectStore.commitTransaction,
      onManipulationCancel: projectStore.cancelTransaction,
      onSolarProbe: setSolarProbeSurface,
      onSolarProgress: setSolarProgress,
      solarComputePreference,
    })
    yardSceneRef.current = yardScene

    return () => {
      yardSceneRef.current = null
      yardScene.dispose()
    }
  }, [projectStore, solarComputePreference]) // Independent of project snapshots.

  useEffect(() => {
    yardSceneRef.current?.updateProject(project)
  }, [project])

  useEffect(() => {
    yardSceneRef.current?.setSelectedEntityId(activeSelectedEntityId)
  }, [activeSelectedEntityId])

  useEffect(() => {
    yardSceneRef.current?.setManipulationMode(manipulationMode)
  }, [manipulationMode])

  useEffect(() => {
    yardSceneRef.current?.setSnapSettings({
      ...snapSettings,
      enabled: snapSettings.enabled !== snapOverrideActive,
    })
  }, [snapOverrideActive, snapSettings])

  useEffect(() => {
    yardSceneRef.current?.setResizeProportionsLocked(resizeProportionsLocked)
  }, [resizeProportionsLocked])

  useEffect(() => {
    yardSceneRef.current?.setSolarHeatmap(solarHeatmapSettings)
  }, [solarHeatmapSettings])

  useEffect(() => {
    yardSceneRef.current?.setSolarProbeEnabled(solarProbeEnabled)
  }, [solarProbeEnabled])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Shift') {
        setSnapOverrideActive(true)
        return
      }
      const target = event.target
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return
      }
      if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        const shortcutModes: Partial<Record<string, PrimitiveManipulationMode>> = {
          w: 'translate',
          e: 'rotate',
          r: 'resize',
        }
        const shortcutMode = shortcutModes[event.key.toLowerCase()]
        if (shortcutMode) {
          event.preventDefault()
          setManipulationMode(shortcutMode)
          return
        }
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === 'y'
      ) {
        event.preventDefault()
        projectStore.redo()
        return
      }
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') {
        return
      }

      event.preventDefault()
      if (event.shiftKey) {
        projectStore.redo()
      } else {
        projectStore.undo()
      }
    }
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Shift') {
        setSnapOverrideActive(false)
      }
    }
    const handleBlur = () => setSnapOverrideActive(false)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleBlur)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleBlur)
    }
  }, [projectStore])

  return (
    <main className="app-shell">
      <div ref={viewportRef} className="viewport" />
      <PanelPalette visibility={panelVisibility} onToggle={togglePanel} />
      <div hidden={!panelVisibility.project}>
        <ProjectPersistence
        project={project}
        recoverySavedAt={recoveryProject?.savedAt ?? null}
        status={persistenceStatus}
        error={persistenceError}
        onLoad={(file) => {
          file.text()
            .then((json) => {
              const loadedProject = deserializeProject(json)
              setInteractionCatalog(null)
              setCatalogStatus(
                loadedProject.interactionCatalogId
                  ? `Looking for catalog ${loadedProject.interactionCatalogId} locally…`
                  : 'No catalog attached. Create or load one to enable guidance.',
              )
              projectStore.replaceProject(loadedProject)
              setMode('polygon')
              setSelectedEntityId(null)
              setSelectedLandscapeEntityId(null)
              setRecoveryProject(null)
              setAutosaveEnabled(true)
              setPersistenceError(null)
              setPersistenceStatus(`Loaded ${file.name}.`)
            })
            .catch((error: unknown) => setPersistenceError(
              `Could not load ${file.name}: ${error instanceof Error ? error.message : 'unknown error'}`,
            ))
        }}
        onRestore={() => {
          if (!recoveryProject) return
          projectStore.replaceProject(recoveryProject.project)
          setInteractionCatalog(null)
          setCatalogStatus(
            recoveryProject.project.interactionCatalogId
              ? `Looking for catalog ${recoveryProject.project.interactionCatalogId} locally…`
              : 'No catalog attached. Create or load one to enable guidance.',
          )
          setMode('polygon')
          setSelectedEntityId(null)
          setSelectedLandscapeEntityId(null)
          setRecoveryProject(null)
          setAutosaveEnabled(true)
          setPersistenceError(null)
          setPersistenceStatus('Recovered local autosave.')
        }}
        onDismissRecovery={() => {
          clearProjectAutosave()
            .then(() => {
              setRecoveryProject(null)
              setAutosaveEnabled(true)
              setPersistenceError(null)
              setPersistenceStatus('Recovery dismissed. Autosave ready.')
            })
            .catch((error: unknown) => setPersistenceError(
              `Could not dismiss recovery: ${error instanceof Error ? error.message : 'unknown error'}`,
            ))
        }}
          onClose={() => closePanel('project')}
        />
      </div>
      <div hidden={!panelVisibility.solar}>
        <SolarAnalysisPanel
        project={project}
        computePreference={solarComputePreference}
        onHeatmapChange={setSolarHeatmapSettings}
        probedSurface={solarProbeSurface}
        onProbeEnabledChange={setSolarProbeEnabled}
        progress={solarProgress}
          onClose={() => closePanel('solar')}
        />
      </div>
      <div hidden={!panelVisibility.parcel}>
        <ParcelEditor
        mode={mode}
        unit={unit}
        rectangle={rectangle}
        polygonVertices={parcel.vertices}
        uncertaintyMeters={parcel.uncertaintyMeters}
        onModeChange={(nextMode) => {
          if (nextMode === 'rectangle') {
            replaceParcelGeometry(rectangleVertices)
          }

          setMode(nextMode)
        }}
        onUnitChange={setUnit}
        onRectangleChange={(nextRectangle) => {
          setRectangle(nextRectangle)
          replaceParcelGeometry(
            createRectangleVertices(
              nextRectangle.eastWestMeters,
              nextRectangle.northSouthMeters,
            ),
          )
        }}
        onPolygonChange={(vertices) => {
          replaceParcelGeometry(vertices)
        }}
        onInsertVertex={(afterIndex) => {
          replaceParcelGeometry(insertParcelMidpoint(parcel.vertices, afterIndex))
        }}
        onRemoveVertex={(index) => {
          replaceParcelGeometry(
            parcel.vertices.filter((_, vertexIndex) => vertexIndex !== index),
          )
        }}
        onResetPolygon={() => {
          replaceParcelGeometry(rectangleVertices)
        }}
        onUncertaintyChange={(uncertaintyMeters) =>
          replaceParcelGeometry(parcel.vertices, uncertaintyMeters)
        }
          onClose={() => closePanel('parcel')}
        />
      </div>
      <div hidden={!panelVisibility.terrain}>
        <TerrainEditor
        terrain={terrain}
        unit={unit}
        issues={terrainIssues}
        onAddSpot={() =>
          projectStore.dispatch({
            type: 'terrain.spotElevation.add',
            terrainEntityId: terrain.id,
            spotElevation: createUserSpotElevation(terrain),
          })
        }
        onReplaceSpot={(spotElevation) =>
          projectStore.dispatch({
            type: 'terrain.spotElevation.replace',
            terrainEntityId: terrain.id,
            spotElevation,
          })
        }
        onRemoveSpot={(spotElevationId) =>
          projectStore.dispatch({
            type: 'terrain.spotElevation.remove',
            terrainEntityId: terrain.id,
            spotElevationId,
          })
        }
        onAddConstraint={() =>
          projectStore.dispatch({
            type: 'terrain.linearConstraint.add',
            terrainEntityId: terrain.id,
            constraint: createUserLinearConstraint(terrain),
          })
        }
        onReplaceConstraint={(constraint) =>
          projectStore.dispatch({
            type: 'terrain.linearConstraint.replace',
            terrainEntityId: terrain.id,
            constraint,
          })
        }
        onRemoveConstraint={(constraintId) =>
          projectStore.dispatch({
            type: 'terrain.linearConstraint.remove',
            terrainEntityId: terrain.id,
            constraintId,
          })
        }
        onAddRetainingWall={() =>
          projectStore.dispatch({
            type: 'terrain.retainingWall.add',
            terrainEntityId: terrain.id,
            retainingWall: createUserRetainingWall(terrain),
          })
        }
        onReplaceRetainingWall={(retainingWall) =>
          projectStore.dispatch({
            type: 'terrain.retainingWall.replace',
            terrainEntityId: terrain.id,
            retainingWall,
          })
        }
        onRemoveRetainingWall={(retainingWallId) =>
          projectStore.dispatch({
            type: 'terrain.retainingWall.remove',
            terrainEntityId: terrain.id,
            retainingWallId,
          })
        }
          onClose={() => closePanel('terrain')}
        />
      </div>
      <div hidden={!panelVisibility.objects}>
        <ObjectEditor
        primitives={primitives}
        selectedEntityId={activeSelectedEntityId}
        unit={unit}
        canUndo={projectStore.canUndo()}
        canRedo={projectStore.canRedo()}
        manipulationMode={manipulationMode}
        snapSettings={snapSettings}
        snapOverrideActive={snapOverrideActive}
        resizeProportionsLocked={resizeProportionsLocked}
        onAddPrimitive={(kind) => {
          const primitive = createUserPrimitive(kind, primitives)
          projectStore.dispatch({ type: 'primitive.add', primitive })
          setSelectedEntityId(primitive.id)
        }}
        onSelect={setSelectedEntityId}
        onManipulationModeChange={setManipulationMode}
        onSnapSettingsChange={setSnapSettings}
        onResizeProportionsLockedChange={setResizeProportionsLocked}
        onReplace={(primitive) => projectStore.dispatch({
          type: 'primitive.replace',
          primitive,
        })}
        onDuplicate={(source) => {
          const primitive = duplicateUserPrimitive(source, primitives)
          projectStore.dispatch({ type: 'primitive.add', primitive })
          setSelectedEntityId(primitive.id)
        }}
        onRemove={(entityId) => {
          projectStore.dispatch({ type: 'primitive.remove', entityId })
          setSelectedEntityId(null)
        }}
        onUndo={projectStore.undo}
        onRedo={projectStore.redo}
          onClose={() => closePanel('objects')}
        />
      </div>
      <div hidden={!panelVisibility.landscape}>
        <LandscapeEditor
          plantingBeds={plantingBeds}
          irrigationZones={irrigationZones}
          plants={plants}
          interactionCatalog={resolvedInteractionCatalog}
          interactionFindings={interactionFindings}
          interactionReferenceIssues={interactionReferenceIssues}
          catalogStatus={catalogStatus}
          catalogError={catalogError}
          selectedEntityId={activeSelectedLandscapeEntityId}
          unit={unit}
          canUndo={projectStore.canUndo()}
          canRedo={projectStore.canRedo()}
          onAdd={(kind) => {
            const entity = createUserLandscapeEntity(
              kind,
              landscapeEntities,
              new Set(project.entities.map(({ id }) => id)),
            )
            projectStore.dispatch({
              type: 'landscapeSemantic.add',
              entity,
            })
            setSelectedLandscapeEntityId(entity.id)
          }}
          onSelect={setSelectedLandscapeEntityId}
          onReplace={(entity) => projectStore.dispatch({
            type: 'landscapeSemantic.replace',
            entity,
          })}
          onRemove={(entityId) => {
            projectStore.dispatch({
              type: 'landscapeSemantic.remove',
              entityId,
            })
            setSelectedLandscapeEntityId(null)
          }}
          onNewCatalog={() => {
            const catalog = createInteractionCatalog(
              `interaction-catalog.${crypto.randomUUID()}`,
            )
            setInteractionCatalog(catalog)
            projectStore.dispatch({
              type: 'project.interactionCatalog.set',
              catalogId: catalog.id,
            })
            setCatalogError(null)
            setCatalogStatus(`Created ${catalog.name}.`)
          }}
          onLoadCatalog={(file) => file.text()
            .then((json) => {
              const catalog = deserializeInteractionCatalog(json)
              setInteractionCatalog(catalog)
              projectStore.dispatch({
                type: 'project.interactionCatalog.set',
                catalogId: catalog.id,
              })
              setCatalogError(null)
              setCatalogStatus(`Loaded ${file.name}.`)
            })
            .catch((error: unknown) => setCatalogError(
              `Could not load ${file.name}: ${error instanceof Error ? error.message : 'unknown error'}`,
            ))}
          onDetachCatalog={() => {
            setInteractionCatalog(null)
            projectStore.dispatch({ type: 'project.interactionCatalog.set' })
            setCatalogError(null)
            setCatalogStatus('Catalog detached. Plant memberships were retained.')
          }}
          onCatalogNameChange={(name) => dispatchCatalog({
            type: 'catalog.name.set',
            name,
          })}
          onAddGroup={() => {
            if (!resolvedInteractionCatalog) return
            dispatchCatalog({
              type: 'group.add',
              group: createUserInteractionGroup(resolvedInteractionCatalog.groups),
            })
          }}
          onReplaceGroup={(group) => dispatchCatalog({
            type: 'group.replace',
            group,
          })}
          onRemoveGroup={(groupId) => dispatchCatalog({
            type: 'group.remove',
            groupId,
          })}
          onAddRule={() => {
            if (!resolvedInteractionCatalog) return undefined
            const rule = createUserInteractionRule(
              resolvedInteractionCatalog.groups,
              resolvedInteractionCatalog.rules,
            )
            if (!rule) return undefined
            dispatchCatalog({ type: 'rule.add', rule })
            return rule.id
          }}
          onReplaceRule={(rule) => dispatchCatalog({
            type: 'rule.replace',
            rule,
          })}
          onRemoveRule={(ruleId) => dispatchCatalog({
            type: 'rule.remove',
            ruleId,
          })}
          onUndo={projectStore.undo}
          onRedo={projectStore.redo}
          onClose={() => closePanel('landscape')}
        />
      </div>
    </main>
  )
}

export default App
