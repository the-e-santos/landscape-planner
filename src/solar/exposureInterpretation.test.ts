import { describe, expect, it } from 'vitest'
import {
  classifyHorticulturalEnergy,
  inclusiveDayCount,
  interpretAccumulatedExposure,
} from './exposureInterpretation'

describe('exposure interpretation', () => {
  it('counts inclusive periods across leap day', () => {
    expect(inclusiveDayCount(
      { year: 2024, month: 2, day: 28 },
      { year: 2024, month: 3, day: 1 },
    )).toBe(3)
  })

  it.each([
    [1.99, 'deepShadeEnergy'],
    [2, 'partialShadeEnergy'],
    [4, 'partialSunEnergy'],
    [6, 'fullSunEnergy'],
  ] as const)('classifies %s equivalent hours as %s', (hours, expected) => {
    expect(classifyHorticulturalEnergy(hours).energyBand).toBe(expected)
  })

  it('derives daily energy, channel shares, and unobstructed comparison', () => {
    const result = interpretAccumulatedExposure({
      startDate: { year: 2026, month: 6, day: 1 },
      endDate: { year: 2026, month: 6, day: 10 },
      directKilowattHoursPerSquareMeter: 30,
      diffuseKilowattHoursPerSquareMeter: 20,
      unobstructedTotalKilowattHoursPerSquareMeter: 100,
    })

    expect(result.periodDayCount).toBe(10)
    expect(result.averageDailyTotalKilowattHoursPerSquareMeter).toBe(5)
    expect(result.equivalentPeakSunHoursPerDay).toBe(5)
    expect(result.directShare).toBeCloseTo(0.6)
    expect(result.diffuseShare).toBeCloseTo(0.4)
    expect(result.unobstructedExposureFraction).toBeCloseTo(0.5)
    expect(result.energyBand).toBe('partialSunEnergy')
  })

  it('handles a zero-energy period without producing NaN percentages', () => {
    const result = interpretAccumulatedExposure({
      startDate: { year: 2026, month: 1, day: 1 },
      endDate: { year: 2026, month: 1, day: 1 },
      directKilowattHoursPerSquareMeter: 0,
      diffuseKilowattHoursPerSquareMeter: 0,
      unobstructedTotalKilowattHoursPerSquareMeter: 0,
    })

    expect(result.directShare).toBe(0)
    expect(result.diffuseShare).toBe(0)
    expect(result.unobstructedExposureFraction).toBeNull()
  })
})
