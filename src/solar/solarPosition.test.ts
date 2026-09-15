import { describe, expect, it } from 'vitest'
import {
  calculateSolarPosition,
  degreesToRadians,
  radiansToDegrees,
  solarDeclinationRadians,
} from './solarPosition'

describe('solar position', () => {
  it('matches published seasonal declination values closely', () => {
    expect(radiansToDegrees(solarDeclinationRadians({
      year: 2024,
      month: 6,
      day: 20,
    }))).toBeCloseTo(23.438, 2)
    expect(radiansToDegrees(solarDeclinationRadians({
      year: 2024,
      month: 12,
      day: 21,
    }))).toBeCloseTo(-23.438, 2)
    expect(Math.abs(radiansToDegrees(solarDeclinationRadians({
      year: 2024,
      month: 3,
      day: 20,
    })))).toBeLessThan(0.2)
  })

  it('places the sun due south at northern-hemisphere solar noon', () => {
    const result = calculateSolarPosition({
      date: { year: 2024, month: 6, day: 20 },
      latitudeRadians: degreesToRadians(40),
      localSolarTimeHours: 12,
    })

    expect(radiansToDegrees(result.altitudeRadians)).toBeCloseTo(73.438, 2)
    expect(radiansToDegrees(result.azimuthRadians)).toBeCloseTo(180, 8)
    expect(result.aboveHorizon).toBe(true)
  })

  it('places the morning sun east of the afternoon sun', () => {
    const input = {
      date: { year: 2024, month: 3, day: 20 },
      latitudeRadians: degreesToRadians(35),
    }
    const morning = calculateSolarPosition({
      ...input,
      localSolarTimeHours: 9,
    })
    const afternoon = calculateSolarPosition({
      ...input,
      localSolarTimeHours: 15,
    })

    expect(radiansToDegrees(morning.azimuthRadians)).toBeLessThan(180)
    expect(radiansToDegrees(afternoon.azimuthRadians)).toBeGreaterThan(180)
    expect(morning.altitudeRadians).toBeCloseTo(afternoon.altitudeRadians, 8)
  })

  it('reports nighttime and rejects invalid inputs', () => {
    expect(calculateSolarPosition({
      date: { year: 2024, month: 6, day: 20 },
      latitudeRadians: degreesToRadians(40),
      localSolarTimeHours: 0,
    }).aboveHorizon).toBe(false)
    expect(() => calculateSolarPosition({
      date: { year: 2023, month: 2, day: 29 },
      latitudeRadians: 0,
      localSolarTimeHours: 12,
    })).toThrow('valid Gregorian calendar date')
  })

  it('accepts leap day and places southern-hemisphere noon sun to the north', () => {
    expect(() => calculateSolarPosition({
      date: { year: 2024, month: 2, day: 29 },
      latitudeRadians: degreesToRadians(-35),
      localSolarTimeHours: 12,
    })).not.toThrow()

    const australSummer = calculateSolarPosition({
      date: { year: 2024, month: 12, day: 21 },
      latitudeRadians: degreesToRadians(-40),
      localSolarTimeHours: 12,
    })
    expect(radiansToDegrees(australSummer.altitudeRadians)).toBeCloseTo(73.438, 2)
    expect(radiansToDegrees(australSummer.azimuthRadians)).toBeCloseTo(0, 8)
  })

  it('changes horizon state on opposite sides of equatorial sunrise', () => {
    const input = {
      date: { year: 2024, month: 3, day: 20 },
      latitudeRadians: 0,
    }
    expect(calculateSolarPosition({
      ...input,
      localSolarTimeHours: 5.9,
    }).aboveHorizon).toBe(false)
    expect(calculateSolarPosition({
      ...input,
      localSolarTimeHours: 6.1,
    }).aboveHorizon).toBe(true)
  })
})
