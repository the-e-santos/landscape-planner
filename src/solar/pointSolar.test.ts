import { describe, expect, it } from 'vitest'
import { createDefaultProject } from '../domain/project'
import type { PrimitiveEntity } from '../domain/primitive'
import { queryDirectPointSolar } from './pointSolar'

const baseQuery = {
  solarPosition: {
    date: { year: 2024, month: 3, day: 20 },
    latitudeRadians: 0,
    localSolarTimeHours: 12,
  },
  directNormalIrradianceWattsPerSquareMeter: 800,
  surface: {
    eastMeters: 10,
    elevationMeters: 0,
    northMeters: 10,
    normal: { east: 0, up: 1, north: 0 },
  },
} as const

describe('direct point solar query', () => {
  it('applies cosine incidence to an unobstructed horizontal surface', () => {
    const result = queryDirectPointSolar(createDefaultProject(), baseQuery)

    expect(result.incidenceCosine).toBeCloseTo(1, 4)
    expect(result.transmission).toBe(1)
    expect(result.directIrradianceWattsPerSquareMeter).toBeCloseTo(800, 2)
  })

  it('returns 400 W/m² through one 50% screen', () => {
    const screen: PrimitiveEntity = {
      id: 'screen',
      kind: 'primitive',
      name: 'Screen',
      transform: {
        position: { eastMeters: 10, elevationMeters: 2, northMeters: 10 },
        rotation: { xRadians: 0, yRadians: 0, zRadians: 0 },
      },
      geometry: {
        kind: 'box', widthMeters: 2, heightMeters: 0.1, depthMeters: 2,
      },
      solarOptics: { mode: 'transmissive', transmittance: 0.5 },
    }
    const project = createDefaultProject()
    const result = queryDirectPointSolar({
      ...project,
      entities: [...project.entities, screen],
    }, baseQuery)

    expect(result.transmission).toBe(0.5)
    expect(result.directIrradianceWattsPerSquareMeter).toBeCloseTo(400, 2)
  })

  it('returns no direct irradiance at night or on a back-facing surface', () => {
    expect(queryDirectPointSolar(createDefaultProject(), {
      ...baseQuery,
      solarPosition: { ...baseQuery.solarPosition, localSolarTimeHours: 0 },
    }).directIrradianceWattsPerSquareMeter).toBe(0)
    expect(queryDirectPointSolar(createDefaultProject(), {
      ...baseQuery,
      surface: { ...baseQuery.surface, normal: { east: 0, up: -1, north: 0 } },
    }).directIrradianceWattsPerSquareMeter).toBe(0)
  })
})
