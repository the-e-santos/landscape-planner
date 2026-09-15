import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { ParcelEditor, type ParcelMode } from './components/ParcelEditor'
import {
  ObjectEditor,
  type PrimitiveCreationKind,
} from './components/ObjectEditor'
import { TerrainEditor } from './components/TerrainEditor'
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
} from './domain/project'
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
import { createYardScene, type YardScene } from './scene/createYardScene'
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

function App() {
  const viewportRef = useRef<HTMLDivElement>(null)
  const yardSceneRef = useRef<YardScene | null>(null)
  const [mode, setMode] = useState<ParcelMode>('rectangle')
  const [unit, setUnit] = useState<DisplayUnit>('meters')
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null)
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
  const activeSelectedEntityId = primitives.some(
    ({ id }) => id === selectedEntityId,
  )
    ? selectedEntityId
    : null
  const terrainIssues = validateTerrain(terrain)

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
    })
    yardSceneRef.current = yardScene

    return () => {
      yardSceneRef.current = null
      yardScene.dispose()
    }
  }, []) // The Three.js lifecycle is intentionally independent of React state.

  useEffect(() => {
    yardSceneRef.current?.updateProject(project)
  }, [project])

  useEffect(() => {
    yardSceneRef.current?.setSelectedEntityId(activeSelectedEntityId)
  }, [activeSelectedEntityId])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
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
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [projectStore])

  return (
    <main className="app-shell">
      <div ref={viewportRef} className="viewport" />
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
      />
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
      />
      <ObjectEditor
        primitives={primitives}
        selectedEntityId={activeSelectedEntityId}
        unit={unit}
        canUndo={projectStore.canUndo()}
        canRedo={projectStore.canRedo()}
        onAddPrimitive={(kind) => {
          const primitive = createUserPrimitive(kind, primitives)
          projectStore.dispatch({ type: 'primitive.add', primitive })
          setSelectedEntityId(primitive.id)
        }}
        onSelect={setSelectedEntityId}
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
      />
    </main>
  )
}

export default App
