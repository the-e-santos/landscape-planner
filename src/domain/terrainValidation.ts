import {
  getTerrainLinearConstraints,
  getTerrainRetainingWalls,
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
    | 'empty-retaining-wall-id'
    | 'duplicate-retaining-wall-id'
    | 'insufficient-retaining-wall-points'
    | 'mismatched-retaining-wall-profiles'
    | 'invalid-retaining-wall-point'
    | 'duplicate-retaining-wall-point-id'
    | 'misaligned-retaining-wall-profiles'
    | 'invalid-retaining-wall-height'
    | 'invalid-retaining-wall-segment'
    | 'invalid-retaining-wall-uncertainty'
    | 'retaining-wall-point-id-conflict'
    | 'retaining-wall-position-conflict'
    | 'retaining-wall-segment-point-conflict'
    | 'intersecting-retaining-wall-constraint'
    | 'intersecting-retaining-walls'
  readonly severity: 'warning' | 'error'
  readonly message: string
  readonly spotElevationIds?: readonly string[]
  readonly constraintIds?: readonly string[]
  readonly retainingWallIds?: readonly string[]
}

interface PlanPoint {
  readonly eastMeters: number
  readonly northMeters: number
}

function positionKey(spot: PlanPoint): string {
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

interface PlanSegment {
  readonly start: PlanPoint
  readonly end: PlanPoint
}

interface ConstraintSegment extends PlanSegment {
  readonly constraintId: string
  readonly startId: string
  readonly endId: string
  readonly start: SpotElevation
  readonly end: SpotElevation
}

interface WallSegment extends PlanSegment {
  readonly retainingWallId: string
  readonly segmentIndex: number
  readonly start: PlanPoint
  readonly end: PlanPoint
}

function pointIsOnSegment(
  point: PlanPoint,
  start: PlanPoint,
  end: PlanPoint,
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
  first: PlanSegment,
  second: PlanSegment,
): boolean {
  const orientation = (
    a: PlanPoint,
    b: PlanPoint,
    c: PlanPoint,
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

  const retainingWallIds = new Set<string>()
  const terrainSpotIds = new Set(ids)
  const terrainPositions = new Map(positions)
  const retainingWallPointIds = new Set<string>()
  const retainingWallPositions = new Map<string, string>()
  const retainingWallSegments: WallSegment[] = []
  getTerrainRetainingWalls(terrain).forEach((wall) => {
    if (wall.id.trim().length === 0) {
      issues.push({
        code: 'empty-retaining-wall-id',
        severity: 'error',
        message: 'A retaining wall has an empty ID.',
        retainingWallIds: [wall.id],
      })
    } else if (retainingWallIds.has(wall.id)) {
      issues.push({
        code: 'duplicate-retaining-wall-id',
        severity: 'error',
        message: `Retaining wall ID is duplicated: ${wall.id}`,
        retainingWallIds: [wall.id],
      })
    }
    retainingWallIds.add(wall.id)

    if (
      !Number.isFinite(wall.uncertainty.horizontalMeters) ||
      !Number.isFinite(wall.uncertainty.verticalMeters) ||
      wall.uncertainty.horizontalMeters < 0 ||
      wall.uncertainty.verticalMeters < 0
    ) {
      issues.push({
        code: 'invalid-retaining-wall-uncertainty',
        severity: 'error',
        message: `Retaining wall ${wall.id} must have finite, non-negative uncertainty.`,
        retainingWallIds: [wall.id],
      })
    }

    if (wall.upperProfile.length < 2 || wall.lowerProfile.length < 2) {
      issues.push({
        code: 'insufficient-retaining-wall-points',
        severity: 'error',
        message: `Retaining wall ${wall.id} needs at least two upper and lower profile points.`,
        retainingWallIds: [wall.id],
      })
    }

    if (wall.upperProfile.length !== wall.lowerProfile.length) {
      issues.push({
        code: 'mismatched-retaining-wall-profiles',
        severity: 'error',
        message: `Retaining wall ${wall.id} upper and lower profiles must have the same number of points.`,
        retainingWallIds: [wall.id],
      })
    }

    const pointIds = new Set<string>()
    const profilePoints = [...wall.upperProfile, ...wall.lowerProfile]
    const hasInvalidPoint = profilePoints.some((point) => {
      const invalid =
        point.id.trim().length === 0 ||
        !Number.isFinite(point.eastMeters) ||
        !Number.isFinite(point.northMeters) ||
        !Number.isFinite(point.elevationMeters)
      return invalid
    })
    if (hasInvalidPoint) {
      issues.push({
        code: 'invalid-retaining-wall-point',
        severity: 'error',
        message: `Retaining wall ${wall.id} profile points need non-empty IDs and finite coordinates.`,
        retainingWallIds: [wall.id],
      })
    }

    const hasDuplicatePointId = profilePoints.some((point) => {
      if (pointIds.has(point.id)) {
        return true
      }
      pointIds.add(point.id)
      return false
    })
    if (hasDuplicatePointId) {
      issues.push({
        code: 'duplicate-retaining-wall-point-id',
        severity: 'error',
        message: `Retaining wall ${wall.id} profile point IDs must be unique.`,
        retainingWallIds: [wall.id],
      })
    }

    const conflictingPointIds = new Set<string>()
    profilePoints.forEach((point) => {
      if (terrainSpotIds.has(point.id) || retainingWallPointIds.has(point.id)) {
        conflictingPointIds.add(point.id)
      }
      retainingWallPointIds.add(point.id)
    })
    if (conflictingPointIds.size > 0) {
      issues.push({
        code: 'retaining-wall-point-id-conflict',
        severity: 'error',
        message: `Retaining wall ${wall.id} profile point IDs must be unique across the terrain.`,
        retainingWallIds: [wall.id],
        spotElevationIds: [...conflictingPointIds],
      })
    }

    const conflictingPositions = new Set<string>()
    wall.upperProfile.forEach((point) => {
      if (!Number.isFinite(point.eastMeters) || !Number.isFinite(point.northMeters)) {
        return
      }
      const key = positionKey(point)
      const existingId =
        terrainPositions.get(key) ?? retainingWallPositions.get(key)
      if (existingId !== undefined) {
        conflictingPositions.add(existingId)
        conflictingPositions.add(point.id)
      } else {
        retainingWallPositions.set(key, point.id)
      }
    })
    if (conflictingPositions.size > 0) {
      issues.push({
        code: 'retaining-wall-position-conflict',
        severity: 'error',
        message: `Retaining wall ${wall.id} stations cannot share plan positions with terrain spots or other walls.`,
        retainingWallIds: [wall.id],
        spotElevationIds: [...conflictingPositions],
      })
    }

    if (wall.upperProfile.length === wall.lowerProfile.length) {
      const profilesAreMisaligned = wall.upperProfile.some((upper, index) => {
        const lower = wall.lowerProfile[index]
        return (
          upper.eastMeters !== lower.eastMeters ||
          upper.northMeters !== lower.northMeters
        )
      })
      if (profilesAreMisaligned) {
        issues.push({
          code: 'misaligned-retaining-wall-profiles',
          severity: 'error',
          message: `Retaining wall ${wall.id} corresponding upper and lower points must share plan coordinates.`,
          retainingWallIds: [wall.id],
        })
      }

      const hasInvertedHeight = wall.upperProfile.some(
        (upper, index) =>
          Number.isFinite(upper.elevationMeters) &&
          Number.isFinite(wall.lowerProfile[index].elevationMeters) &&
          upper.elevationMeters < wall.lowerProfile[index].elevationMeters,
      )
      const hasPositiveHeight = wall.upperProfile.some(
        (upper, index) =>
          Number.isFinite(upper.elevationMeters) &&
          Number.isFinite(wall.lowerProfile[index].elevationMeters) &&
          upper.elevationMeters > wall.lowerProfile[index].elevationMeters,
      )
      if (hasInvertedHeight || !hasPositiveHeight) {
        issues.push({
          code: 'invalid-retaining-wall-height',
          severity: 'error',
          message: `Retaining wall ${wall.id} upper elevations must stay at or above the lower profile and differ somewhere.`,
          retainingWallIds: [wall.id],
        })
      }

      const hasZeroLengthSegment = wall.upperProfile.some((upper, index) => {
        const next = wall.upperProfile[index + 1]
        return (
          next !== undefined &&
          upper.eastMeters === next.eastMeters &&
          upper.northMeters === next.northMeters
        )
      })
      if (hasZeroLengthSegment) {
        issues.push({
          code: 'invalid-retaining-wall-segment',
          severity: 'error',
          message: `Retaining wall ${wall.id} cannot repeat consecutive plan positions.`,
          retainingWallIds: [wall.id],
        })
      }

      const spotsOnWall = new Set<string>()
      wall.upperProfile.forEach((start, index) => {
        const end = wall.upperProfile[index + 1]
        if (!end) {
          return
        }
        retainingWallSegments.push({
          retainingWallId: wall.id,
          segmentIndex: index,
          start,
          end,
        })
        terrain.spotElevations.forEach((spot) => {
          if (pointIsOnSegment(spot, start, end)) {
            spotsOnWall.add(spot.id)
          }
        })
      })
      if (spotsOnWall.size > 0) {
        issues.push({
          code: 'retaining-wall-segment-point-conflict',
          severity: 'error',
          message: `Retaining wall ${wall.id} cannot pass through an ordinary terrain spot.`,
          retainingWallIds: [wall.id],
          spotElevationIds: [...spotsOnWall],
        })
      }
    }
  })

  retainingWallSegments.forEach((wallSegment) => {
    constraintSegments.forEach((constraintSegment) => {
      if (segmentsIntersect(wallSegment, constraintSegment)) {
        issues.push({
          code: 'intersecting-retaining-wall-constraint',
          severity: 'error',
          message:
            'A retaining wall and terrain line cannot cross or overlap.',
          retainingWallIds: [wallSegment.retainingWallId],
          constraintIds: [constraintSegment.constraintId],
        })
      }
    })
  })

  retainingWallSegments.forEach((first, firstIndex) => {
    retainingWallSegments.slice(firstIndex + 1).forEach((second) => {
      const adjacentSegments =
        first.retainingWallId === second.retainingWallId &&
        Math.abs(first.segmentIndex - second.segmentIndex) === 1
      if (!adjacentSegments && segmentsIntersect(first, second)) {
        issues.push({
          code: 'intersecting-retaining-walls',
          severity: 'error',
          message: 'Retaining-wall profiles cannot cross or overlap.',
          retainingWallIds: [
            ...new Set([first.retainingWallId, second.retainingWallId]),
          ],
        })
      }
    })
  })

  return issues
}
