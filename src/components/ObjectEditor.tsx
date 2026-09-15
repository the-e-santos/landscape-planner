import { useState } from 'react'
import type {
  PrimitiveEntity,
  PrimitiveGeometry,
} from '../domain/primitive'
import {
  getPrimitiveSolarOptics,
  insertPolygonExtrusionMidpoint,
  validatePrimitiveEntity,
} from '../domain/primitive'
import type { DisplayUnit } from '../domain/units'
import type {
  PrimitiveManipulationMode,
  PrimitiveSnapSettings,
} from '../scene/createYardScene'
import { LengthInput } from './LengthInput'
import { useDraggablePanel } from './useDraggablePanel'

export type PrimitiveCreationKind = PrimitiveGeometry['kind'] | 'fence'

interface AngleInputProps {
  readonly id: string
  readonly label: string
  readonly radians: number
  readonly minRadians?: number
  readonly onChange: (radians: number) => void
}

function AngleInput({
  id,
  label,
  radians,
  minRadians,
  onChange,
}: AngleInputProps) {
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <span className="number-input">
        <input
          id={id}
          type="number"
          min={minRadians === undefined
            ? undefined
            : minRadians * 180 / Math.PI}
          step="5"
          value={Number((radians * 180 / Math.PI).toFixed(3))}
          onChange={(event) => {
            const degrees = event.currentTarget.valueAsNumber
            const nextRadians = degrees * Math.PI / 180
            if (
              Number.isFinite(degrees) &&
              (minRadians === undefined || nextRadians >= minRadians)
            ) {
              onChange(nextRadians)
            }
          }}
        />
        <span>deg</span>
      </span>
    </label>
  )
}

interface SnapSettingsEditorProps {
  readonly settings: PrimitiveSnapSettings
  readonly overrideActive: boolean
  readonly unit: DisplayUnit
  readonly onChange: (settings: PrimitiveSnapSettings) => void
}

