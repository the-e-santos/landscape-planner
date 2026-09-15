import { describe, expect, it } from 'vitest'
import {
  createFlatTerrainEntity,
  type TerrainLinearConstraint,
  type TerrainRetainingWall,
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
  linearConstraints: readonly TerrainLinearConstraint[] = [],
  retainingWalls: readonly TerrainRetainingWall[] = [],
): TerrainEntity {
  return {
    id: 'terrain.fixture',
    kind: 'terrain',
    name: 'Fixture',
    spotElevations,
    linearConstraints,
    retainingWalls,
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

  it('accepts grade-break, ridge, and swale polylines by spot ID', () => {
    const spots = [
      createSpot('spot.a', 0, 0),
      createSpot('spot.b', 2, 0),
      createSpot('spot.c', 0, 2),
    ]
    const constraints: TerrainLinearConstraint[] = [
      {
        id: 'constraint.grade-break',
        name: 'Grade break',
        role: 'gradeBreak',
        spotElevationIds: ['spot.a', 'spot.b'],
        source: { kind: 'survey' },
      },
      {
        id: 'constraint.ridge',
        name: 'Ridge',
        role: 'ridge',
        spotElevationIds: ['spot.b', 'spot.c'],
        source: { kind: 'user' },
      },
      {
        id: 'constraint.swale',
        name: 'Swale',
        role: 'swale',
        spotElevationIds: ['spot.c', 'spot.a'],
        source: { kind: 'estimated' },
      },
    ]

    expect(validateTerrain(createTerrain(spots, constraints))).toEqual([])
  })

  it('reports invalid linear-constraint identities and spot references', () => {
    const spots = [
      createSpot('spot.a', 0, 0),
      createSpot('spot.b', 2, 0),
      createSpot('spot.c', 0, 2),
    ]
    const createConstraint = (
      id: string,
      spotElevationIds: readonly string[],
    ): TerrainLinearConstraint => ({
      id,
      name: 'Constraint',
      role: 'gradeBreak',
      spotElevationIds,
      source: { kind: 'user' },
    })
    const issueCodes = validateTerrain(
      createTerrain(spots, [
        createConstraint('', ['spot.a']),
        createConstraint('constraint.same', ['spot.a', 'spot.missing']),
        createConstraint('constraint.same', ['spot.b', 'spot.b']),
      ]),
    ).map(({ code }) => code)

    expect(issueCodes).toEqual([
      'empty-constraint-id',
      'insufficient-constraint-points',
      'missing-constraint-spot',
      'duplicate-constraint-id',
      'repeated-constraint-spot',
    ])
  })

  it('rejects crossing constraints without a shared spot', () => {
    const spots = [
      createSpot('spot.southwest', -1, -1),
      createSpot('spot.southeast', 1, -1),
      createSpot('spot.northeast', 1, 1),
      createSpot('spot.northwest', -1, 1),
    ]
    const constraints: TerrainLinearConstraint[] = [
      {
        id: 'constraint.first',
        name: 'First diagonal',
        role: 'gradeBreak',
        spotElevationIds: ['spot.southwest', 'spot.northeast'],
        source: { kind: 'user' },
      },
      {
        id: 'constraint.second',
        name: 'Second diagonal',
        role: 'swale',
        spotElevationIds: ['spot.southeast', 'spot.northwest'],
        source: { kind: 'user' },
      },
    ]

    expect(validateTerrain(createTerrain(spots, constraints))).toEqual([
      expect.objectContaining({
        code: 'intersecting-constraints',
        constraintIds: ['constraint.first', 'constraint.second'],
      }),
    ])
  })

  it('accepts corresponding upper and lower retaining-wall profiles', () => {
    const spots = [
      createSpot('spot.a', -2, -2),
      createSpot('spot.b', 2, -2),
      createSpot('spot.c', 0, 2),
    ]
    const wall: TerrainRetainingWall = {
      id: 'wall.test',
      name: 'Test wall',
      upperProfile: [
        { id: 'wall.upper.1', eastMeters: -1, northMeters: 0, elevationMeters: 2 },
        { id: 'wall.upper.2', eastMeters: 1, northMeters: 0, elevationMeters: 2 },
      ],
      lowerProfile: [
        { id: 'wall.lower.1', eastMeters: -1, northMeters: 0, elevationMeters: 0 },
        { id: 'wall.lower.2', eastMeters: 1, northMeters: 0, elevationMeters: 0 },
      ],
      upperSide: 'left',
      source: { kind: 'survey' },
      uncertainty: { horizontalMeters: 0.01, verticalMeters: 0.005 },
    }

    expect(validateTerrain(createTerrain(spots, [], [wall]))).toEqual([])
  })

  it('rejects misaligned or inverted retaining-wall profiles', () => {
    const spots = [
      createSpot('spot.a', -2, -2),
      createSpot('spot.b', 2, -2),
      createSpot('spot.c', 0, 2),
    ]
    const wall: TerrainRetainingWall = {
      id: 'wall.invalid',
      name: 'Invalid wall',
      upperProfile: [
        { id: 'wall.upper.1', eastMeters: -1, northMeters: 0, elevationMeters: 0 },
        { id: 'wall.upper.2', eastMeters: 1, northMeters: 0, elevationMeters: 1 },
      ],
      lowerProfile: [
        { id: 'wall.lower.1', eastMeters: -1, northMeters: 0, elevationMeters: 1 },
        { id: 'wall.lower.2', eastMeters: 1, northMeters: 1, elevationMeters: 0 },
      ],
      upperSide: 'right',
      source: { kind: 'user' },
      uncertainty: { horizontalMeters: 0.1, verticalMeters: 0.05 },
    }
    const issueCodes = validateTerrain(createTerrain(spots, [], [wall])).map(
      ({ code }) => code,
    )

    expect(issueCodes).toEqual([
      'misaligned-retaining-wall-profiles',
      'invalid-retaining-wall-height',
    ])
  })
})
