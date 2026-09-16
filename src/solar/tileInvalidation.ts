import type { PrimitiveEntity } from '../domain/primitive'

export interface ExposureTile {
  readonly id: string
  readonly minEastMeters: number
  readonly maxEastMeters: number
  readonly minNorthMeters: number
  readonly maxNorthMeters: number
  readonly minElevationMeters: number
  readonly maxElevationMeters: number
}

export interface ExposurePoint {
  readonly eastMeters: number
  readonly northMeters: number
  readonly elevationMeters: number
}

export interface Bounds3 {
  readonly minEastMeters: number
  readonly maxEastMeters: number
  readonly minNorthMeters: number
  readonly maxNorthMeters: number
  readonly minElevationMeters: number
  readonly maxElevationMeters: number
}

interface IlluminationDirection {
  readonly east: number
  readonly up: number
  readonly north: number
}

export const EXPOSURE_TILE_SIZE_METERS = 8

export function exposureTileIdAt(
  point: Pick<ExposurePoint, 'eastMeters' | 'northMeters'>,
  tileSizeMeters = EXPOSURE_TILE_SIZE_METERS,
): string {
  return `${Math.floor(point.eastMeters / tileSizeMeters)}:${
    Math.floor(point.northMeters / tileSizeMeters)
  }`
}

export function createExposureTiles(
  points: readonly ExposurePoint[],
  tileSizeMeters = EXPOSURE_TILE_SIZE_METERS,
): ExposureTile[] {
  if (!Number.isFinite(tileSizeMeters) || tileSizeMeters <= 0) {
    throw new Error('Exposure tile size must be positive')
  }
  const tiles = new Map<string, ExposureTile>()
  points.forEach((point) => {
    const eastIndex = Math.floor(point.eastMeters / tileSizeMeters)
    const northIndex = Math.floor(point.northMeters / tileSizeMeters)
    const id = exposureTileIdAt(point, tileSizeMeters)
    const existing = tiles.get(id)
    if (existing) {
      tiles.set(id, {
        ...existing,
        minElevationMeters: Math.min(
          existing.minElevationMeters,
          point.elevationMeters,
        ),
        maxElevationMeters: Math.max(
          existing.maxElevationMeters,
          point.elevationMeters,
        ),
      })
    } else {
      tiles.set(id, {
        id,
        minEastMeters: eastIndex * tileSizeMeters,
        maxEastMeters: (eastIndex + 1) * tileSizeMeters,
        minNorthMeters: northIndex * tileSizeMeters,
        maxNorthMeters: (northIndex + 1) * tileSizeMeters,
        minElevationMeters: point.elevationMeters,
        maxElevationMeters: point.elevationMeters,
      })
    }
  })
  return [...tiles.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  )
}

export function conservativePrimitiveBounds(entity: PrimitiveEntity): Bounds3 {
  const geometry = entity.geometry
  let radius: number
  switch (geometry.kind) {
    case 'box':
      radius = Math.hypot(
        geometry.widthMeters,
        geometry.heightMeters,
        geometry.depthMeters,
      ) / 2
      break
    case 'wall':
      radius = Math.hypot(
        geometry.lengthMeters,
        geometry.heightMeters,
        geometry.thicknessMeters,
      ) / 2
      break
    case 'cylinder':
      radius = Math.hypot(geometry.radiusMeters, geometry.heightMeters / 2)
      break
    case 'canopy':
      radius = Math.max(
        geometry.eastRadiusMeters,
        geometry.verticalRadiusMeters,
        geometry.northRadiusMeters,
      )
      break
    case 'polygonExtrusion':
      radius = Math.max(
        ...geometry.footprint.map((point) => Math.hypot(
          point.eastMeters,
          point.northMeters,
          geometry.heightMeters / 2,
        )),
      )
      break
  }
  const { position } = entity.transform
  return {
    minEastMeters: position.eastMeters - radius,
    maxEastMeters: position.eastMeters + radius,
    minNorthMeters: position.northMeters - radius,
    maxNorthMeters: position.northMeters + radius,
    minElevationMeters: position.elevationMeters - radius,
    maxElevationMeters: position.elevationMeters + radius,
  }
}

function intersectsPlanBounds(tile: ExposureTile, bounds: Bounds3): boolean {
  return tile.maxEastMeters >= bounds.minEastMeters &&
    tile.minEastMeters <= bounds.maxEastMeters &&
    tile.maxNorthMeters >= bounds.minNorthMeters &&
    tile.minNorthMeters <= bounds.maxNorthMeters
}

export function conservativelyInvalidatedTileIds(
  tiles: readonly ExposureTile[],
  changedBounds: readonly Bounds3[],
  directions: readonly IlluminationDirection[],
): Set<string> {
  if (changedBounds.length === 0) return new Set()
  if (directions.length === 0) {
    return new Set(
      tiles
        .filter((tile) => changedBounds.some((bounds) =>
          intersectsPlanBounds(tile, bounds),
        ))
        .map(({ id }) => id),
    )
  }
  const minimumSurfaceElevation = Math.min(
    ...tiles.map(({ minElevationMeters }) => minElevationMeters),
  )
  const dirty = new Set<string>()
  changedBounds.forEach((bounds) => {
    directions.forEach((direction) => {
      if (direction.up <= 1e-6) {
        tiles.forEach(({ id }) => dirty.add(id))
        return
      }
      const verticalTravel = Math.max(
        0,
        bounds.maxElevationMeters - minimumSurfaceElevation,
      )
      const eastShift = -direction.east / direction.up * verticalTravel
      const northShift = -direction.north / direction.up * verticalTravel
      const shadowBounds: Bounds3 = {
        minEastMeters: Math.min(
          bounds.minEastMeters,
          bounds.minEastMeters + eastShift,
        ),
        maxEastMeters: Math.max(
          bounds.maxEastMeters,
          bounds.maxEastMeters + eastShift,
        ),
        minNorthMeters: Math.min(
          bounds.minNorthMeters,
          bounds.minNorthMeters + northShift,
        ),
        maxNorthMeters: Math.max(
          bounds.maxNorthMeters,
          bounds.maxNorthMeters + northShift,
        ),
        minElevationMeters: minimumSurfaceElevation,
        maxElevationMeters: bounds.maxElevationMeters,
      }
      tiles.forEach((tile) => {
        if (intersectsPlanBounds(tile, shadowBounds)) dirty.add(tile.id)
      })
    })
  })
  return dirty
}
