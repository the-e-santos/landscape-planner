import { describe, expect, it } from 'vitest'
import { createRectangleVertices } from '../domain/parcel'
import { createDefaultProject } from '../domain/project'
import type { PrimitiveEntity } from '../domain/primitive'
import { createFlatTerrainEntity } from '../domain/terrain'
import { generateTerrainExposureLayer } from './terrainExposure'
import {
  createSyntheticClimateModel,
  DEFAULT_SYNTHETIC_CLIMATE,
} from './syntheticClimate'
import { calculateSolarPosition } from './solarPosition'

const settings = {
  enabled: true,
  analysisMode: 'instant',
  climateParameters: DEFAULT_SYNTHETIC_CLIMATE,
  skyCondition: 'clear',
  solarPosition: {
    date: { year: 2024, month: 3, day: 20 },
    latitudeRadians: 0,
    localSolarTimeHours: 12,
  },
  spacingMeters: 1,
  displayChannel: 'direct',
} as const

const position = calculateSolarPosition(settings.solarPosition)
const expectedHorizontalDirect = createSyntheticClimateModel(
  DEFAULT_SYNTHETIC_CLIMATE,
).getDirectNormalIrradiance({
  ...settings.solarPosition,
  skyCondition: settings.skyCondition,
}) * Math.sin(position.altitudeRadians)

describe('terrain exposure sampling', () => {
  it('subdivides terrain deterministically at the requested spacing', () => {
    const terrain = createFlatTerrainEntity({
      eastWestMeters: 2,
      northSouthMeters: 2,
    })
    const defaultProject = createDefaultProject()
    const project = {
      ...defaultProject,
      entities: defaultProject.entities.filter(
        (entity) => entity.kind !== 'primitive',
      ),
    }
    const first = generateTerrainExposureLayer(
      project,
      terrain,
      { vertices: createRectangleVertices(2, 2), uncertaintyMeters: 0 },
      settings,
    )
    const second = generateTerrainExposureLayer(
      project,
      terrain,
      { vertices: createRectangleVertices(2, 2), uncertaintyMeters: 0 },
      settings,
    )

    expect(first).toEqual(second)
    expect(first.triangles.length).toBeGreaterThan(2)
    expect(first.vertices.length).toBeGreaterThan(4)
    expect(first.minimumValue).toBeCloseTo(expectedHorizontalDirect, 2)
    expect(first.maximumValue).toBeCloseTo(expectedHorizontalDirect, 2)
  })

  it('captures an opaque primitive shadow without changing terrain state', () => {
    const terrain = createFlatTerrainEntity({
      eastWestMeters: 6,
      northSouthMeters: 6,
    })
    const occluder: PrimitiveEntity = {
      id: 'heatmap-occluder',
      kind: 'primitive',
      name: 'Heatmap occluder',
      transform: {
        position: { eastMeters: 0, elevationMeters: 1, northMeters: 0 },
        rotation: { xRadians: 0, yRadians: 0, zRadians: 0 },
      },
      geometry: {
        kind: 'box', widthMeters: 2, heightMeters: 1, depthMeters: 2,
      },
      solarOptics: { mode: 'opaque' },
    }
    const project = createDefaultProject()
    const layer = generateTerrainExposureLayer(
      { ...project, entities: [...project.entities, occluder] },
      terrain,
      undefined,
      settings,
    )

    expect(layer.minimumValue).toBe(0)
    expect(layer.maximumValue).toBeCloseTo(expectedHorizontalDirect, 2)
    expect(terrain).toEqual(createFlatTerrainEntity({
      eastWestMeters: 6,
      northSouthMeters: 6,
    }))
  })

  it('rejects invalid sampling spacing', () => {
    expect(() => generateTerrainExposureLayer(
      createDefaultProject(),
      createFlatTerrainEntity({ eastWestMeters: 2, northSouthMeters: 2 }),
      undefined,
      { ...settings, spacingMeters: 0 },
    )).toThrow('Heatmap spacing must be a positive finite number')
  })

  it('reuses samples outside the dirty tile set', () => {
    const terrain = createFlatTerrainEntity({
      eastWestMeters: 2,
      northSouthMeters: 2,
    })
    const project = createDefaultProject()
    const first = generateTerrainExposureLayer(project, terrain, undefined, settings)
    const reused = generateTerrainExposureLayer(
      project,
      terrain,
      undefined,
      settings,
      undefined,
      { previousLayer: first, shouldEvaluate: () => false },
    )

    expect(first.evaluatedSampleCount).toBe(first.vertices.length)
    expect(reused.evaluatedSampleCount).toBe(0)
    expect(reused.vertices.map(({ exposure }) => exposure)).toEqual(
      first.vertices.map(({ exposure }) => exposure),
    )
  })
})
