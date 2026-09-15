import {
  type SpotElevation,
  type TerrainEntity,
  type TerrainMeasurementSourceKind,
} from '../domain/terrain'
import type { TerrainValidationIssue } from '../domain/terrainValidation'
import {
  displayLengthInputValue,
  displayUnitLabel,
  type DisplayUnit,
} from '../domain/units'
import { LengthInput } from './LengthInput'

interface TerrainEditorProps {
  readonly terrain: TerrainEntity
  readonly unit: DisplayUnit
  readonly issues: readonly TerrainValidationIssue[]
  readonly onAddSpot: () => void
  readonly onReplaceSpot: (spot: SpotElevation) => void
  readonly onRemoveSpot: (spotElevationId: string) => void
}

const SOURCE_OPTIONS: ReadonlyArray<{
  value: TerrainMeasurementSourceKind
  label: string
}> = [
  { value: 'survey', label: 'Survey' },
  { value: 'lidar', label: 'LiDAR' },
  { value: 'gis', label: 'GIS' },
  { value: 'estimated', label: 'Estimated' },
  { value: 'user', label: 'User entered' },
]

export function TerrainEditor({
  terrain,
  unit,
  issues,
  onAddSpot,
  onReplaceSpot,
  onRemoveSpot,
}: TerrainEditorProps) {
  const updateSpot = <Field extends keyof SpotElevation>(
    spot: SpotElevation,
    field: Field,
    value: SpotElevation[Field],
  ) => onReplaceSpot({ ...spot, [field]: value })

  return (
    <aside className="terrain-panel" aria-label="Terrain editor">
      <header>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Terrain inputs</p>
            <h1>Spot elevations</h1>
          </div>
          <button className="primary-small-button" type="button" onClick={onAddSpot}>
            Add spot
          </button>
        </div>
        <p className="panel-intro">
          The surface is derived from these measurements.
        </p>
      </header>

      {issues.length > 0 ? (
        <section className="terrain-validation" aria-label="Terrain validation">
          <strong>Surface needs attention</strong>
          <ul>
            {issues.map((issue, index) => (
              <li key={`${issue.code}-${index}`}>{issue.message}</li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="terrain-valid">Inputs form a valid surface.</p>
      )}

      <div className="terrain-spot-list">
        {terrain.spotElevations.map((spot, index) => (
          <details className="terrain-spot-card" key={spot.id}>
            <summary>
              <span>Spot {index + 1}</span>
              <span>
                {displayLengthInputValue(spot.elevationMeters, unit)}{' '}
                {displayUnitLabel(unit)}
              </span>
            </summary>
            <code title={spot.id}>{spot.id}</code>
            <LengthInput
              id={`terrain-${spot.id}-east`}
              label="East"
              meters={spot.eastMeters}
              unit={unit}
              onChange={(meters) => updateSpot(spot, 'eastMeters', meters)}
            />
            <LengthInput
              id={`terrain-${spot.id}-north`}
              label="North"
              meters={spot.northMeters}
              unit={unit}
              onChange={(meters) => updateSpot(spot, 'northMeters', meters)}
            />
            <LengthInput
              id={`terrain-${spot.id}-elevation`}
              label="Elevation"
              meters={spot.elevationMeters}
              unit={unit}
              onChange={(meters) => updateSpot(spot, 'elevationMeters', meters)}
            />
            <label className="field" htmlFor={`terrain-${spot.id}-source`}>
              <span>Source</span>
              <select
                id={`terrain-${spot.id}-source`}
                value={spot.source.kind}
                onChange={(event) =>
                  updateSpot(spot, 'source', {
                    ...spot.source,
                    kind: event.currentTarget.value as TerrainMeasurementSourceKind,
                  })
                }
              >
                {SOURCE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <LengthInput
              id={`terrain-${spot.id}-horizontal-uncertainty`}
              label="± horizontal"
              meters={spot.uncertainty.horizontalMeters}
              unit={unit}
              minMeters={0}
              onChange={(horizontalMeters) =>
                updateSpot(spot, 'uncertainty', {
                  ...spot.uncertainty,
                  horizontalMeters,
                })
              }
            />
            <LengthInput
              id={`terrain-${spot.id}-vertical-uncertainty`}
              label="± vertical"
              meters={spot.uncertainty.verticalMeters}
              unit={unit}
              minMeters={0}
              onChange={(verticalMeters) =>
                updateSpot(spot, 'uncertainty', {
                  ...spot.uncertainty,
                  verticalMeters,
                })
              }
            />
            <button
              className="remove-spot-button"
              type="button"
              disabled={terrain.spotElevations.length <= 3}
              title={
                terrain.spotElevations.length <= 3
                  ? 'A terrain surface needs at least three spots.'
                  : `Remove spot ${index + 1}`
              }
              onClick={() => onRemoveSpot(spot.id)}
            >
              Remove spot
            </button>
          </details>
        ))}
      </div>
    </aside>
  )
}
