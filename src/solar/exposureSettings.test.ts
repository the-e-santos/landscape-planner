import { describe, expect, it } from 'vitest'
import { createDefaultProject } from '../domain/project'
import { prepareSurfaceExposure } from './exposureSettings'

describe('surface exposure preparation', () => {
  it('preserves instantaneous irradiance metadata', () => {
    const prepared = prepareSurfaceExposure(createDefaultProject(), {
      enabled: true,
      analysisMode: 'instant',
      solarPosition: {
        date: { year: 2024, month: 6, day: 20 },
        latitudeRadians: 0.5,
        localSolarTimeHours: 12,
      },
      directNormalIrradianceWattsPerSquareMeter: 800,
      spacingMeters: 1,
      displayChannel: 'direct',
    })

    expect(prepared).toMatchObject({
      quantity: 'irradiance',
      unit: 'W/m²',
      directionCount: 1,
      temporalSampleCount: 1,
    })
  })

  it('reports accumulated exposure provenance separately from irradiance', () => {
    const prepared = prepareSurfaceExposure(createDefaultProject(), {
      enabled: true,
      analysisMode: 'accumulated',
      period: {
        startDate: { year: 2024, month: 6, day: 1 },
        endDate: { year: 2024, month: 6, day: 2 },
        latitudeRadians: 0.5,
        directNormalIrradianceWattsPerSquareMeter: 800,
        timeStepMinutes: 60,
      },
      maximumDirections: 24,
      spacingMeters: 2,
      displayChannel: 'direct',
    })

    expect(prepared.quantity).toBe('radiantExposure')
    expect(prepared.unit).toBe('kWh/m²')
    expect(prepared.directionCount).toBeLessThanOrEqual(24)
    expect(prepared.temporalSampleCount).toBeGreaterThan(0)
    expect(prepared.scaleMaximum).toBeGreaterThan(0)
  })
})
