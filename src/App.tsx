import { useEffect, useMemo, useRef, useState } from 'react'
import { ParcelEditor, type ParcelMode } from './components/ParcelEditor'
import {
  createRectangleVertices,
  insertParcelMidpoint,
  type ParcelGeometry,
  type ParcelPoint,
} from './domain/parcel'
import type { DisplayUnit } from './domain/units'
import { createYardScene, type YardScene } from './scene/createYardScene'
import './App.css'

function App() {
  const viewportRef = useRef<HTMLDivElement>(null)
  const yardSceneRef = useRef<YardScene | null>(null)
  const [mode, setMode] = useState<ParcelMode>('rectangle')
  const [unit, setUnit] = useState<DisplayUnit>('meters')
  const [rectangle, setRectangle] = useState({
    eastWestMeters: 30,
    northSouthMeters: 40,
  })
  const [polygonVertices, setPolygonVertices] = useState<ParcelPoint[]>(() =>
    createRectangleVertices(30, 40),
  )
  const [polygonIsCustomized, setPolygonIsCustomized] = useState(false)
  const [uncertaintyMeters, setUncertaintyMeters] = useState(0.3)

  const rectangleVertices = useMemo(
    () =>
      createRectangleVertices(
        rectangle.eastWestMeters,
        rectangle.northSouthMeters,
      ),
    [rectangle],
  )
  const parcel = useMemo<ParcelGeometry>(
    () => ({
      vertices: mode === 'rectangle' ? rectangleVertices : polygonVertices,
      uncertaintyMeters,
    }),
    [mode, polygonVertices, rectangleVertices, uncertaintyMeters],
  )

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
    yardSceneRef.current?.updateParcel(parcel)
  }, [parcel])

  return (
    <main className="app-shell">
      <div ref={viewportRef} className="viewport" />
      <ParcelEditor
        mode={mode}
        unit={unit}
        rectangle={rectangle}
        polygonVertices={polygonVertices}
        uncertaintyMeters={uncertaintyMeters}
        onModeChange={(nextMode) => {
          if (nextMode === 'polygon' && !polygonIsCustomized) {
            setPolygonVertices(rectangleVertices)
          }

          setMode(nextMode)
        }}
        onUnitChange={setUnit}
        onRectangleChange={setRectangle}
        onPolygonChange={(vertices) => {
          setPolygonIsCustomized(true)
          setPolygonVertices(vertices)
        }}
        onInsertVertex={(afterIndex) => {
          setPolygonIsCustomized(true)
          setPolygonVertices((vertices) =>
            insertParcelMidpoint(vertices, afterIndex),
          )
        }}
        onRemoveVertex={(index) => {
          setPolygonIsCustomized(true)
          setPolygonVertices((vertices) =>
            vertices.filter((_, vertexIndex) => vertexIndex !== index),
          )
        }}
        onResetPolygon={() => {
          setPolygonIsCustomized(false)
          setPolygonVertices(rectangleVertices)
        }}
        onUncertaintyChange={setUncertaintyMeters}
      />
    </main>
  )
}

export default App
