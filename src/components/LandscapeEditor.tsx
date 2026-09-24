import { useState } from 'react'
import type {
  IrrigationZoneEntity,
  LandscapeSemanticEntity,
  PlantEntity,
  PlantingBedEntity,
  SoilDrainage,
  SoilTexture,
  SurfaceCover,
} from '../domain/landscape'
import type { ParcelPoint } from '../domain/parcel'
import type { DisplayUnit } from '../domain/units'
import { LengthInput } from './LengthInput'
import { useDraggablePanel } from './useDraggablePanel'
import { InteractionCatalogEditor } from './InteractionCatalogEditor'
import type {
  PlantInteractionFinding,
  PlantInteractionGroup,
  PlantInteractionRule,
} from '../domain/plantInteractions'

export type LandscapeCreationKind = 'plantingBed' | 'irrigationZone' | 'plant'

interface LandscapeEditorProps {
  readonly plantingBeds: readonly PlantingBedEntity[]
  readonly irrigationZones: readonly IrrigationZoneEntity[]
  readonly plants: readonly PlantEntity[]
  readonly interactionGroups: readonly PlantInteractionGroup[]
  readonly interactionRules: readonly PlantInteractionRule[]
  readonly interactionFindings: readonly PlantInteractionFinding[]
  readonly selectedEntityId: string | null
  readonly unit: DisplayUnit
  readonly canUndo: boolean
  readonly canRedo: boolean
  readonly onAdd: (kind: LandscapeCreationKind) => void
  readonly onSelect: (entityId: string | null) => void
  readonly onReplace: (entity: LandscapeSemanticEntity) => void
  readonly onRemove: (entityId: string) => void
  readonly onAddGroup: () => void
  readonly onReplaceGroup: (group: PlantInteractionGroup) => void
  readonly onRemoveGroup: (groupId: string) => void
  readonly onAddRule: () => string | undefined
  readonly onReplaceRule: (rule: PlantInteractionRule) => void
  readonly onRemoveRule: (ruleId: string) => void
  readonly onUndo: () => void
  readonly onRedo: () => void
  readonly onClose: () => void
}

const surfaceCovers: readonly { value: SurfaceCover; label: string }[] = [
  { value: 'bareSoil', label: 'Bare soil' },
  { value: 'mulch', label: 'Mulch' },
  { value: 'turf', label: 'Turf' },
  { value: 'groundcover', label: 'Groundcover' },
  { value: 'gravel', label: 'Gravel' },
  { value: 'concrete', label: 'Concrete' },
  { value: 'pavers', label: 'Pavers' },
  { value: 'other', label: 'Other' },
]

function insertMidpoint(
  footprint: readonly ParcelPoint[],
  afterIndex: number,
): readonly ParcelPoint[] {
  const nextIndex = (afterIndex + 1) % footprint.length
  const start = footprint[afterIndex]
  const end = footprint[nextIndex]
  return [
    ...footprint.slice(0, afterIndex + 1),
    {
      eastMeters: (start.eastMeters + end.eastMeters) / 2,
      northMeters: (start.northMeters + end.northMeters) / 2,
    },
    ...footprint.slice(afterIndex + 1),
  ]
}

interface TextFieldProps {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly optional?: boolean
  readonly onCommit: (value: string | undefined) => void
}

function TextField({ id, label, value, optional, onCommit }: TextFieldProps) {
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <input
        key={`${id}:${value}`}
        id={id}
        className="landscape-text-input"
        type="text"
        defaultValue={value}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
        onBlur={(event) => {
          const nextValue = event.currentTarget.value.trim()
          if (nextValue || optional) {
            onCommit(nextValue || undefined)
          } else {
            event.currentTarget.value = value
          }
        }}
      />
    </label>
  )
}

interface FootprintEditorProps {
  readonly id: string
  readonly footprint: readonly ParcelPoint[]
  readonly unit: DisplayUnit
  readonly onChange: (footprint: readonly ParcelPoint[]) => void
}

