import { describe, expect, it } from 'vitest'
import { createDefaultProject } from '../domain/project'
import type { PrimitiveEntity } from '../domain/primitive'
import {
  buildClimateDirectDirectionSet,
  buildDirectDirectionSet,
  createAccumulatedDirectEvaluator,
  type DirectExposurePeriod,
} from './accumulatedDirect'
import { createSyntheticClimateModel } from './syntheticClimate'

const equinoxDay: DirectExposurePeriod = {
  startDate: { year: 2024, month: 3, day: 20 },
  endDate: { year: 2024, month: 3, day: 20 },
  latitudeRadians: 0,
  directNormalIrradianceWattsPerSquareMeter: 800,
  timeStepMinutes: 15,
}

describe('accumulated direct exposure', () => {
  it('matches the equatorial-equinox horizontal daily integral', () => {
    const directions = buildDirectDirectionSet(equinoxDay, 256)
    const project = createDefaultProject()
    const withoutPrimitives = {
      ...project,
      entities: project.entities.filter((entity) => entity.kind !== 'primitive'),
    }
    const result = createAccumulatedDirectEvaluator(
      withoutPrimitives,
      directions,
    )({
      eastMeters: 0,
      elevationMeters: 0,
      northMeters: 0,
      normal: { east: 0, up: 1, north: 0 },
    })

    // 0.8 kW/m² × integral(cos(hour angle)) = 0.8 × 24/π.
    expect(Math.abs(
      result.directExposureKilowattHoursPerSquareMeter - 0.8 * 24 / Math.PI,
    )).toBeLessThan(0.01)
  })

  it('caps direction count while preserving direct-normal energy', () => {
    const unclustered = buildDirectDirectionSet(equinoxDay, 512)
    const clustered = buildDirectDirectionSet(equinoxDay, 12)

    expect(clustered.directions.length).toBeLessThanOrEqual(12)
    expect(clustered.temporalSampleCount).toBe(unclustered.temporalSampleCount)
    expect(clustered.totalDirectNormalExposureKilowattHoursPerSquareMeter)
      .toBeCloseTo(
        unclustered.totalDirectNormalExposureKilowattHoursPerSquareMeter,
        12,
      )

    const project = createDefaultProject()
    const withoutPrimitives = {
      ...project,
      entities: project.entities.filter((entity) => entity.kind !== 'primitive'),
    }
    const surface = {
      eastMeters: 0,
      elevationMeters: 0,
      northMeters: 0,
      normal: { east: 0, up: 1, north: 0 },
    }
    const reference = createAccumulatedDirectEvaluator(
      withoutPrimitives,
      unclustered,
    )(surface).directExposureKilowattHoursPerSquareMeter
    const approximation = createAccumulatedDirectEvaluator(
      withoutPrimitives,
      clustered,
    )(surface).directExposureKilowattHoursPerSquareMeter
    expect(Math.abs(approximation - reference) / reference).toBeLessThan(0.1)
  })

  it('applies constant transmission to every clustered direction', () => {
    const screen: PrimitiveEntity = {
      id: 'accumulated.screen',
      kind: 'primitive',
      name: 'Screen',
      transform: {
        position: { eastMeters: 0, elevationMeters: 2, northMeters: 0 },
        rotation: { xRadians: 0, yRadians: 0, zRadians: 0 },
      },
      geometry: {
        kind: 'box', widthMeters: 10_000, heightMeters: 0.1, depthMeters: 10_000,
      },
      solarOptics: { mode: 'transmissive', transmittance: 0.5 },
    }
    const base = createDefaultProject()
    const clearProject = {
      ...base,
      entities: base.entities.filter((entity) => entity.kind !== 'primitive'),
    }
    const screenedProject = {
      ...clearProject,
      entities: [...clearProject.entities, screen],
    }
    const directions = buildDirectDirectionSet(equinoxDay, 64)
    const surface = {
      eastMeters: 0,
      elevationMeters: 0,
      northMeters: 0,
      normal: { east: 0, up: 1, north: 0 },
    }
    const clear = createAccumulatedDirectEvaluator(clearProject, directions)(surface)
    const screened = createAccumulatedDirectEvaluator(
      screenedProject,
      directions,
    )(surface)

    expect(screened.directExposureKilowattHoursPerSquareMeter)
      .toBeCloseTo(clear.directExposureKilowattHoursPerSquareMeter * 0.5, 8)
  })

  it('validates date ordering and direction count', () => {
    expect(() => buildDirectDirectionSet({
      ...equinoxDay,
      startDate: { year: 2024, month: 3, day: 21 },
    }, 24)).toThrow('end date')
    expect(() => buildDirectDirectionSet(equinoxDay, 0))
      .toThrow('positive integer')
  })

  it('uses overcast probability as an expected-value DNI weight', () => {
    const climate = createSyntheticClimateModel({
      clear: {
        referenceDirectNormalIrradianceWattsPerSquareMeter: 800,
        referenceDiffuseHorizontalIrradianceWattsPerSquareMeter: 100,
      },
      overcast: {
        referenceDirectNormalIrradianceWattsPerSquareMeter: 200,
        referenceDiffuseHorizontalIrradianceWattsPerSquareMeter: 300,
      },
    })
    const basePeriod = {
      startDate: equinoxDay.startDate,
      endDate: equinoxDay.endDate,
      latitudeRadians: equinoxDay.latitudeRadians,
      timeStepMinutes: equinoxDay.timeStepMinutes,
    }
    const clear = buildClimateDirectDirectionSet({
      ...basePeriod,
      overcastProbabilityCurve: [
        { localSolarTimeHours: 0, probability: 0 },
        { localSolarTimeHours: 24, probability: 0 },
      ],
    }, 256, climate)
    const mixed = buildClimateDirectDirectionSet({
      ...basePeriod,
      overcastProbabilityCurve: [
        { localSolarTimeHours: 0, probability: 0.5 },
        { localSolarTimeHours: 24, probability: 0.5 },
      ],
    }, 256, climate)
    const overcast = buildClimateDirectDirectionSet({
      ...basePeriod,
      overcastProbabilityCurve: [
        { localSolarTimeHours: 0, probability: 1 },
        { localSolarTimeHours: 24, probability: 1 },
      ],
    }, 256, climate)

    expect(mixed.totalDirectNormalExposureKilowattHoursPerSquareMeter)
      .toBeCloseTo(
        (
          clear.totalDirectNormalExposureKilowattHoursPerSquareMeter +
          overcast.totalDirectNormalExposureKilowattHoursPerSquareMeter
        ) / 2,
        10,
      )
    expect(mixed.temporalSampleCount).toBe(clear.temporalSampleCount)
  })
})
