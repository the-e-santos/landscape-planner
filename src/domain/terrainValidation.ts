import {
  getTerrainLinearConstraints,
  type SpotElevation,
  type TerrainEntity,
} from './terrain'

export interface TerrainValidationIssue {
  readonly code:
    | 'insufficient-points'
    | 'empty-id'
    | 'duplicate-id'
    | 'non-finite-position'
    | 'non-finite-elevation'
    | 'invalid-uncertainty'
    | 'duplicate-position'
    | 'collinear-points'
    | 'empty-constraint-id'
    | 'duplicate-constraint-id'
    | 'insufficient-constraint-points'
    | 'missing-constraint-spot'
    | 'repeated-constraint-spot'
    | 'intersecting-constraints'
  readonly severity: 'warning' | 'error'
  readonly message: string
  readonly spotElevationIds?: readonly string[]
  readonly constraintIds?: readonly string[]
}

function positionKey(spot: SpotElevation): string {
  return `${spot.eastMeters}\u0000${spot.northMeters}`
}

function areAllCollinear(spots: readonly SpotElevation[]): boolean {
  const first = spots[0]
  const second = spots.find(
    (spot) =>
      spot.eastMeters !== first.eastMeters ||
      spot.northMeters !== first.northMeters,
  )

  if (!second) {
    return true
  }

  const baselineEast = second.eastMeters - first.eastMeters
  const baselineNorth = second.northMeters - first.northMeters

  return spots.every((spot) => {
    const pointEast = spot.eastMeters - first.eastMeters
    const pointNorth = spot.northMeters - first.northMeters
    return baselineEast * pointNorth - baselineNorth * pointEast === 0
  })
}

interface ConstraintSegment {
  readonly constraintId: string
  readonly startId: string
  readonly endId: string
  readonly start: SpotElevation
  readonly end: SpotElevation
}

function pointIsOnSegment(
  point: SpotElevation,
  start: SpotElevation,
  end: SpotElevation,
): boolean {
  const cross =
    (end.eastMeters - start.eastMeters) *
      (point.northMeters - start.northMeters) -
    (end.northMeters - start.northMeters) *
      (point.eastMeters - start.eastMeters)

  return (
    cross === 0 &&
    point.eastMeters >= Math.min(start.eastMeters, end.eastMeters) &&
    point.eastMeters <= Math.max(start.eastMeters, end.eastMeters) &&
    point.northMeters >= Math.min(start.northMeters, end.northMeters) &&
    point.northMeters <= Math.max(start.northMeters, end.northMeters)
  )
}

function segmentsIntersect(
  first: ConstraintSegment,
  second: ConstraintSegment,
): boolean {
  const orientation = (
    a: SpotElevation,
    b: SpotElevation,
    c: SpotElevation,
  ) =>
    (b.eastMeters - a.eastMeters) * (c.northMeters - a.northMeters) -
    (b.northMeters - a.northMeters) * (c.eastMeters - a.eastMeters)
  const abc = orientation(first.start, first.end, second.start)
  const abd = orientation(first.start, first.end, second.end)
  const cda = orientation(second.start, second.end, first.start)
  const cdb = orientation(second.start, second.end, first.end)

  if (
    ((abc > 0 && abd < 0) || (abc < 0 && abd > 0)) &&
    ((cda > 0 && cdb < 0) || (cda < 0 && cdb > 0))
  ) {
    return true
  }

  return (
    (abc === 0 && pointIsOnSegment(second.start, first.start, first.end)) ||
    (abd === 0 && pointIsOnSegment(second.end, first.start, first.end)) ||
    (cda === 0 && pointIsOnSegment(first.start, second.start, second.end)) ||
    (cdb === 0 && pointIsOnSegment(first.end, second.start, second.end))
  )
}

