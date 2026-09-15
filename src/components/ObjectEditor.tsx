import type { PrimitiveEntity } from '../domain/primitive'
import type { DisplayUnit } from '../domain/units'
import { LengthInput } from './LengthInput'

interface AngleInputProps {
  readonly id: string
  readonly label: string
  readonly radians: number
  readonly onChange: (radians: number) => void
}

function AngleInput({ id, label, radians, onChange }: AngleInputProps) {
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <span className="number-input">
        <input
          id={id}
          type="number"
          step="5"
          value={Number((radians * 180 / Math.PI).toFixed(3))}
          onChange={(event) => {
            const degrees = event.currentTarget.valueAsNumber
            if (Number.isFinite(degrees)) {
              onChange(degrees * Math.PI / 180)
            }
          }}
        />
        <span>deg</span>
      </span>
    </label>
  )
}

interface ObjectEditorProps {
  readonly primitives: readonly PrimitiveEntity[]
  readonly unit: DisplayUnit
  readonly canUndo: boolean
  readonly canRedo: boolean
  readonly onAddBox: () => void
  readonly onReplace: (primitive: PrimitiveEntity) => void
  readonly onRemove: (entityId: string) => void
  readonly onUndo: () => void
  readonly onRedo: () => void
}

export function ObjectEditor({
  primitives,
  unit,
  canUndo,
  canRedo,
  onAddBox,
  onReplace,
  onRemove,
  onUndo,
  onRedo,
}: ObjectEditorProps) {
  return (
    <aside className="object-panel" aria-label="Object editor">
      <div className="object-toolbar">
        <strong>Objects</strong>
        <button type="button" onClick={onAddBox}>Add box</button>
        <button type="button" disabled={!canUndo} onClick={onUndo}>Undo</button>
        <button type="button" disabled={!canRedo} onClick={onRedo}>Redo</button>
      </div>
      <div className="object-list">
        {primitives.map((primitive) => {
          const replacePosition = (
            key: keyof PrimitiveEntity['transform']['position'],
            value: number,
          ) => onReplace({
            ...primitive,
            transform: {
              ...primitive.transform,
              position: { ...primitive.transform.position, [key]: value },
            },
          })
          const replaceRotation = (
            key: keyof PrimitiveEntity['transform']['rotation'],
            value: number,
          ) => onReplace({
            ...primitive,
            transform: {
              ...primitive.transform,
              rotation: { ...primitive.transform.rotation, [key]: value },
            },
          })

          return (
            <details className="object-card" key={primitive.id}>
              <summary>{primitive.name}</summary>
              <code>{primitive.id}</code>
              <LengthInput
                id={`${primitive.id}-east`}
                label="Center east"
                meters={primitive.transform.position.eastMeters}
                unit={unit}
                onChange={(value) => replacePosition('eastMeters', value)}
              />
              <LengthInput
                id={`${primitive.id}-elevation`}
                label="Center elevation"
                meters={primitive.transform.position.elevationMeters}
                unit={unit}
                onChange={(value) => replacePosition('elevationMeters', value)}
              />
              <LengthInput
                id={`${primitive.id}-north`}
                label="Center north"
                meters={primitive.transform.position.northMeters}
                unit={unit}
                onChange={(value) => replacePosition('northMeters', value)}
              />
              <AngleInput
                id={`${primitive.id}-rotation-x`}
                label="Rotate X"
                radians={primitive.transform.rotation.xRadians}
                onChange={(value) => replaceRotation('xRadians', value)}
              />
              <AngleInput
                id={`${primitive.id}-rotation-y`}
                label="Rotate Y"
                radians={primitive.transform.rotation.yRadians}
                onChange={(value) => replaceRotation('yRadians', value)}
              />
              <AngleInput
                id={`${primitive.id}-rotation-z`}
                label="Rotate Z"
                radians={primitive.transform.rotation.zRadians}
                onChange={(value) => replaceRotation('zRadians', value)}
              />
              {(['widthMeters', 'heightMeters', 'depthMeters'] as const).map(
                (key) => (
                  <LengthInput
                    key={key}
                    id={`${primitive.id}-${key}`}
                    label={key.replace('Meters', '').replace(/^./, (value) => value.toUpperCase())}
                    meters={primitive.geometry[key]}
                    unit={unit}
                    minMeters={0.01}
                    onChange={(value) => onReplace({
                      ...primitive,
                      geometry: { ...primitive.geometry, [key]: value },
                    })}
                  />
                ),
              )}
              <button
                type="button"
                className="remove-spot-button"
                onClick={() => onRemove(primitive.id)}
              >
                Remove box
              </button>
            </details>
          )
        })}
      </div>
    </aside>
  )
}
