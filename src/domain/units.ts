export type DisplayUnit = 'meters' | 'feet'

export const METERS_PER_FOOT = 0.3048

export function toDisplayLength(meters: number, unit: DisplayUnit): number {
  return unit === 'feet' ? meters / METERS_PER_FOOT : meters
}

export function fromDisplayLength(value: number, unit: DisplayUnit): number {
  return unit === 'feet' ? value * METERS_PER_FOOT : value
}

export function displayUnitLabel(unit: DisplayUnit): string {
  return unit === 'feet' ? 'ft' : 'm'
}

export function displayLengthInputValue(
  meters: number,
  unit: DisplayUnit,
): number {
  const precision = unit === 'feet' ? 3 : 2

  return Number(toDisplayLength(meters, unit).toFixed(precision))
}
