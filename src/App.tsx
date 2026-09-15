import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { ParcelEditor, type ParcelMode } from './components/ParcelEditor'
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
  DEFAULT_TERRAIN_ID,
  type SpotElevation,
  type TerrainEntity,
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

function App() {
  const viewportRef = useRef<HTMLDivElement>(null)
  const yardSceneRef = useRef<YardScene | null>(null)
  const [mode, setMode] = useState<ParcelMode>('rectangle')
  const [unit, setUnit] = useState<DisplayUnit>('meters')
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

    const yardScene = createYardScene(viewport)
    yardSceneRef.current = yardScene

    return () => {
      yardSceneRef.current = null
      yardScene.dispose()
    }
  }, []) // The Three.js lifecycle is intentionally independent of React state.

  useEffect(() => {
    yardSceneRef.current?.updateProject(project)
  }, [project])

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
      />
    </main>
  )
}

export default App
