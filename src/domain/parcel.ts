export interface ParcelPoint {
  eastMeters: number
  northMeters: number
}

export interface ParcelGeometry {
  vertices: readonly ParcelPoint[]
  uncertaintyMeters: number
}

export interface ParcelBounds {
  minEastMeters: number
  maxEastMeters: number
  minNorthMeters: number
  maxNorthMeters: number
}

export function createRectangleVertices(
  eastWestMeters: number,
  northSouthMeters: number,
): ParcelPoint[] {
  const halfWidth = eastWestMeters / 2
  const halfDepth = northSouthMeters / 2

  return [
    { eastMeters: -halfWidth, northMeters: -halfDepth },
    { eastMeters: halfWidth, northMeters: -halfDepth },
    { eastMeters: halfWidth, northMeters: halfDepth },
    { eastMeters: -halfWidth, northMeters: halfDepth },
  ]
}

export function getParcelBounds(
  vertices: readonly ParcelPoint[],
): ParcelBounds {
  if (vertices.length === 0) {
    return {
      minEastMeters: 0,
      maxEastMeters: 0,
      minNorthMeters: 0,
      maxNorthMeters: 0,
    }
  }

  return vertices.reduce<ParcelBounds>(
    (bounds, vertex) => ({
      minEastMeters: Math.min(bounds.minEastMeters, vertex.eastMeters),
      maxEastMeters: Math.max(bounds.maxEastMeters, vertex.eastMeters),
      minNorthMeters: Math.min(bounds.minNorthMeters, vertex.northMeters),
      maxNorthMeters: Math.max(bounds.maxNorthMeters, vertex.northMeters),
    }),
    {
      minEastMeters: vertices[0].eastMeters,
      maxEastMeters: vertices[0].eastMeters,
      minNorthMeters: vertices[0].northMeters,
      maxNorthMeters: vertices[0].northMeters,
    },
  )
}

export function insertParcelMidpoint(
  vertices: readonly ParcelPoint[],
  afterIndex: number,
): ParcelPoint[] {
  if (vertices.length < 2) {
    return [...vertices]
  }

  const nextIndex = (afterIndex + 1) % vertices.length
  const current = vertices[afterIndex]
  const next = vertices[nextIndex]
  const midpoint: ParcelPoint = {
    eastMeters: (current.eastMeters + next.eastMeters) / 2,
    northMeters: (current.northMeters + next.northMeters) / 2,
  }

  return [
    ...vertices.slice(0, afterIndex + 1),
    midpoint,
    ...vertices.slice(afterIndex + 1),
  ]
}
