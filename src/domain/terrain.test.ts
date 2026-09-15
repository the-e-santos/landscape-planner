import { describe, expect, it } from 'vitest'
import {
  createFlatTerrainEntity,
  type SpotElevation,
  type TerrainEntity,
} from './terrain'
import { validateTerrain } from './terrainValidation'

function createSpot(
  id: string,
  eastMeters: number,
  northMeters: number,
  elevationMeters = 0,
): SpotElevation {
  return {
    id,
    eastMeters,
    northMeters,
    elevationMeters,
    source: { kind: 'survey', note: 'Analytical test fixture' },
    uncertainty: { horizontalMeters: 0.01, verticalMeters: 0.005 },
  }
}

function createTerrain(
  spotElevations: readonly SpotElevation[],
): TerrainEntity {
  return {
    id: 'terrain.fixture',
    kind: 'terrain',
    name: 'Fixture',
    spotElevations,
  }
}

describe('terrain domain', () => {
  it('creates a valid flat analytical terrain in local coordinates', () => {
    const terrain = createFlatTerrainEntity({
      eastWestMeters: 20,
      northSouthMeters: 30,
      elevationMeters: 2.5,
    })

    expect(terrain.spotElevations).toHaveLength(4)
    expect(terrain.spotElevations[0]).toMatchObject({
      eastMeters: -10,
      northMeters: -15,
      elevationMeters: 2.5,
    })
    expect(validateTerrain(terrain)).toEqual([])
  })

  it('reports too few and invalid spot elevations', () => {
    const invalidSpot: SpotElevation = {
      ...createSpot('', 0, 0, Number.NaN),
      uncertainty: { horizontalMeters: -1, verticalMeters: 0.1 },
    }
    const issueCodes = validateTerrain(createTerrain([invalidSpot])).map(
      ({ code }) => code,
    )

    expect(issueCodes).toEqual([
      'insufficient-points',
      'empty-id',
      'non-finite-elevation',
      'invalid-uncertainty',
    ])
  })

  it('rejects duplicate IDs and horizontal positions', () => {
    const issueCodes = validateTerrain(
      createTerrain([
        createSpot('spot.a', 0, 0),
        createSpot('spot.a', 1, 0),
        createSpot('spot.c', 0, 0),
      ]),
    ).map(({ code }) => code)

    expect(issueCodes).toEqual(['duplicate-id', 'duplicate-position'])
  })

  it('rejects a set of collinear positions', () => {
    const issues = validateTerrain(
      createTerrain([
        createSpot('spot.a', 0, 0),
        createSpot('spot.b', 2, 2),
        createSpot('spot.c', 4, 4),
      ]),
    )

    expect(issues).toEqual([
      expect.objectContaining({ code: 'collinear-points', severity: 'error' }),
    ])
  })
})
