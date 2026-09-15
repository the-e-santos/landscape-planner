import {
  displayLengthInputValue,
  displayUnitLabel,
  fromDisplayLength,
  type DisplayUnit,
} from '../domain/units'

interface LengthInputProps {
  readonly id: string
  readonly label: string
  readonly meters: number
  readonly unit: DisplayUnit
  readonly minMeters?: number
  readonly onChange: (meters: number) => void
}

export function LengthInput({
  id,
  label,
  meters,
  unit,
  minMeters,
  onChange,
}: LengthInputProps) {
  const minimum =
    minMeters === undefined
      ? undefined
      : displayLengthInputValue(minMeters, unit)

  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <span className="number-input">
        <input
          id={id}
          type="number"
          min={minimum}
          step={unit === 'feet' ? 0.25 : 0.1}
          value={displayLengthInputValue(meters, unit)}
          onChange={(event) => {
            const value = event.currentTarget.valueAsNumber

            if (!Number.isFinite(value)) {
              return
            }

            const nextMeters = fromDisplayLength(value, unit)

            if (minMeters === undefined || nextMeters >= minMeters) {
              onChange(nextMeters)
            }
          }}
        />
        <span>{displayUnitLabel(unit)}</span>
      </span>
    </label>
  )
}
