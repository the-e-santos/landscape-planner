import type { SolarDate } from './solarPosition'

export type HorticulturalEnergyBand =
  | 'deepShadeEnergy'
  | 'partialShadeEnergy'
  | 'partialSunEnergy'
  | 'fullSunEnergy'

export interface AccumulatedExposureInterpretation {
  readonly periodDayCount: number
  readonly averageDailyDirectKilowattHoursPerSquareMeter: number
  readonly averageDailyDiffuseKilowattHoursPerSquareMeter: number
  readonly averageDailyTotalKilowattHoursPerSquareMeter: number
  /** Broadband energy equivalent at a constant 1 kW/m², not direct-sun duration. */
  readonly equivalentPeakSunHoursPerDay: number
  readonly directShare: number
  readonly diffuseShare: number
  /** Fraction retained relative to the same surface without primitive occluders. */
  readonly unobstructedExposureFraction: number | null
  readonly energyBand: HorticulturalEnergyBand
  readonly energyBandLabel: string
}

const DAY_MILLISECONDS = 86_400_000

function dateToUtcMilliseconds(date: SolarDate): number {
  const value = Date.UTC(date.year, date.month - 1, date.day)
  const normalized = new Date(value)
  if (
    normalized.getUTCFullYear() !== date.year ||
    normalized.getUTCMonth() + 1 !== date.month ||
    normalized.getUTCDate() !== date.day
  ) {
    throw new Error('Exposure interpretation requires valid Gregorian dates')
  }
  return value
}

export function inclusiveDayCount(startDate: SolarDate, endDate: SolarDate): number {
  const start = dateToUtcMilliseconds(startDate)
  const end = dateToUtcMilliseconds(endDate)
  if (end < start) throw new Error('Exposure period end date must not precede its start date')
  return (end - start) / DAY_MILLISECONDS + 1
}

export function classifyHorticulturalEnergy(
  equivalentPeakSunHoursPerDay: number,
): Pick<AccumulatedExposureInterpretation, 'energyBand' | 'energyBandLabel'> {
  if (!Number.isFinite(equivalentPeakSunHoursPerDay) || equivalentPeakSunHoursPerDay < 0) {
    throw new Error('Equivalent peak-sun hours must be a non-negative finite number')
  }
  if (equivalentPeakSunHoursPerDay < 2) {
    return { energyBand: 'deepShadeEnergy', energyBandLabel: 'Deep-shade energy' }
  }
  if (equivalentPeakSunHoursPerDay < 4) {
    return { energyBand: 'partialShadeEnergy', energyBandLabel: 'Partial-shade energy' }
  }
  if (equivalentPeakSunHoursPerDay < 6) {
    return { energyBand: 'partialSunEnergy', energyBandLabel: 'Partial-sun energy' }
  }
  return { energyBand: 'fullSunEnergy', energyBandLabel: 'Full-sun energy' }
}

export function interpretAccumulatedExposure(input: {
  readonly startDate: SolarDate
  readonly endDate: SolarDate
  readonly directKilowattHoursPerSquareMeter: number
  readonly diffuseKilowattHoursPerSquareMeter: number
  readonly unobstructedTotalKilowattHoursPerSquareMeter?: number
}): AccumulatedExposureInterpretation {
  const values = [
    input.directKilowattHoursPerSquareMeter,
    input.diffuseKilowattHoursPerSquareMeter,
  ]
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error('Accumulated exposure channels must be non-negative finite numbers')
  }
  if (
    input.unobstructedTotalKilowattHoursPerSquareMeter !== undefined &&
    (!Number.isFinite(input.unobstructedTotalKilowattHoursPerSquareMeter) ||
      input.unobstructedTotalKilowattHoursPerSquareMeter < 0)
  ) {
    throw new Error('Unobstructed exposure must be a non-negative finite number')
  }

  const periodDayCount = inclusiveDayCount(input.startDate, input.endDate)
  const total = input.directKilowattHoursPerSquareMeter +
    input.diffuseKilowattHoursPerSquareMeter
  const averageDailyDirect = input.directKilowattHoursPerSquareMeter / periodDayCount
  const averageDailyDiffuse = input.diffuseKilowattHoursPerSquareMeter / periodDayCount
  const averageDailyTotal = total / periodDayCount
  const band = classifyHorticulturalEnergy(averageDailyTotal)
  const unobstructed = input.unobstructedTotalKilowattHoursPerSquareMeter

  return {
    periodDayCount,
    averageDailyDirectKilowattHoursPerSquareMeter: averageDailyDirect,
    averageDailyDiffuseKilowattHoursPerSquareMeter: averageDailyDiffuse,
    averageDailyTotalKilowattHoursPerSquareMeter: averageDailyTotal,
    equivalentPeakSunHoursPerDay: averageDailyTotal,
    directShare: total === 0 ? 0 : input.directKilowattHoursPerSquareMeter / total,
    diffuseShare: total === 0 ? 0 : input.diffuseKilowattHoursPerSquareMeter / total,
    unobstructedExposureFraction:
      unobstructed === undefined || unobstructed === 0 ? null : total / unobstructed,
    ...band,
  }
}
