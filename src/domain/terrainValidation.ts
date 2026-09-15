import type { SpotElevation, TerrainEntity } from './terrain'

export type TerrainValidationIssue =
  | {
      readonly code: 'insufficient-points'
      readonly severity: 'warning'
      readonly message: string
    }
  | {
      readonly code:
        | 'empty-id'
        | 'duplicate-id'
        | 'non-finite-position'
        | 'non-finite-elevation'
        | 'invalid-uncertainty'
        | 'duplicate-position'
        | 'collinear-points'
      readonly severity: 'error'
      readonly message: string
      readonly spotElevationIds: readonly string[]
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

  return issues
}
