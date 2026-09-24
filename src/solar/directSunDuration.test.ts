import { describe, expect, it } from 'vitest'
import { createDefaultProject } from '../domain/project'
import type { PrimitiveEntity } from '../domain/primitive'
import { createDirectSunDurationEvaluator } from './directSunDuration'

const period = {
  startDate: { year: 2024, month: 3, day: 20 },
  endDate: { year: 2024, month: 3, day: 20 },
  latitudeRadians: 0,
  timeStepMinutes: 15,
  overcastProbabilityCurve: [
    { localSolarTimeHours: 0, probability: 0 },
    { localSolarTimeHours: 24, probability: 0 },
  ],
} as const

const horizontalSurface = {
  eastMeters: 0,
  elevationMeters: 0,
  northMeters: 0,
  normal: { east: 0, up: 1, north: 0 },
} as const

function withoutPrimitives() {
  const project = createDefaultProject()
  return {
    ...project,
    entities: project.entities.filter((entity) => entity.kind !== 'primitive'),
  }
}

function overheadScreen(transmittance: number): PrimitiveEntity {
  return {
    id: 'duration.screen',
    kind: 'primitive',
    name: 'Screen',
    transform: {
      position: { eastMeters: 0, elevationMeters: 2, northMeters: 0 },
      rotation: { xRadians: 0, yRadians: 0, zRadians: 0 },
    },
    geometry: {
      kind: 'box', widthMeters: 10_000, heightMeters: 0.1, depthMeters: 10_000,
    },
    solarOptics: transmittance === 0
      ? { mode: 'opaque' }
      : { mode: 'transmissive', transmittance },
  }
}

describe('direct-sun duration', () => {
  it('reports twelve potential hours on an unobstructed equatorial equinox', () => {
    const result = createDirectSunDurationEvaluator(
      withoutPrimitives(),
      period,
    )(horizontalSurface)
    expect(result.potentialDirectSunHours).toBe(12)
    expect(result.transmissionWeightedDirectSunHours).toBe(12)
    expect(result.temporalSampleCount).toBe(48)
  })

  it('preserves potential duration but weights a transmissive screen', () => {
    const base = withoutPrimitives()
    const result = createDirectSunDurationEvaluator({
      ...base,
      entities: [...base.entities, overheadScreen(0.5)],
    }, period)(horizontalSurface)
    expect(result.potentialDirectSunHours).toBe(12)
    expect(result.transmissionWeightedDirectSunHours).toBe(6)
  })

  it('reports no direct-sun duration below an opaque screen', () => {
    const base = withoutPrimitives()
    const result = createDirectSunDurationEvaluator({
      ...base,
      entities: [...base.entities, overheadScreen(0)],
    }, period)(horizontalSurface)
    expect(result.potentialDirectSunHours).toBe(0)
    expect(result.transmissionWeightedDirectSunHours).toBe(0)
  })
})
