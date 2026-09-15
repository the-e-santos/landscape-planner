import {
  getTerrainRetainingWalls,
  type RetainingWallProfilePoint,
  type TerrainEntity,
  type TerrainRetainingWall,
  type RetainingWallUpperSide,
} from '../domain/terrain'
import type { DisplayUnit } from '../domain/units'
import { LengthInput } from './LengthInput'

interface RetainingWallEditorProps {
  readonly terrain: TerrainEntity
  readonly unit: DisplayUnit
  readonly onAdd: () => void
  readonly onReplace: (retainingWall: TerrainRetainingWall) => void
  readonly onRemove: (retainingWallId: string) => void
}

function nextProfilePointId(
  wall: TerrainRetainingWall,
  profile: 'upper' | 'lower',
): string {
  const usedIds = new Set([
    ...wall.upperProfile.map(({ id }) => id),
    ...wall.lowerProfile.map(({ id }) => id),
  ])
  let sequence = wall.upperProfile.length + 1
  let id = `${wall.id}.${profile}.${sequence}`
  while (usedIds.has(id)) {
    sequence += 1
    id = `${wall.id}.${profile}.${sequence}`
  }
  return id
}

export function RetainingWallEditor({
  terrain,
  unit,
  onAdd,
  onReplace,
  onRemove,
}: RetainingWallEditorProps) {
  const walls = getTerrainRetainingWalls(terrain)

  const updateWall = <Field extends keyof TerrainRetainingWall>(
    wall: TerrainRetainingWall,
    field: Field,
    value: TerrainRetainingWall[Field],
  ) => onReplace({ ...wall, [field]: value })

  const updateStation = (
    wall: TerrainRetainingWall,
    index: number,
    field: 'eastMeters' | 'northMeters' | 'upperElevation' | 'lowerElevation',
    value: number,
  ) => {
    const upperProfile = wall.upperProfile.map((point, pointIndex) =>
      pointIndex === index
        ? {
            ...point,
            ...(field === 'upperElevation'
              ? { elevationMeters: value }
              : field === 'eastMeters' || field === 'northMeters'
                ? { [field]: value }
                : {}),
          }
        : point,
    )
    const lowerProfile = wall.lowerProfile.map((point, pointIndex) =>
      pointIndex === index
        ? {
            ...point,
            ...(field === 'lowerElevation'
              ? { elevationMeters: value }
              : field === 'eastMeters' || field === 'northMeters'
                ? { [field]: value }
                : {}),
          }
        : point,
    )
    onReplace({ ...wall, upperProfile, lowerProfile })
  }

  const addStation = (wall: TerrainRetainingWall) => {
    const upperLast = wall.upperProfile.at(-1)!
    const upperPrevious = wall.upperProfile.at(-2)
    const lowerLast = wall.lowerProfile.at(-1)!
    const eastStep = upperPrevious
      ? upperLast.eastMeters - upperPrevious.eastMeters
      : 1
    const northStep = upperPrevious
      ? upperLast.northMeters - upperPrevious.northMeters
      : 0
    const createPoint = (
      profile: 'upper' | 'lower',
      previousPoint: RetainingWallProfilePoint,
    ): RetainingWallProfilePoint => ({
      id: nextProfilePointId(wall, profile),
      eastMeters: previousPoint.eastMeters + eastStep,
      northMeters: previousPoint.northMeters + northStep,
      elevationMeters: previousPoint.elevationMeters,
    })

    onReplace({
      ...wall,
      upperProfile: [...wall.upperProfile, createPoint('upper', upperLast)],
      lowerProfile: [...wall.lowerProfile, createPoint('lower', lowerLast)],
    })
  }

  const removeStation = (wall: TerrainRetainingWall, index: number) =>
    onReplace({
      ...wall,
      upperProfile: wall.upperProfile.filter(
        (_, pointIndex) => pointIndex !== index,
      ),
      lowerProfile: wall.lowerProfile.filter(
        (_, pointIndex) => pointIndex !== index,
      ),
    })

  return (
    <section className="terrain-retaining-wall-section">
      <div className="section-heading">
        <div>
          <h2>Retaining walls</h2>
          <p className="field-note">Paired profiles define explicit wall faces.</p>
        </div>
        <button className="primary-small-button" type="button" onClick={onAdd}>
          Add wall
        </button>
      </div>

      {walls.length === 0 ? (
        <p className="terrain-empty-state">
          Add a wall to define corresponding upper and lower elevations.
        </p>
      ) : (
        <div className="terrain-retaining-wall-list">
          {walls.map((wall, wallIndex) => (
            <details className="terrain-retaining-wall-card" key={wall.id}>
              <summary>
                <span>{wall.name || `Retaining wall ${wallIndex + 1}`}</span>
                <span>{wall.upperProfile.length} stations</span>
              </summary>
              <code title={wall.id}>{wall.id}</code>
              <label className="field" htmlFor={`terrain-${wall.id}-name`}>
                <span>Name</span>
                <input
                  className="terrain-text-input"
                  id={`terrain-${wall.id}-name`}
                  value={wall.name}
                  onChange={(event) =>
                    updateWall(wall, 'name', event.currentTarget.value)
                  }
                />
              </label>
              <label className="field" htmlFor={`terrain-${wall.id}-upper-side`}>
                <span>Higher side</span>
                <select
                  id={`terrain-${wall.id}-upper-side`}
                  value={wall.upperSide}
                  onChange={(event) =>
                    updateWall(
                      wall,
                      'upperSide',
                      event.currentTarget.value as RetainingWallUpperSide,
                    )
                  }
                >
                  <option value="left">Left of station order</option>
                  <option value="right">Right of station order</option>
                </select>
              </label>
              <LengthInput
                id={`terrain-${wall.id}-horizontal-uncertainty`}
                label="± horizontal"
                meters={wall.uncertainty.horizontalMeters}
                unit={unit}
                minMeters={0}
                onChange={(horizontalMeters) =>
                  updateWall(wall, 'uncertainty', {
                    ...wall.uncertainty,
                    horizontalMeters,
                  })
                }
              />
              <LengthInput
                id={`terrain-${wall.id}-vertical-uncertainty`}
                label="± vertical"
                meters={wall.uncertainty.verticalMeters}
                unit={unit}
                minMeters={0}
                onChange={(verticalMeters) =>
                  updateWall(wall, 'uncertainty', {
                    ...wall.uncertainty,
                    verticalMeters,
                  })
                }
              />

              <div className="wall-station-heading">
                <strong>Ordered stations</strong>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => addStation(wall)}
                >
                  Add station
                </button>
              </div>
              <div className="wall-station-list">
                {wall.upperProfile.map((upper, index) => {
                  const lower = wall.lowerProfile[index]
                  if (!lower) {
                    return null
                  }

                  return (
                    <div className="wall-station-card" key={upper.id}>
                      <div className="wall-station-title">
                        <strong>Station {index + 1}</strong>
                        <button
                          className="icon-button"
                          type="button"
                          aria-label={`Remove retaining wall station ${index + 1}`}
                          disabled={wall.upperProfile.length <= 2}
                          onClick={() => removeStation(wall, index)}
                        >
                          ×
                        </button>
                      </div>
                      <LengthInput
                        id={`terrain-${wall.id}-station-${index}-east`}
                        label="East"
                        meters={upper.eastMeters}
                        unit={unit}
                        onChange={(value) =>
                          updateStation(wall, index, 'eastMeters', value)
                        }
                      />
                      <LengthInput
                        id={`terrain-${wall.id}-station-${index}-north`}
                        label="North"
                        meters={upper.northMeters}
                        unit={unit}
                        onChange={(value) =>
                          updateStation(wall, index, 'northMeters', value)
                        }
                      />
                      <LengthInput
                        id={`terrain-${wall.id}-station-${index}-upper`}
                        label="Upper"
                        meters={upper.elevationMeters}
                        unit={unit}
                        onChange={(value) =>
                          updateStation(wall, index, 'upperElevation', value)
                        }
                      />
                      <LengthInput
                        id={`terrain-${wall.id}-station-${index}-lower`}
                        label="Lower"
                        meters={lower.elevationMeters}
                        unit={unit}
                        onChange={(value) =>
                          updateStation(wall, index, 'lowerElevation', value)
                        }
                      />
                    </div>
                  )
                })}
              </div>
              <button
                className="remove-spot-button"
                type="button"
                onClick={() => onRemove(wall.id)}
              >
                Remove wall
              </button>
            </details>
          ))}
        </div>
      )}
    </section>
  )
}