function SnapSettingsEditor({
  settings,
  overrideActive,
  unit,
  onChange,
}: SnapSettingsEditorProps) {
  const effectiveEnabled = settings.enabled !== overrideActive

  return (
    <section className="snap-settings" aria-label="Snapping settings">
      <label className="snap-toggle">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(event) => onChange({
            ...settings,
            enabled: event.currentTarget.checked,
          })}
        />
        <span>Enable snapping</span>
        <strong className={effectiveEnabled ? 'active' : undefined}>
          {effectiveEnabled ? 'Active' : 'Free'}
        </strong>
      </label>
      <LengthInput
        id="translation-snap"
        label="Move increment"
        meters={settings.translationMeters}
        unit={unit}
        minMeters={0.01}
        onChange={(translationMeters) => onChange({
          ...settings,
          translationMeters,
        })}
      />
      <AngleInput
        id="rotation-snap"
        label="Rotate increment"
        radians={settings.rotationRadians}
        minRadians={Math.PI / 180}
        onChange={(rotationRadians) => onChange({
          ...settings,
          rotationRadians,
        })}
      />
      <LengthInput
        id="resize-snap"
        label="Resize increment"
        meters={settings.resizeMeters}
        unit={unit}
        minMeters={0.01}
        onChange={(resizeMeters) => onChange({
          ...settings,
          resizeMeters,
        })}
      />
      <p className="field-note">
        Hold Shift to temporarily {settings.enabled ? 'disable' : 'enable'}
        {' '}snapping. W/E/R selects Move/Rotate/Resize.
      </p>
    </section>
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
  const [validationMessage, setValidationMessage] = useState<string | null>(null)
  const replaceGeometry = (geometry: PrimitiveGeometry) => {
    const replacement = { ...primitive, geometry }
    try {
      validatePrimitiveEntity(replacement)
      setValidationMessage(null)
      onReplace(replacement)
    } catch (error) {
      setValidationMessage(
        error instanceof Error ? error.message : 'Primitive geometry is invalid',
      )
    }
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
      const replaceFootprint = (
        footprint: typeof geometry.footprint,
      ) => replaceGeometry({ ...geometry, footprint })
      return <>
        {lengthField('height', 'Height', geometry.heightMeters, (value) =>
          replaceGeometry({ ...geometry, heightMeters: value }))}
        <section className="polygon-footprint-editor" aria-label="Extrusion footprint">
          <div className="vertex-heading">
            <strong>Local footprint</strong>
            <span>{geometry.footprint.length} vertices</span>
          </div>
          <p className="field-note">
            Vertices connect counterclockwise. North maps to local −Z.
          </p>
          {validationMessage ? (
            <p className="primitive-validation" role="alert">
              {validationMessage}
            </p>
          ) : null}
          <div className="vertex-list">
            {geometry.footprint.map((point, index) => (
              <div className="vertex-card" key={index}>
                <div className="vertex-heading">
                  <strong>Vertex {index + 1}</strong>
                  <button
                    className="icon-button"
                    type="button"
                    title={`Remove vertex ${index + 1}`}
                    aria-label={`Remove vertex ${index + 1}`}
                    disabled={geometry.footprint.length <= 3}
                    onClick={() => replaceFootprint(
                      geometry.footprint.filter(
                        (_, pointIndex) => pointIndex !== index,
                      ),
                    )}
                  >
                    ×
                  </button>
                </div>
                <LengthInput
                  id={`${primitive.id}-footprint-${index}-east`}
                  label="East"
                  meters={point.eastMeters}
                  unit={unit}
                  onChange={(eastMeters) => replaceFootprint(
                    geometry.footprint.map((candidate, pointIndex) =>
                      pointIndex === index
                        ? { ...candidate, eastMeters }
                        : candidate,
                    ),
                  )}
                />
                <LengthInput
                  id={`${primitive.id}-footprint-${index}-north`}
                  label="North"
                  meters={point.northMeters}
                  unit={unit}
                  onChange={(northMeters) => replaceFootprint(
                    geometry.footprint.map((candidate, pointIndex) =>
                      pointIndex === index
                        ? { ...candidate, northMeters }
                        : candidate,
                    ),
                  )}
                />
                <button
                  className="add-point-button"
                  type="button"
                  onClick={() => replaceFootprint(
                    insertPolygonExtrusionMidpoint(geometry.footprint, index),
                  )}
                >
                  Add midpoint after
                </button>
              </div>
            ))}
          </div>
        </section>
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
  readonly manipulationMode: PrimitiveManipulationMode
  readonly snapSettings: PrimitiveSnapSettings
  readonly snapOverrideActive: boolean
  readonly resizeProportionsLocked: boolean
  readonly onAddPrimitive: (kind: PrimitiveCreationKind) => void
  readonly onSelect: (entityId: string | null) => void
  readonly onManipulationModeChange: (
    mode: PrimitiveManipulationMode,
  ) => void
  readonly onSnapSettingsChange: (settings: PrimitiveSnapSettings) => void
  readonly onResizeProportionsLockedChange: (locked: boolean) => void
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
  manipulationMode,
  snapSettings,
  snapOverrideActive,
  resizeProportionsLocked,
  onAddPrimitive,
  onSelect,
  onManipulationModeChange,
  onSnapSettingsChange,
  onResizeProportionsLockedChange,
  onReplace,
  onDuplicate,
  onRemove,
  onUndo,
  onRedo,
}: ObjectEditorProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const { panelRef, dragHandleProps } = useDraggablePanel<HTMLElement>()
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
    <aside
      ref={panelRef}
      className={`object-panel${isCollapsed ? ' panel-collapsed' : ''}`}
      aria-label="Object editor"
    >
      <header
        className="object-toolbar panel-header panel-drag-handle"
        title="Drag to move objects panel"
        {...dragHandleProps}
      >
        <strong>Objects</strong>
        <div className="panel-header-actions">
          {!isCollapsed && (
            <>
              <button type="button" disabled={!canUndo} onClick={onUndo}>Undo</button>
              <button type="button" disabled={!canRedo} onClick={onRedo}>Redo</button>
            </>
          )}
          <button
            className="panel-collapse-button"
            type="button"
            aria-expanded={!isCollapsed}
            aria-controls="object-editor-content"
            onClick={() => setIsCollapsed((collapsed) => !collapsed)}
          >
            {isCollapsed ? 'Expand' : 'Collapse'}
          </button>
        </div>
      </header>
      <div id="object-editor-content" hidden={isCollapsed}>
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
      <div className="manipulation-toolbar" aria-label="Manipulation mode">
        {([
          ['translate', 'Move'],
          ['rotate', 'Rotate'],
          ['resize', 'Resize'],
        ] as const).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            disabled={!selected}
            aria-pressed={manipulationMode === mode}
            onClick={() => onManipulationModeChange(mode)}
          >
            {label}
          </button>
        ))}
      </div>
      <label className="proportion-lock">
        <input
          type="checkbox"
          checked={resizeProportionsLocked}
          disabled={!selected || manipulationMode !== 'resize'}
          onChange={(event) => onResizeProportionsLockedChange(
            event.currentTarget.checked,
          )}
        />
        <span>Lock resize proportions</span>
      </label>
      <SnapSettingsEditor
        settings={snapSettings}
        overrideActive={snapOverrideActive}
        unit={unit}
        onChange={onSnapSettingsChange}
      />
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
      </div>
    </aside>
  )
}