export function validateTerrain(
  terrain: TerrainEntity,
): readonly TerrainValidationIssue[] {
  const issues: TerrainValidationIssue[] = []
  const ids = new Set<string>()
  const positions = new Map<string, string>()
  let positionsAreFinite = true
  let hasDuplicatePosition = false

  if (terrain.spotElevations.length < 3) {
    issues.push({
      code: 'insufficient-points',
      severity: 'warning',
      message: 'At least three spot elevations are needed to derive a surface.',
    })
  }

  terrain.spotElevations.forEach((spot) => {
    if (spot.id.trim().length === 0) {
      issues.push({
        code: 'empty-id',
        severity: 'error',
        message: 'A spot elevation has an empty ID.',
        spotElevationIds: [spot.id],
      })
    } else if (ids.has(spot.id)) {
      issues.push({
        code: 'duplicate-id',
        severity: 'error',
        message: `Spot elevation ID is duplicated: ${spot.id}`,
        spotElevationIds: [spot.id],
      })
    }
    ids.add(spot.id)

    if (!Number.isFinite(spot.eastMeters) || !Number.isFinite(spot.northMeters)) {
      positionsAreFinite = false
      issues.push({
        code: 'non-finite-position',
        severity: 'error',
        message: `Spot elevation ${spot.id} must have finite east and north coordinates.`,
        spotElevationIds: [spot.id],
      })
    } else {
      const key = positionKey(spot)
      const existingId = positions.get(key)
      if (existingId !== undefined) {
        hasDuplicatePosition = true
        issues.push({
          code: 'duplicate-position',
          severity: 'error',
          message: `Spot elevations ${existingId} and ${spot.id} occupy the same horizontal position.`,
          spotElevationIds: [existingId, spot.id],
        })
      } else {
        positions.set(key, spot.id)
      }
    }

    if (!Number.isFinite(spot.elevationMeters)) {
      issues.push({
        code: 'non-finite-elevation',
        severity: 'error',
        message: `Spot elevation ${spot.id} must have a finite elevation.`,
        spotElevationIds: [spot.id],
      })
    }

    const { horizontalMeters, verticalMeters } = spot.uncertainty
    if (
      !Number.isFinite(horizontalMeters) ||
      !Number.isFinite(verticalMeters) ||
      horizontalMeters < 0 ||
      verticalMeters < 0
    ) {
      issues.push({
        code: 'invalid-uncertainty',
        severity: 'error',
        message: `Spot elevation ${spot.id} must have finite, non-negative uncertainty.`,
        spotElevationIds: [spot.id],
      })
    }
  })

  if (
    terrain.spotElevations.length >= 3 &&
    positionsAreFinite &&
    !hasDuplicatePosition &&
    areAllCollinear(terrain.spotElevations)
  ) {
    issues.push({
      code: 'collinear-points',
      severity: 'error',
      message: 'Spot elevations must include three non-collinear positions.',
      spotElevationIds: terrain.spotElevations.map(({ id }) => id),
    })
  }

  const constraintIds = new Set<string>()
  const spotById = new Map(
    terrain.spotElevations.map((spot) => [spot.id, spot] as const),
  )
  const constraintSegments: ConstraintSegment[] = []
  getTerrainLinearConstraints(terrain).forEach((constraint) => {
    if (constraint.id.trim().length === 0) {
      issues.push({
        code: 'empty-constraint-id',
        severity: 'error',
        message: 'A terrain constraint has an empty ID.',
        constraintIds: [constraint.id],
      })
    } else if (constraintIds.has(constraint.id)) {
      issues.push({
        code: 'duplicate-constraint-id',
        severity: 'error',
        message: `Terrain constraint ID is duplicated: ${constraint.id}`,
        constraintIds: [constraint.id],
      })
    }
    constraintIds.add(constraint.id)

    if (constraint.spotElevationIds.length < 2) {
      issues.push({
        code: 'insufficient-constraint-points',
        severity: 'error',
        message: `Terrain constraint ${constraint.id} needs at least two spot elevations.`,
        constraintIds: [constraint.id],
        spotElevationIds: constraint.spotElevationIds,
      })
    }

    const referencedIds = new Set<string>()
    const repeatedIds = new Set<string>()
    const missingIds = new Set<string>()
    constraint.spotElevationIds.forEach((spotElevationId) => {
      if (referencedIds.has(spotElevationId)) {
        repeatedIds.add(spotElevationId)
      }
      referencedIds.add(spotElevationId)
      if (!ids.has(spotElevationId)) {
        missingIds.add(spotElevationId)
      }
    })

    if (missingIds.size > 0) {
      issues.push({
        code: 'missing-constraint-spot',
        severity: 'error',
        message: `Terrain constraint ${constraint.id} references missing spot elevations.`,
        constraintIds: [constraint.id],
        spotElevationIds: [...missingIds],
      })
    }

    if (repeatedIds.size > 0) {
      issues.push({
        code: 'repeated-constraint-spot',
        severity: 'error',
        message: `Terrain constraint ${constraint.id} repeats spot elevations.`,
        constraintIds: [constraint.id],
        spotElevationIds: [...repeatedIds],
      })
    }

    constraint.spotElevationIds.forEach((startId, index) => {
      const endId = constraint.spotElevationIds[index + 1]
      const start = spotById.get(startId)
      const end = endId === undefined ? undefined : spotById.get(endId)

      if (
        start &&
        end &&
        Number.isFinite(start.eastMeters) &&
        Number.isFinite(start.northMeters) &&
        Number.isFinite(end.eastMeters) &&
        Number.isFinite(end.northMeters)
      ) {
        constraintSegments.push({
          constraintId: constraint.id,
          startId,
          endId,
          start,
          end,
        })
      }
    })
  })

  constraintSegments.forEach((first, firstIndex) => {
    constraintSegments.slice(firstIndex + 1).forEach((second) => {
      const sharesEndpoint =
        first.startId === second.startId ||
        first.startId === second.endId ||
        first.endId === second.startId ||
        first.endId === second.endId

      if (!sharesEndpoint && segmentsIntersect(first, second)) {
        issues.push({
          code: 'intersecting-constraints',
          severity: 'error',
          message:
            'Terrain constraints may intersect only at a shared spot elevation.',
          constraintIds: [...new Set([first.constraintId, second.constraintId])],
          spotElevationIds: [
            first.startId,
            first.endId,
            second.startId,
            second.endId,
          ],
        })
      }
    })
  })

  return issues
}
