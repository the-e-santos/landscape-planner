import { describe, expect, it } from 'vitest'
import { createDefaultProject } from '../domain/project'
import type { PrimitiveEntity } from '../domain/primitive'
import {
  buildIntegratedDiffuseSky,
  createAccumulatedDiffuseEvaluator,
  createInstantDiffuseEvaluator,
} from './diffuseExposure'
import { createSyntheticClimateModel } from './syntheticClimate'

const surface = {
  eastMeters: 0,
  elevationMeters: 0,
  northMeters: 0,
  normal: { east: 0, up: 1, north: 0 },
} as const

function emptyProject() {
  const project = createDefaultProject()
  return {
    ...project,
    entities: project.entities.filter((entity) => entity.kind !== 'primitive'),
  }
}

describe('diffuse exposure', () => {
  it('closes an unobstructed instantaneous horizontal surface to DHI', () => {
    const project = emptyProject()
    const climate = createSyntheticClimateModel()
    const instant = {
      date: { year: 2026, month: 6, day: 21 },
      latitudeRadians: 40 * Math.PI / 180,
      localSolarTimeHours: 12,
      skyCondition: 'clear',
    } as const
    const result = createInstantDiffuseEvaluator(project, climate, instant)(surface)
    expect(result).toBeCloseTo(
      climate.getDiffuseHorizontalIrradiance(instant),
      10,
    )
  })

  it('integrates probability-weighted patch radiance and closes to expected DHI', () => {
    const project = emptyProject()
    const sky = buildIntegratedDiffuseSky({
      startDate: { year: 2024, month: 3, day: 20 },
      endDate: { year: 2024, month: 3, day: 20 },
      latitudeRadians: 0,
      timeStepMinutes: 60,
      overcastProbabilityCurve: [
        { localSolarTimeHours: 0, probability: 0.25 },
        { localSolarTimeHours: 24, probability: 0.25 },
      ],
    }, createSyntheticClimateModel())
    const result = createAccumulatedDiffuseEvaluator(project, sky)(surface)
    expect(result).toBeCloseTo(
      sky.expectedDiffuseHorizontalExposureKilowattHoursPerSquareMeter,
      10,
    )
    expect(sky.temporalSampleCount).toBe(12)
  })

  it('applies the existing constant-transmission optics to every sky patch', () => {
    const screen: PrimitiveEntity = {
      id: 'diffuse.screen',
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
    const clearProject = emptyProject()
    const screenedProject = {
      ...clearProject,
      entities: [...clearProject.entities, screen],
    }
    const climate = createSyntheticClimateModel()
    const instant = {
      date: { year: 2026, month: 6, day: 21 },
      latitudeRadians: 40 * Math.PI / 180,
      localSolarTimeHours: 12,
      skyCondition: 'overcast',
    } as const
    const clear = createInstantDiffuseEvaluator(clearProject, climate, instant)(surface)
    const screened = createInstantDiffuseEvaluator(screenedProject, climate, instant)(surface)
    expect(screened).toBeCloseTo(clear * 0.5, 8)
  })
})
