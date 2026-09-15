import type {
  PrimitiveEntity,
  PrimitiveGeometry,
} from '../domain/primitive'
import type { DisplayUnit } from '../domain/units'
import { LengthInput } from './LengthInput'

export type PrimitiveCreationKind = PrimitiveGeometry['kind'] | 'fence'

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

interface GeometryEditorProps {
  readonly primitive: PrimitiveEntity
  readonly unit: DisplayUnit
  readonly onReplace: (primitive: PrimitiveEntity) => void
}

function GeometryEditor({
  primitive,
  unit,
  onReplace,
}: GeometryEditorProps) {
  const replaceGeometry = (geometry: PrimitiveGeometry) => {
    onReplace({ ...primitive, geometry })
  }
  const lengthField = (
    key: string,
    label: string,
    meters: number,
    onChange: (value: number) => void,
  ) => (
    <LengthInput
      key={key}
      id={`${primitive.id}-${key}`}
      label={label}
      meters={meters}
      unit={unit}
      minMeters={0.01}
      onChange={onChange}
    />
  )

  switch (primitive.geometry.kind) {
    case 'box': {
      const geometry = primitive.geometry
      return <>
        {lengthField('width', 'Width', geometry.widthMeters, (value) =>
          replaceGeometry({ ...geometry, widthMeters: value }))}
        {lengthField('height', 'Height', geometry.heightMeters, (value) =>
          replaceGeometry({ ...geometry, heightMeters: value }))}
        {lengthField('depth', 'Depth', geometry.depthMeters, (value) =>
          replaceGeometry({ ...geometry, depthMeters: value }))}
      </>
    }

    case 'cylinder': {
      const geometry = primitive.geometry
      return <>
        {lengthField('radius', 'Radius', geometry.radiusMeters, (value) =>
          replaceGeometry({ ...geometry, radiusMeters: value }))}
        {lengthField('height', 'Height', geometry.heightMeters, (value) =>
          replaceGeometry({ ...geometry, heightMeters: value }))}
      </>
    }

    case 'wall': {
      const geometry = primitive.geometry
      return <>
        <label className="field" htmlFor={`${primitive.id}-structure`}>
          <span>Structure</span>
          <select
            id={`${primitive.id}-structure`}
            value={geometry.structure}
            onChange={(event) => replaceGeometry({
              ...geometry,
              structure: event.currentTarget.value as typeof geometry.structure,
            })}
          >
            <option value="wall">Wall</option>
            <option value="fence">Fence</option>
          </select>
        </label>
        {lengthField('length', 'Length', geometry.lengthMeters, (value) =>
          replaceGeometry({ ...geometry, lengthMeters: value }))}
        {lengthField('height', 'Height', geometry.heightMeters, (value) =>
          replaceGeometry({ ...geometry, heightMeters: value }))}
        {lengthField('thickness', 'Thickness', geometry.thicknessMeters, (value) =>
          replaceGeometry({ ...geometry, thicknessMeters: value }))}
      </>
    }

    case 'polygonExtrusion': {
      const geometry = primitive.geometry
      return <>
        {lengthField('height', 'Height', geometry.heightMeters, (value) =>
          replaceGeometry({ ...geometry, heightMeters: value }))}
        <p className="field-note">
          {geometry.footprint.length}-vertex local footprint
        </p>
      </>
    }

    case 'canopy': {
      const geometry = primitive.geometry
      return <>
        {lengthField('east-radius', 'East radius', geometry.eastRadiusMeters, (value) =>
          replaceGeometry({ ...geometry, eastRadiusMeters: value }))}
        {lengthField('vertical-radius', 'Vertical radius', geometry.verticalRadiusMeters, (value) =>
          replaceGeometry({ ...geometry, verticalRadiusMeters: value }))}
        {lengthField('north-radius', 'North radius', geometry.northRadiusMeters, (value) =>
          replaceGeometry({ ...geometry, northRadiusMeters: value }))}
      </>
    }
  }
}

interface ObjectEditorProps {
  readonly primitives: readonly PrimitiveEntity[]
  readonly unit: DisplayUnit
  readonly canUndo: boolean
  readonly canRedo: boolean
  readonly onAddPrimitive: (kind: PrimitiveCreationKind) => void
  readonly onReplace: (primitive: PrimitiveEntity) => void
  readonly onRemove: (entityId: string) => void
  readonly onUndo: () => void
  readonly onRedo: () => void
}

const creationOptions: readonly {
  kind: PrimitiveCreationKind
  label: string
}[] = [
  { kind: 'box', label: 'Box' },
  { kind: 'cylinder', label: 'Cylinder' },
  { kind: 'wall', label: 'Wall' },
  { kind: 'fence', label: 'Fence' },
  { kind: 'polygonExtrusion', label: 'Extrusion' },
  { kind: 'canopy', label: 'Canopy' },
]

export function ObjectEditor({
  primitives,
  unit,
  canUndo,
  canRedo,
  onAddPrimitive,
  onReplace,
  onRemove,
  onUndo,
  onRedo,
}: ObjectEditorProps) {
  return (
    <aside className="object-panel" aria-label="Object editor">
      <div className="object-toolbar">
        <strong>Objects</strong>
        <button type="button" disabled={!canUndo} onClick={onUndo}>Undo</button>
        <button type="button" disabled={!canRedo} onClick={onRedo}>Redo</button>
      </div>
      <div className="object-create-toolbar" aria-label="Create primitive">
        {creationOptions.map(({ kind, label }) => (
          <button
            key={kind}
            type="button"
            onClick={() => onAddPrimitive(kind)}
          >
            + {label}
          </button>
        ))}
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
              <GeometryEditor
                primitive={primitive}
                unit={unit}
                onReplace={onReplace}
              />
              <button
                type="button"
                className="remove-spot-button"
                onClick={() => onRemove(primitive.id)}
              >
                Remove {primitive.geometry.kind === 'polygonExtrusion'
                  ? 'extrusion'
                  : primitive.geometry.kind}
              </button>
            </details>
          )
        })}
      </div>
    </aside>
  )
}
