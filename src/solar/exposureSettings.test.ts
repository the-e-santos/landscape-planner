import { describe, expect, it } from 'vitest'
import { createDefaultProject } from '../domain/project'
import { prepareSurfaceExposure } from './exposureSettings'
import { DEFAULT_SYNTHETIC_CLIMATE } from './syntheticClimate'

describe('surface exposure preparation', () => {
  it('preserves instantaneous irradiance metadata', () => {
    const prepared = prepareSurfaceExposure(createDefaultProject(), {
      enabled: true,
      analysisMode: 'instant',
      climateParameters: DEFAULT_SYNTHETIC_CLIMATE,
      skyCondition: 'clear',
      solarPosition: {
        date: { year: 2024, month: 6, day: 20 },
        latitudeRadians: 0.5,
        localSolarTimeHours: 12,
      },
      spacingMeters: 1,
      displayChannel: 'direct',
    })

    expect(prepared).toMatchObject({
      quantity: 'irradiance',
      unit: 'W/m²',
      directionCount: 146,
      temporalSampleCount: 1,
    })
  })

  it('reports accumulated exposure provenance separately from irradiance', () => {
    const prepared = prepareSurfaceExposure(createDefaultProject(), {
      enabled: true,
      analysisMode: 'accumulated',
      climateParameters: DEFAULT_SYNTHETIC_CLIMATE,
      period: {
        startDate: { year: 2024, month: 6, day: 1 },
        endDate: { year: 2024, month: 6, day: 2 },
        latitudeRadians: 0.5,
        timeStepMinutes: 60,
        overcastProbabilityCurve: [
          { localSolarTimeHours: 0, probability: 0.25 },
          { localSolarTimeHours: 24, probability: 0.25 },
        ],
      },
      maximumDirections: 24,
      spacingMeters: 2,
      displayChannel: 'direct',
    })

    expect(prepared.quantity).toBe('radiantExposure')
    expect(prepared.unit).toBe('kWh/m²')
    expect(prepared.directionCount).toBeLessThanOrEqual(24 + 145)
    expect(prepared.temporalSampleCount).toBeGreaterThan(0)
    expect(prepared.scaleMaximum).toBeGreaterThan(0)
    const exposure = prepared.evaluate({
      eastMeters: 0,
      elevationMeters: 10,
      northMeters: 0,
      normal: { east: 0, up: 1, north: 0 },
    })
    expect(exposure.diffuse).toBeGreaterThan(0)
    expect(exposure.total).toBeCloseTo(exposure.direct + exposure.diffuse, 12)
  })
})
