import { describe, expect, it } from 'vitest'
import { overcastProbabilityAt } from './climateModel'
import {
  createSyntheticClimateModel,
  extraterrestrialNormalIrradianceWattsPerSquareMeter,
  relativeOpticalAirMass,
} from './syntheticClimate'
import { TREGENZA_SKY_PATCHES } from './skyPatches'

const noon = {
  date: { year: 2026, month: 6, day: 21 },
  latitudeRadians: 40 * Math.PI / 180,
  localSolarTimeHours: 12,
} as const

describe('synthetic climate model', () => {
  it.each(['clear', 'overcast'] as const)(
    'normalizes the %s anisotropic sky to DHI',
    (skyCondition) => {
      const climate = createSyntheticClimateModel()
      const instant = { ...noon, skyCondition }
      const integratedHorizontal = TREGENZA_SKY_PATCHES.reduce(
        (sum, patch) => sum + climate.getSkyRadiance(instant, patch) *
          patch.direction.up * patch.solidAngleSteradians,
        0,
      )
      expect(integratedHorizontal).toBeCloseTo(
        climate.getDiffuseHorizontalIrradiance(instant),
        10,
      )
    },
  )

  it('keeps the direct solar disk out of diffuse sky radiance', () => {
    const climate = createSyntheticClimateModel()
    expect(climate.getDirectNormalIrradiance({ ...noon, skyCondition: 'clear' }))
      .toBeGreaterThan(700)
    expect(climate.getDirectNormalIrradiance({ ...noon, skyCondition: 'overcast' }))
      .toBe(0)
  })

  it('uses a high-sun reference and air mass to taper clear DNI', () => {
    const climate = createSyntheticClimateModel()
    const equatorialEquinox = {
      date: { year: 2024, month: 3, day: 20 },
      latitudeRadians: 0,
      skyCondition: 'clear',
    } as const
    const noonDni = climate.getDirectNormalIrradiance({
      ...equatorialEquinox,
      localSolarTimeHours: 12,
    })
    const morningDni = climate.getDirectNormalIrradiance({
      ...equatorialEquinox,
      localSolarTimeHours: 9,
    })

    expect(noonDni).toBeCloseTo(850, 0)
    expect(morningDni).toBeLessThan(noonDni)
    expect(morningDni).toBeGreaterThan(0)
    expect(relativeOpticalAirMass(Math.PI / 2)).toBeCloseTo(1, 3)
    expect(extraterrestrialNormalIrradianceWattsPerSquareMeter(
      equatorialEquinox.date,
    )).toBeGreaterThan(1_300)
  })

  it('scales DHI with the sine of solar altitude', () => {
    const climate = createSyntheticClimateModel()
    const equatorialEquinox = {
      date: { year: 2024, month: 3, day: 20 },
      latitudeRadians: 0,
      skyCondition: 'clear',
    } as const
    const noonDhi = climate.getDiffuseHorizontalIrradiance({
      ...equatorialEquinox,
      localSolarTimeHours: 12,
    })
    const morningDhi = climate.getDiffuseHorizontalIrradiance({
      ...equatorialEquinox,
      localSolarTimeHours: 9,
    })

    expect(noonDhi).toBeCloseTo(120, 1)
    expect(morningDhi / noonDhi).toBeCloseTo(Math.SQRT1_2, 2)
  })
})

describe('overcast probability curve', () => {
  const curve = [
    { localSolarTimeHours: 6, probability: 0.8 },
    { localSolarTimeHours: 12, probability: 0.2 },
    { localSolarTimeHours: 18, probability: 0.6 },
  ]

  it('clamps outside endpoints and linearly interpolates within them', () => {
    expect(overcastProbabilityAt(curve, 0)).toBe(0.8)
    expect(overcastProbabilityAt(curve, 9)).toBeCloseTo(0.5)
    expect(overcastProbabilityAt(curve, 24)).toBe(0.6)
  })

  it('rejects invalid and unordered curves', () => {
    expect(() => overcastProbabilityAt([], 12)).toThrow('at least one')
    expect(() => overcastProbabilityAt([
      { localSolarTimeHours: 12, probability: 0.2 },
      { localSolarTimeHours: 10, probability: 0.3 },
    ], 11)).toThrow('strictly increasing')
  })
})
