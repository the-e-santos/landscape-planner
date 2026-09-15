import { useState } from 'react'
import {
  getTerrainLinearConstraints,
  type SpotElevation,
  type TerrainEntity,
  type TerrainLinearConstraint,
  type TerrainLinearConstraintRole,
  type TerrainRetainingWall,
} from '../domain/terrain'
import type { TerrainValidationIssue } from '../domain/terrainValidation'
import {
  displayLengthInputValue,
  displayUnitLabel,
  type DisplayUnit,
} from '../domain/units'
import { LengthInput } from './LengthInput'
import { RetainingWallEditor } from './RetainingWallEditor'
import { useDraggablePanel } from './useDraggablePanel'

interface TerrainEditorProps {
  readonly terrain: TerrainEntity
  readonly unit: DisplayUnit
  readonly issues: readonly TerrainValidationIssue[]
  readonly onAddSpot: () => void
  readonly onReplaceSpot: (spot: SpotElevation) => void
  readonly onRemoveSpot: (spotElevationId: string) => void
  readonly onAddConstraint: () => void
  readonly onReplaceConstraint: (constraint: TerrainLinearConstraint) => void
  readonly onRemoveConstraint: (constraintId: string) => void
  readonly onAddRetainingWall: () => void
  readonly onReplaceRetainingWall: (retainingWall: TerrainRetainingWall) => void
  readonly onRemoveRetainingWall: (retainingWallId: string) => void
}

const ROLE_OPTIONS: ReadonlyArray<{
  value: TerrainLinearConstraintRole
  label: string
}> = [
  { value: 'gradeBreak', label: 'Grade break' },
  { value: 'ridge', label: 'Ridge' },
  { value: 'swale', label: 'Swale' },
]

