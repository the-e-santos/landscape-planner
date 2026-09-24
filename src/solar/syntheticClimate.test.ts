import { describe, expect, it } from 'vitest'
import { overcastProbabilityAt } from './climateModel'
import { createSyntheticClimateModel } from './syntheticClimate'
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
      .toBe(800)
    expect(climate.getDirectNormalIrradiance({ ...noon, skyCondition: 'overcast' }))
      .toBe(0)
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
