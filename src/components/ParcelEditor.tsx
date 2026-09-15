import type { ParcelPoint } from '../domain/parcel'
import type { DisplayUnit } from '../domain/units'
import { LengthInput } from './LengthInput'

export type ParcelMode = 'rectangle' | 'polygon'

interface RectangleDimensions {
  eastWestMeters: number
  northSouthMeters: number
}

interface ParcelEditorProps {
  mode: ParcelMode
  unit: DisplayUnit
  rectangle: RectangleDimensions
  polygonVertices: readonly ParcelPoint[]
  uncertaintyMeters: number
  onModeChange: (mode: ParcelMode) => void
  onUnitChange: (unit: DisplayUnit) => void
  onRectangleChange: (rectangle: RectangleDimensions) => void
  onPolygonChange: (vertices: ParcelPoint[]) => void
  onInsertVertex: (afterIndex: number) => void
  onRemoveVertex: (index: number) => void
  onResetPolygon: () => void
  onUncertaintyChange: (meters: number) => void
}

export function ParcelEditor({
  mode,
  unit,
  rectangle,
  polygonVertices,
  uncertaintyMeters,
  onModeChange,
  onUnitChange,
  onRectangleChange,
  onPolygonChange,
  onInsertVertex,
  onRemoveVertex,
  onResetPolygon,
  onUncertaintyChange,
}: ParcelEditorProps) {
  const updateVertex = (
    index: number,
    field: keyof ParcelPoint,
    meters: number,
  ) => {
    onPolygonChange(
      polygonVertices.map((vertex, vertexIndex) =>
        vertexIndex === index ? { ...vertex, [field]: meters } : vertex,
      ),
    )
  }

  return (
    <aside className="parcel-panel" aria-label="Parcel editor">
      <header>
        <p className="eyebrow">Landscape planner</p>
        <h1>Parcel outline</h1>
        <p className="panel-intro">
          Start with rough dimensions, then refine measurements point by point.
        </p>
      </header>

      <fieldset className="segmented-field">
        <legend>Shape</legend>
        <div className="segmented-control">
          <button
            type="button"
            aria-pressed={mode === 'rectangle'}
            onClick={() => onModeChange('rectangle')}
          >
            Rectangle
          </button>
          <button
            type="button"
            aria-pressed={mode === 'polygon'}
            onClick={() => onModeChange('polygon')}
          >
            Polygon
          </button>
        </div>
      </fieldset>

      <label className="field" htmlFor="display-unit">
        <span>Display units</span>
        <select
          id="display-unit"
          value={unit}
          onChange={(event) =>
            onUnitChange(event.currentTarget.value as DisplayUnit)
          }
        >
          <option value="meters">Meters</option>
          <option value="feet">Feet</option>
        </select>
      </label>

      {mode === 'rectangle' ? (
        <section className="editor-section" aria-labelledby="dimensions-title">
          <h2 id="dimensions-title">Dimensions</h2>
          <LengthInput
            id="parcel-east-west"
            label="East–west"
            meters={rectangle.eastWestMeters}
            unit={unit}
            minMeters={0.5}
            onChange={(eastWestMeters) =>
              onRectangleChange({ ...rectangle, eastWestMeters })
            }
          />
          <LengthInput
            id="parcel-north-south"
            label="North–south"
            meters={rectangle.northSouthMeters}
            unit={unit}
            minMeters={0.5}
            onChange={(northSouthMeters) =>
              onRectangleChange({ ...rectangle, northSouthMeters })
            }
          />
          <p className="field-note">The rectangle stays centered on the origin.</p>
        </section>
      ) : (
        <section className="editor-section" aria-labelledby="vertices-title">
          <div className="section-heading">
            <h2 id="vertices-title">Boundary points</h2>
            <button className="text-button" type="button" onClick={onResetPolygon}>
              Reset from rectangle
            </button>
          </div>
          <p className="field-note">
            Points connect in order. North values map to world −Z.
          </p>
          <div className="vertex-list">
            {polygonVertices.map((vertex, index) => (
              <div className="vertex-card" key={index}>
                <div className="vertex-heading">
                  <strong>Point {index + 1}</strong>
                  <button
                    className="icon-button"
                    type="button"
                    title={`Remove point ${index + 1}`}
                    aria-label={`Remove point ${index + 1}`}
                    disabled={polygonVertices.length <= 3}
                    onClick={() => onRemoveVertex(index)}
                  >
                    ×
                  </button>
                </div>
                <LengthInput
                  id={`vertex-${index}-east`}
                  label="East"
                  meters={vertex.eastMeters}
                  unit={unit}
                  onChange={(meters) =>
                    updateVertex(index, 'eastMeters', meters)
                  }
                />
                <LengthInput
                  id={`vertex-${index}-north`}
                  label="North"
                  meters={vertex.northMeters}
                  unit={unit}
                  onChange={(meters) =>
                    updateVertex(index, 'northMeters', meters)
                  }
                />
                <button
                  className="add-point-button"
                  type="button"
                  onClick={() => onInsertVertex(index)}
                >
                  Add point after
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="editor-section" aria-labelledby="uncertainty-title">
        <h2 id="uncertainty-title">Measurement uncertainty</h2>
        <LengthInput
          id="parcel-uncertainty"
          label="± boundary distance"
          meters={uncertaintyMeters}
          unit={unit}
          minMeters={0}
          onChange={onUncertaintyChange}
        />
        <p className="field-note">
          The shaded corridor shows where the true boundary may lie.
        </p>
      </section>

      <footer className="panel-legend">
        <span><i className="legend-swatch boundary" /> Estimated boundary</span>
        <span><i className="legend-swatch north" /> True north (−Z)</span>
      </footer>
    </aside>
  )
}