export function TerrainEditor({
  terrain,
  unit,
  issues,
  onAddSpot,
  onReplaceSpot,
  onRemoveSpot,
  onAddConstraint,
  onReplaceConstraint,
  onRemoveConstraint,
  onAddRetainingWall,
  onReplaceRetainingWall,
  onRemoveRetainingWall,
}: TerrainEditorProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const { panelRef, dragHandleProps } = useDraggablePanel<HTMLElement>()
  const constraints = getTerrainLinearConstraints(terrain)
  const updateSpot = <Field extends keyof SpotElevation>(
    spot: SpotElevation,
    field: Field,
    value: SpotElevation[Field],
  ) => onReplaceSpot({ ...spot, [field]: value })

  const updateConstraint = <Field extends keyof TerrainLinearConstraint>(
    constraint: TerrainLinearConstraint,
    field: Field,
    value: TerrainLinearConstraint[Field],
  ) => onReplaceConstraint({ ...constraint, [field]: value })

  const replaceConstraintSpot = (
    constraint: TerrainLinearConstraint,
    index: number,
    spotElevationId: string,
  ) => {
    const spotElevationIds = [...constraint.spotElevationIds]
    spotElevationIds[index] = spotElevationId
    updateConstraint(constraint, 'spotElevationIds', spotElevationIds)
  }

  const moveConstraintSpot = (
    constraint: TerrainLinearConstraint,
    index: number,
    offset: -1 | 1,
  ) => {
    const nextIndex = index + offset
    const spotElevationIds = [...constraint.spotElevationIds]
    ;[spotElevationIds[index], spotElevationIds[nextIndex]] = [
      spotElevationIds[nextIndex],
      spotElevationIds[index],
    ]
    updateConstraint(constraint, 'spotElevationIds', spotElevationIds)
  }

  const spotLabel = (spotElevationId: string) => {
    const index = terrain.spotElevations.findIndex(
      ({ id }) => id === spotElevationId,
    )
    return index < 0 ? `Missing: ${spotElevationId}` : `Spot ${index + 1}`
  }

  return (
    <aside
      ref={panelRef}
      className={`terrain-panel${isCollapsed ? ' panel-collapsed' : ''}`}
      aria-label="Terrain editor"
    >
      <header
        className="panel-header panel-drag-handle"
        title="Drag to move terrain panel"
        {...dragHandleProps}
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">Terrain inputs</p>
            <h1>Spot elevations</h1>
          </div>
          <div className="panel-header-actions">
            {!isCollapsed && (
              <button className="primary-small-button" type="button" onClick={onAddSpot}>
                Add spot
              </button>
            )}
            <button
              className="panel-collapse-button"
              type="button"
              aria-expanded={!isCollapsed}
              aria-controls="terrain-editor-content"
              onClick={() => setIsCollapsed((collapsed) => !collapsed)}
            >
              {isCollapsed ? 'Expand' : 'Collapse'}
            </button>
          </div>
        </div>
        {!isCollapsed && (
          <p className="panel-intro">
            The surface is derived from these measurements.
          </p>
        )}
      </header>

      <div id="terrain-editor-content" hidden={isCollapsed}>
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

      <section className="terrain-constraint-section">
        <div className="section-heading">
          <div>
            <h2>Terrain lines</h2>
            <p className="field-note">Ordered spots control constrained edges.</p>
          </div>
          <button
            className="primary-small-button"
            type="button"
            disabled={terrain.spotElevations.length < 2}
            onClick={onAddConstraint}
          >
            Add line
          </button>
        </div>

        {constraints.length === 0 ? (
          <p className="terrain-empty-state">
            Add a grade break, ridge, or swale to preserve that line in the
            triangulated surface.
          </p>
        ) : (
          <div className="terrain-constraint-list">
            {constraints.map((constraint, constraintIndex) => (
              <details className="terrain-constraint-card" key={constraint.id}>
                <summary>
                  <span
                    className={`constraint-role-swatch ${constraint.role}`}
                    aria-hidden="true"
                  />
                  <span>{constraint.name || `Terrain line ${constraintIndex + 1}`}</span>
                  <span>{constraint.spotElevationIds.length} points</span>
                </summary>
                <code title={constraint.id}>{constraint.id}</code>
                <label className="field" htmlFor={`terrain-${constraint.id}-name`}>
                  <span>Name</span>
                  <input
                    className="terrain-text-input"
                    id={`terrain-${constraint.id}-name`}
                    value={constraint.name}
                    onChange={(event) =>
                      updateConstraint(constraint, 'name', event.currentTarget.value)
                    }
                  />
                </label>
                <label className="field" htmlFor={`terrain-${constraint.id}-role`}>
                  <span>Role</span>
                  <select
                    id={`terrain-${constraint.id}-role`}
                    value={constraint.role}
                    onChange={(event) =>
                      updateConstraint(
                        constraint,
                        'role',
                        event.currentTarget.value as TerrainLinearConstraintRole,
                      )
                    }
                  >
                    {ROLE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="constraint-point-heading">
                  <span>Ordered points</span>
                  <button
                    className="text-button"
                    type="button"
                    disabled={terrain.spotElevations.length === 0}
                    onClick={() => {
                      const usedIds = new Set(constraint.spotElevationIds)
                      const nextSpot =
                        terrain.spotElevations.find(({ id }) => !usedIds.has(id)) ??
                        terrain.spotElevations[0]
                      if (nextSpot) {
                        updateConstraint(constraint, 'spotElevationIds', [
                          ...constraint.spotElevationIds,
                          nextSpot.id,
                        ])
                      }
                    }}
                  >
                    Add point
                  </button>
                </div>
                <div className="constraint-point-list">
                  {constraint.spotElevationIds.map((spotElevationId, index) => (
                    <div className="constraint-point-row" key={`${index}-${spotElevationId}`}>
                      <span>{index + 1}</span>
                      <select
                        aria-label={`${constraint.name} point ${index + 1}`}
                        value={spotElevationId}
                        onChange={(event) =>
                          replaceConstraintSpot(
                            constraint,
                            index,
                            event.currentTarget.value,
                          )
                        }
                      >
                        {!terrain.spotElevations.some(
                          ({ id }) => id === spotElevationId,
                        ) && <option value={spotElevationId}>{spotLabel(spotElevationId)}</option>}
                        {terrain.spotElevations.map((spot) => (
                          <option key={spot.id} value={spot.id}>
                            {spotLabel(spot.id)}
                          </option>
                        ))}
                      </select>
                      <button
                        className="constraint-order-button"
                        type="button"
                        aria-label={`Move point ${index + 1} up`}
                        disabled={index === 0}
                        onClick={() => moveConstraintSpot(constraint, index, -1)}
                      >
                        ↑
                      </button>
                      <button
                        className="constraint-order-button"
                        type="button"
                        aria-label={`Move point ${index + 1} down`}
                        disabled={index === constraint.spotElevationIds.length - 1}
                        onClick={() => moveConstraintSpot(constraint, index, 1)}
                      >
                        ↓
                      </button>
                      <button
                        className="constraint-order-button remove"
                        type="button"
                        aria-label={`Remove point ${index + 1}`}
                        onClick={() =>
                          updateConstraint(
                            constraint,
                            'spotElevationIds',
                            constraint.spotElevationIds.filter(
                              (_, pointIndex) => pointIndex !== index,
                            ),
                          )
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  className="remove-spot-button"
                  type="button"
                  onClick={() => onRemoveConstraint(constraint.id)}
                >
                  Remove line
                </button>
              </details>
            ))}
          </div>
        )}
      </section>
      <RetainingWallEditor
        terrain={terrain}
        unit={unit}
        onAdd={onAddRetainingWall}
        onReplace={onReplaceRetainingWall}
        onRemove={onRemoveRetainingWall}
      />
      </div>
    </aside>
  )
}