function FootprintEditor({
  id,
  footprint,
  unit,
  onChange,
}: FootprintEditorProps) {
  return (
    <section className="landscape-footprint" aria-label="Footprint vertices">
      <div className="vertex-heading">
        <strong>Footprint</strong>
        <span>{footprint.length} vertices</span>
      </div>
      <div className="vertex-list">
        {footprint.map((point, index) => (
          <div className="vertex-card" key={index}>
            <div className="vertex-heading">
              <strong>Vertex {index + 1}</strong>
              <button
                className="icon-button"
                type="button"
                aria-label={`Remove vertex ${index + 1}`}
                disabled={footprint.length <= 3}
                onClick={() => onChange(
                  footprint.filter((_, candidateIndex) => candidateIndex !== index),
                )}
              >
                ×
              </button>
            </div>
            <LengthInput
              id={`${id}-vertex-${index}-east`}
              label="East"
              meters={point.eastMeters}
              unit={unit}
              onChange={(eastMeters) => onChange(
                footprint.map((candidate, candidateIndex) =>
                  candidateIndex === index
                    ? { ...candidate, eastMeters }
                    : candidate,
                ),
              )}
            />
            <LengthInput
              id={`${id}-vertex-${index}-north`}
              label="North"
              meters={point.northMeters}
              unit={unit}
              onChange={(northMeters) => onChange(
                footprint.map((candidate, candidateIndex) =>
                  candidateIndex === index
                    ? { ...candidate, northMeters }
                    : candidate,
                ),
              )}
            />
            <button
              className="add-point-button"
              type="button"
              onClick={() => onChange(insertMidpoint(footprint, index))}
            >
              Add midpoint after
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}

interface BedEditorProps {
  readonly bed: PlantingBedEntity
  readonly unit: DisplayUnit
  readonly replace: (entity: PlantingBedEntity) => void
}

function BedEditor({ bed, unit, replace }: BedEditorProps) {
  const setSoil = (soil: PlantingBedEntity['soil']) => replace({ ...bed, soil })
  return (
    <>
      <label className="field" htmlFor={`${bed.id}-surface-cover`}>
        <span>Surface cover</span>
        <select
          id={`${bed.id}-surface-cover`}
          value={bed.soil.surfaceCover}
          onChange={(event) => setSoil({
            ...bed.soil,
            surfaceCover: event.currentTarget.value as SurfaceCover,
          })}
        >
          {surfaceCovers.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>
      <label className="field" htmlFor={`${bed.id}-soil-texture`}>
        <span>Soil texture</span>
        <select
          id={`${bed.id}-soil-texture`}
          value={bed.soil.texture}
          onChange={(event) => {
            const texture = event.currentTarget.value as SoilTexture
            setSoil({
              ...bed.soil,
              texture,
              ...(texture === 'custom' && !bed.soil.customTextureLabel
                ? { customTextureLabel: 'Custom soil' }
                : {}),
            })
          }}
        >
          <option value="unknown">Unknown</option>
          <option value="sand">Sand</option>
          <option value="loam">Loam</option>
          <option value="silt">Silt</option>
          <option value="clay">Clay</option>
          <option value="custom">Custom</option>
        </select>
      </label>
      {bed.soil.texture === 'custom' ? (
        <TextField
          id={`${bed.id}-custom-texture`}
          label="Custom texture"
          value={bed.soil.customTextureLabel ?? ''}
          onCommit={(customTextureLabel) => {
            if (customTextureLabel) setSoil({ ...bed.soil, customTextureLabel })
          }}
        />
      ) : null}
      <label className="field" htmlFor={`${bed.id}-drainage`}>
        <span>Drainage</span>
        <select
          id={`${bed.id}-drainage`}
          value={bed.soil.drainage}
          onChange={(event) => setSoil({
            ...bed.soil,
            drainage: event.currentTarget.value as SoilDrainage,
          })}
        >
          <option value="unknown">Unknown</option>
          <option value="rapid">Rapid</option>
          <option value="wellDrained">Well drained</option>
          <option value="moderate">Moderate</option>
          <option value="poor">Poor</option>
        </select>
      </label>
      <LengthInput
        id={`${bed.id}-root-depth`}
        label="Usable root depth"
        meters={bed.soil.usableRootDepthMeters}
        unit={unit}
        minMeters={0.01}
        onChange={(usableRootDepthMeters) => setSoil({
          ...bed.soil,
          usableRootDepthMeters,
        })}
      />
      <label className="field" htmlFor={`${bed.id}-ph`}>
        <span>Soil pH</span>
        <span className="number-input">
          <input
            id={`${bed.id}-ph`}
            type="number"
            min="0"
            max="14"
            step="0.1"
            value={bed.soil.ph ?? ''}
            onChange={(event) => {
              if (event.currentTarget.value === '') {
                const { ph: _removed, ...soil } = bed.soil
                setSoil(soil)
                return
              }
              const ph = event.currentTarget.valueAsNumber
              if (Number.isFinite(ph) && ph >= 0 && ph <= 14) {
                setSoil({ ...bed.soil, ph })
              }
            }}
          />
          <span>pH</span>
        </span>
      </label>
      <label className="field" htmlFor={`${bed.id}-organic-matter`}>
        <span>Organic matter</span>
        <span className="number-input">
          <input
            id={`${bed.id}-organic-matter`}
            type="number"
            min="0"
            max="100"
            step="0.5"
            value={bed.soil.organicMatterPercent ?? ''}
            onChange={(event) => {
              if (event.currentTarget.value === '') {
                const { organicMatterPercent: _removed, ...soil } = bed.soil
                setSoil(soil)
                return
              }
              const organicMatterPercent = event.currentTarget.valueAsNumber
              if (
                Number.isFinite(organicMatterPercent) &&
                organicMatterPercent >= 0 &&
                organicMatterPercent <= 100
              ) {
                setSoil({ ...bed.soil, organicMatterPercent })
              }
            }}
          />
          <span>%</span>
        </span>
      </label>
      <TextField
        id={`${bed.id}-soil-notes`}
        label="Soil notes"
        value={bed.soil.notes ?? ''}
        optional
        onCommit={(notes) => {
          if (notes) {
            setSoil({ ...bed.soil, notes })
          } else {
            const { notes: _removed, ...soil } = bed.soil
            setSoil(soil)
          }
        }}
      />
      <FootprintEditor
        id={bed.id}
        footprint={bed.footprint}
        unit={unit}
        onChange={(footprint) => replace({ ...bed, footprint })}
      />
    </>
  )
}

interface ZoneEditorProps {
  readonly zone: IrrigationZoneEntity
  readonly unit: DisplayUnit
  readonly replace: (entity: IrrigationZoneEntity) => void
}

function ZoneEditor({ zone, unit, replace }: ZoneEditorProps) {
  return (
    <>
      <label className="field" htmlFor={`${zone.id}-delivery`}>
        <span>Delivery</span>
        <select
          id={`${zone.id}-delivery`}
          value={zone.deliveryMethod}
          onChange={(event) => replace({
            ...zone,
            deliveryMethod: event.currentTarget.value as IrrigationZoneEntity['deliveryMethod'],
          })}
        >
          <option value="drip">Drip</option>
          <option value="spray">Spray</option>
          <option value="soaker">Soaker</option>
          <option value="manual">Manual</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label className="field" htmlFor={`${zone.id}-weekly-target`}>
        <span>Weekly target</span>
        <span className="number-input">
          <input
            id={`${zone.id}-weekly-target`}
            type="number"
            min="0"
            step="1"
            value={zone.weeklyTargetMillimeters ?? ''}
            onChange={(event) => {
              if (event.currentTarget.value === '') {
                const { weeklyTargetMillimeters: _removed, ...withoutTarget } = zone
                replace(withoutTarget)
                return
              }
              const weeklyTargetMillimeters = event.currentTarget.valueAsNumber
              if (Number.isFinite(weeklyTargetMillimeters) && weeklyTargetMillimeters >= 0) {
                replace({ ...zone, weeklyTargetMillimeters })
              }
            }}
          />
          <span>mm</span>
        </span>
      </label>
      <TextField
        id={`${zone.id}-notes`}
        label="Notes"
        value={zone.notes ?? ''}
        optional
        onCommit={(notes) => {
          if (notes) {
            replace({ ...zone, notes })
          } else {
            const { notes: _removed, ...withoutNotes } = zone
            replace(withoutNotes)
          }
        }}
      />
      {zone.footprint ? (
        <FootprintEditor
          id={zone.id}
          footprint={zone.footprint}
          unit={unit}
          onChange={(footprint) => replace({ ...zone, footprint })}
        />
      ) : (
        <button
          className="add-point-button"
          type="button"
          onClick={() => replace({
            ...zone,
            footprint: [
              { eastMeters: -1, northMeters: -1 },
              { eastMeters: 1, northMeters: -1 },
              { eastMeters: 1, northMeters: 1 },
              { eastMeters: -1, northMeters: 1 },
            ],
          })}
        >
          Add display footprint
        </button>
      )}
      <p className="field-note">
        The footprint is visual only. Plant membership remains explicit.
      </p>
    </>
  )
}

interface PlantEditorProps {
  readonly plant: PlantEntity
  readonly plantingBeds: readonly PlantingBedEntity[]
  readonly irrigationZones: readonly IrrigationZoneEntity[]
  readonly interactionGroups: readonly PlantInteractionGroup[]
  readonly unit: DisplayUnit
  readonly replace: (entity: PlantEntity) => void
}

function PlantEditor({
  plant,
  plantingBeds,
  irrigationZones,
  interactionGroups,
  unit,
  replace,
}: PlantEditorProps) {
  const setOptionalText = (
    key: 'commonName' | 'cultivar',
    value: string | undefined,
  ) => {
    if (value) {
      replace({ ...plant, [key]: value })
    } else {
      const { [key]: _removed, ...withoutValue } = plant
      replace(withoutValue)
    }
  }
  const setPosition = (
    key: keyof PlantEntity['position'],
    value: number,
  ) => replace({
    ...plant,
    position: { ...plant.position, [key]: value },
  })
  return (
    <>
      <TextField
        id={`${plant.id}-taxon-id`}
        label="Taxonomy ID"
        value={plant.taxonId}
        onCommit={(taxonId) => {
          if (taxonId) replace({ ...plant, taxonId })
        }}
      />
      <TextField
        id={`${plant.id}-scientific-name`}
        label="Scientific name"
        value={plant.scientificName}
        onCommit={(scientificName) => {
          if (scientificName) replace({ ...plant, scientificName })
        }}
      />
      <TextField
        id={`${plant.id}-common-name`}
        label="Common name"
        value={plant.commonName ?? ''}
        optional
        onCommit={(value) => setOptionalText('commonName', value)}
      />
      <TextField
        id={`${plant.id}-cultivar`}
        label="Cultivar"
        value={plant.cultivar ?? ''}
        optional
        onCommit={(value) => setOptionalText('cultivar', value)}
      />
      <LengthInput
        id={`${plant.id}-east`}
        label="Center east"
        meters={plant.position.eastMeters}
        unit={unit}
        onChange={(value) => setPosition('eastMeters', value)}
      />
      <LengthInput
        id={`${plant.id}-elevation`}
        label="Center elevation"
        meters={plant.position.elevationMeters}
        unit={unit}
        onChange={(value) => setPosition('elevationMeters', value)}
      />
      <LengthInput
        id={`${plant.id}-north`}
        label="Center north"
        meters={plant.position.northMeters}
        unit={unit}
        onChange={(value) => setPosition('northMeters', value)}
      />
      <LengthInput
        id={`${plant.id}-canopy-radius`}
        label="Canopy radius"
        meters={plant.canopyRadiusMeters}
        unit={unit}
        minMeters={0.01}
        onChange={(canopyRadiusMeters) => replace({ ...plant, canopyRadiusMeters })}
      />
      <label className="field" htmlFor={`${plant.id}-bed`}>
        <span>Planting bed</span>
        <select
          id={`${plant.id}-bed`}
          value={plant.plantingBedId ?? ''}
          onChange={(event) => {
            const plantingBedId = event.currentTarget.value
            if (plantingBedId) {
              replace({ ...plant, plantingBedId })
            } else {
              const { plantingBedId: _removed, ...withoutBed } = plant
              replace(withoutBed)
            }
          }}
        >
          <option value="">No shared-soil bed</option>
          {plantingBeds.map((bed) => (
            <option key={bed.id} value={bed.id}>{bed.name}</option>
          ))}
        </select>
      </label>
      <fieldset className="landscape-memberships">
        <legend>Irrigation zones</legend>
        {irrigationZones.length === 0 ? (
          <p className="field-note">No irrigation zones have been defined.</p>
        ) : irrigationZones.map((zone) => (
          <label key={zone.id}>
            <input
              type="checkbox"
              checked={plant.irrigationZoneIds.includes(zone.id)}
              onChange={(event) => replace({
                ...plant,
                irrigationZoneIds: event.currentTarget.checked
                  ? [...plant.irrigationZoneIds, zone.id]
                  : plant.irrigationZoneIds.filter((id) => id !== zone.id),
              })}
            />
            <span>{zone.name}</span>
          </label>
        ))}
      </fieldset>
      <fieldset className="landscape-memberships">
        <legend>Interaction groups</legend>
        {interactionGroups.length === 0 ? (
          <p className="field-note">No interaction groups have been defined.</p>
        ) : interactionGroups.map((group) => (
          <label key={group.id}>
            <input
              type="checkbox"
              checked={plant.interactionGroupIds.includes(group.id)}
              onChange={(event) => replace({
                ...plant,
                interactionGroupIds: event.currentTarget.checked
                  ? [...plant.interactionGroupIds, group.id]
                  : plant.interactionGroupIds.filter((id) => id !== group.id),
              })}
            />
            <span>{group.name}</span>
          </label>
        ))}
      </fieldset>
    </>
  )
}

export function LandscapeEditor({
  plantingBeds,
  irrigationZones,
  plants,
  interactionGroups,
  interactionRules,
  interactionFindings,
  selectedEntityId,
  unit,
  canUndo,
  canRedo,
  onAdd,
  onSelect,
  onReplace,
  onRemove,
  onAddGroup,
  onReplaceGroup,
  onRemoveGroup,
  onAddRule,
  onReplaceRule,
  onRemoveRule,
  onUndo,
  onRedo,
  onClose,
}: LandscapeEditorProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [validationMessage, setValidationMessage] = useState<string | null>(null)
  const { panelRef, dragHandleProps } = useDraggablePanel<HTMLElement>()
  const entities: readonly LandscapeSemanticEntity[] = [
    ...plantingBeds,
    ...irrigationZones,
    ...plants,
  ]
  const selected = entities.find(({ id }) => id === selectedEntityId)
  const replace = (entity: LandscapeSemanticEntity) => {
    try {
      onReplace(entity)
      setValidationMessage(null)
    } catch (error) {
      setValidationMessage(
        error instanceof Error ? error.message : 'Landscape entity is invalid',
      )
    }
  }
  const references = selected?.kind === 'plantingBed'
    ? plants.filter(({ plantingBedId }) => plantingBedId === selected.id).length
    : selected?.kind === 'irrigationZone'
      ? plants.filter(({ irrigationZoneIds }) =>
          irrigationZoneIds.includes(selected.id)
        ).length
      : 0

  return (
    <aside
      ref={panelRef}
      className={`landscape-panel${isCollapsed ? ' panel-collapsed' : ''}`}
      aria-label="Landscape editor"
    >
      <header
        className="object-toolbar panel-header panel-drag-handle"
        title="Drag to move landscape panel"
        {...dragHandleProps}
      >
        <strong>Landscape</strong>
        <div className="panel-header-actions">
          {!isCollapsed ? (
            <>
              <button type="button" disabled={!canUndo} onClick={onUndo}>Undo</button>
              <button type="button" disabled={!canRedo} onClick={onRedo}>Redo</button>
            </>
          ) : null}
          <button
            className="panel-collapse-button"
            type="button"
            aria-expanded={!isCollapsed}
            aria-controls="landscape-editor-content"
            onClick={() => setIsCollapsed((collapsed) => !collapsed)}
          >
            {isCollapsed ? 'Expand' : 'Collapse'}
          </button>
          <button className="panel-close-button" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </header>
      <div id="landscape-editor-content" hidden={isCollapsed}>
        <div className="object-create-toolbar" aria-label="Create landscape entity">
          <button type="button" onClick={() => onAdd('plantingBed')}>+ Bed</button>
          <button type="button" onClick={() => onAdd('irrigationZone')}>+ Irrigation</button>
          <button type="button" onClick={() => onAdd('plant')}>+ Plant</button>
        </div>
        <label className="object-selection" htmlFor="selected-landscape-entity">
          <span>Selected</span>
          <select
            id="selected-landscape-entity"
            value={selected?.id ?? ''}
            onChange={(event) => onSelect(event.currentTarget.value || null)}
          >
            <option value="">No landscape entity</option>
            {plantingBeds.length > 0 ? (
              <optgroup label="Planting beds">
                {plantingBeds.map((bed) => (
                  <option key={bed.id} value={bed.id}>{bed.name}</option>
                ))}
              </optgroup>
            ) : null}
            {irrigationZones.length > 0 ? (
              <optgroup label="Irrigation zones">
                {irrigationZones.map((zone) => (
                  <option key={zone.id} value={zone.id}>{zone.name}</option>
                ))}
              </optgroup>
            ) : null}
            {plants.length > 0 ? (
              <optgroup label="Plants">
                {plants.map((plant) => (
                  <option key={plant.id} value={plant.id}>{plant.name}</option>
                ))}
              </optgroup>
            ) : null}
          </select>
        </label>
        {selected ? (
          <section className="object-inspector" aria-label="Selected landscape properties">
            <TextField
              id={`${selected.id}-name`}
              label="Name"
              value={selected.name}
              onCommit={(name) => {
                if (name) replace({ ...selected, name })
              }}
            />
            <code>{selected.id}</code>
            {selected.kind === 'plantingBed' ? (
              <BedEditor bed={selected} unit={unit} replace={replace} />
            ) : selected.kind === 'irrigationZone' ? (
              <ZoneEditor zone={selected} unit={unit} replace={replace} />
            ) : (
              <PlantEditor
                plant={selected}
                plantingBeds={plantingBeds}
                irrigationZones={irrigationZones}
                interactionGroups={interactionGroups}
                unit={unit}
                replace={replace}
              />
            )}
            {validationMessage ? (
              <p className="primitive-validation" role="alert">
                {validationMessage}
              </p>
            ) : null}
            {references > 0 ? (
              <p className="field-note">
                Assigned to {references} plant{references === 1 ? '' : 's'}.
                Reassign them before deleting this entity.
              </p>
            ) : null}
            <div className="object-actions">
              <button
                type="button"
                className="danger"
                disabled={references > 0}
                onClick={() => onRemove(selected.id)}
              >
                Delete
              </button>
            </div>
          </section>
        ) : (
          <p className="object-empty-state">
            Create an entity or select one above to edit its properties.
          </p>
        )}
        <InteractionCatalogEditor
          groups={interactionGroups}
          rules={interactionRules}
          plants={plants}
          findings={interactionFindings}
          onAddGroup={onAddGroup}
          onReplaceGroup={onReplaceGroup}
          onRemoveGroup={onRemoveGroup}
          onAddRule={onAddRule}
          onReplaceRule={onReplaceRule}
          onRemoveRule={onRemoveRule}
        />
      </div>
    </aside>
  )
}
