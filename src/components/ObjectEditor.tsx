import type {
  PrimitiveEntity,
  PrimitiveGeometry,
} from '../domain/primitive'
import { getPrimitiveSolarOptics } from '../domain/primitive'
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

interface SolarOpticsEditorProps {
  readonly primitive: PrimitiveEntity
  readonly onReplace: (primitive: PrimitiveEntity) => void
}

function SolarOpticsEditor({
  primitive,
  onReplace,
}: SolarOpticsEditorProps) {
  const solarOptics = getPrimitiveSolarOptics(primitive)
  const setMode = (mode: 'ignored' | 'opaque' | 'transmissive') => {
    onReplace({
      ...primitive,
      solarOptics: mode === 'transmissive'
        ? {
            mode,
            transmittance: solarOptics.mode === 'transmissive'
              ? solarOptics.transmittance
              : 0.5,
          }
        : { mode },
    })
  }

  return (
    <section className="solar-optics-editor" aria-label="Solar optics">
      <h3>Solar optics</h3>
      <label className="field" htmlFor={`${primitive.id}-solar-mode`}>
        <span>Occlusion mode</span>
        <select
          id={`${primitive.id}-solar-mode`}
          value={solarOptics.mode}
          onChange={(event) => setMode(
            event.currentTarget.value as typeof solarOptics.mode,
          )}
        >
          <option value="opaque">Opaque</option>
          <option value="transmissive">Transmissive</option>
          <option value="ignored">Ignored</option>
        </select>
      </label>
      {solarOptics.mode === 'transmissive' ? (
        <>
          <label className="field" htmlFor={`${primitive.id}-transmittance`}>
            <span>Transmittance</span>
            <span className="number-input">
              <input
                id={`${primitive.id}-transmittance`}
                type="number"
                min="0"
                max="100"
                step="5"
                value={Number((solarOptics.transmittance * 100).toFixed(3))}
                onChange={(event) => {
                  const percent = event.currentTarget.valueAsNumber
                  if (Number.isFinite(percent) && percent >= 0 && percent <= 100) {
                    onReplace({
                      ...primitive,
                      solarOptics: {
                        mode: 'transmissive',
                        transmittance: percent / 100,
                      },
                    })
                  }
                }}
              />
              <span>%</span>
            </span>
          </label>
          <p className="field-note">
            Non-transmitted: {Number(
              ((1 - solarOptics.transmittance) * 100).toFixed(3),
            )}%
          </p>
        </>
      ) : null}
      <p className="field-note">
        Solar behavior is independent of visual opacity.
      </p>
    </section>
  )
}

interface ObjectEditorProps {
  readonly primitives: readonly PrimitiveEntity[]
  readonly selectedEntityId: string | null
  readonly unit: DisplayUnit
  readonly canUndo: boolean
  readonly canRedo: boolean
  readonly onAddPrimitive: (kind: PrimitiveCreationKind) => void
  readonly onSelect: (entityId: string | null) => void
  readonly onReplace: (primitive: PrimitiveEntity) => void
  readonly onDuplicate: (primitive: PrimitiveEntity) => void
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
  selectedEntityId,
  unit,
  canUndo,
  canRedo,
  onAddPrimitive,
  onSelect,
  onReplace,
  onDuplicate,
  onRemove,
  onUndo,
  onRedo,
}: ObjectEditorProps) {
  const selected = primitives.find(({ id }) => id === selectedEntityId)
  const replacePosition = (
    primitive: PrimitiveEntity,
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
    primitive: PrimitiveEntity,
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
      <label className="object-selection" htmlFor="selected-object">
        <span>Selected</span>
        <select
          id="selected-object"
          value={selected?.id ?? ''}
          onChange={(event) => onSelect(event.currentTarget.value || null)}
        >
          <option value="">No object</option>
          {primitives.map((primitive) => (
            <option key={primitive.id} value={primitive.id}>
              {primitive.name}
            </option>
          ))}
        </select>
      </label>
      {selected ? (
        <section className="object-inspector" aria-label="Selected object properties">
          <label className="field" htmlFor={`${selected.id}-name`}>
            <span>Name</span>
            <input
              key={`${selected.id}:${selected.name}`}
              id={`${selected.id}-name`}
              className="object-name-input"
              type="text"
              defaultValue={selected.name}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.currentTarget.blur()
                }
              }}
              onBlur={(event) => {
                const name = event.currentTarget.value.trim()
                if (name && name !== selected.name) {
                  onReplace({ ...selected, name })
                } else {
                  event.currentTarget.value = selected.name
                }
              }}
            />
          </label>
          <code>{selected.id}</code>
              <LengthInput
                id={`${selected.id}-east`}
                label="Center east"
                meters={selected.transform.position.eastMeters}
                unit={unit}
                onChange={(value) => replacePosition(selected, 'eastMeters', value)}
              />
              <LengthInput
                id={`${selected.id}-elevation`}
                label="Center elevation"
                meters={selected.transform.position.elevationMeters}
                unit={unit}
                onChange={(value) => replacePosition(selected, 'elevationMeters', value)}
              />
              <LengthInput
                id={`${selected.id}-north`}
                label="Center north"
                meters={selected.transform.position.northMeters}
                unit={unit}
                onChange={(value) => replacePosition(selected, 'northMeters', value)}
              />
              <AngleInput
                id={`${selected.id}-rotation-x`}
                label="Rotate X"
                radians={selected.transform.rotation.xRadians}
                onChange={(value) => replaceRotation(selected, 'xRadians', value)}
              />
              <AngleInput
                id={`${selected.id}-rotation-y`}
                label="Rotate Y"
                radians={selected.transform.rotation.yRadians}
                onChange={(value) => replaceRotation(selected, 'yRadians', value)}
              />
              <AngleInput
                id={`${selected.id}-rotation-z`}
                label="Rotate Z"
                radians={selected.transform.rotation.zRadians}
                onChange={(value) => replaceRotation(selected, 'zRadians', value)}
              />
              <GeometryEditor
                primitive={selected}
                unit={unit}
                onReplace={onReplace}
              />
              <SolarOpticsEditor
                primitive={selected}
                onReplace={onReplace}
              />
          <div className="object-actions">
            <button type="button" onClick={() => onDuplicate(selected)}>
              Duplicate
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => onRemove(selected.id)}
            >
              Delete
            </button>
          </div>
        </section>
      ) : (
        <p className="object-empty-state">
          Click an object in the scene or choose one above to inspect it.
        </p>
      )}
    </aside>
  )
}
