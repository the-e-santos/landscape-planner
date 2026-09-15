import type { ParcelPoint } from './parcel'
import type {
  DerivedTerrainMesh,
  TerrainMeshVertex,
  TerrainTriangle,
} from './terrainMesh'

export const TERRAIN_CLIP_COORDINATE_EPSILON_METERS = 1e-9
export const TERRAIN_CLIP_AREA_EPSILON_SQUARE_METERS = 1e-10

export interface TerrainClipIssue {
  readonly code: 'invalid-parcel-boundary'
  readonly message: string
}

export type TerrainClipResult =
  | { readonly ok: true; readonly mesh: DerivedTerrainMesh }
  | { readonly ok: false; readonly issue: TerrainClipIssue }

type Polygon = readonly ParcelPoint[]

function signedDoubleArea(a: ParcelPoint, b: ParcelPoint, c: ParcelPoint) {
  return (
    (b.eastMeters - a.eastMeters) * (c.northMeters - a.northMeters) -
    (b.northMeters - a.northMeters) * (c.eastMeters - a.eastMeters)
  )
}

function polygonSignedDoubleArea(polygon: Polygon): number {
  return polygon.reduce((area, point, index) => {
    const next = polygon[(index + 1) % polygon.length]
    return area + point.eastMeters * next.northMeters - next.eastMeters * point.northMeters
  }, 0)
}

function pointsMatch(a: ParcelPoint, b: ParcelPoint): boolean {
  return (
    Math.abs(a.eastMeters - b.eastMeters) <=
      TERRAIN_CLIP_COORDINATE_EPSILON_METERS &&
    Math.abs(a.northMeters - b.northMeters) <=
      TERRAIN_CLIP_COORDINATE_EPSILON_METERS
  )
}

function pointIsOnSegment(
  point: ParcelPoint,
  start: ParcelPoint,
  end: ParcelPoint,
): boolean {
  if (
    Math.abs(signedDoubleArea(start, end, point)) >
    TERRAIN_CLIP_AREA_EPSILON_SQUARE_METERS
  ) {
    return false
  }

  return (
    point.eastMeters >=
      Math.min(start.eastMeters, end.eastMeters) -
        TERRAIN_CLIP_COORDINATE_EPSILON_METERS &&
    point.eastMeters <=
      Math.max(start.eastMeters, end.eastMeters) +
        TERRAIN_CLIP_COORDINATE_EPSILON_METERS &&
    point.northMeters >=
      Math.min(start.northMeters, end.northMeters) -
        TERRAIN_CLIP_COORDINATE_EPSILON_METERS &&
    point.northMeters <=
      Math.max(start.northMeters, end.northMeters) +
        TERRAIN_CLIP_COORDINATE_EPSILON_METERS
  )
}

function removeRedundantVertices(vertices: readonly ParcelPoint[]): ParcelPoint[] {
  let result = [...vertices]
  let removed = true

  while (removed && result.length > 3) {
    removed = false
    result = result.filter((point, index, points) => {
      const previous = points[(index - 1 + points.length) % points.length]
      const next = points[(index + 1) % points.length]
      const redundant = pointIsOnSegment(point, previous, next)
      removed ||= redundant
      return !redundant
    })
  }

  return result
}

function segmentsIntersect(
  a: ParcelPoint,
  b: ParcelPoint,
  c: ParcelPoint,
  d: ParcelPoint,
): boolean {
  const abc = signedDoubleArea(a, b, c)
  const abd = signedDoubleArea(a, b, d)
  const cda = signedDoubleArea(c, d, a)
  const cdb = signedDoubleArea(c, d, b)
  const epsilon = TERRAIN_CLIP_AREA_EPSILON_SQUARE_METERS

  if (
    ((abc > epsilon && abd < -epsilon) ||
      (abc < -epsilon && abd > epsilon)) &&
    ((cda > epsilon && cdb < -epsilon) ||
      (cda < -epsilon && cdb > epsilon))
  ) {
    return true
  }

  return (
    (Math.abs(abc) <= epsilon && pointIsOnSegment(c, a, b)) ||
    (Math.abs(abd) <= epsilon && pointIsOnSegment(d, a, b)) ||
    (Math.abs(cda) <= epsilon && pointIsOnSegment(a, c, d)) ||
    (Math.abs(cdb) <= epsilon && pointIsOnSegment(b, c, d))
  )
}

function boundaryIsSimple(polygon: Polygon): boolean {
  for (let first = 0; first < polygon.length; first += 1) {
    const firstNext = (first + 1) % polygon.length
    for (let second = first + 1; second < polygon.length; second += 1) {
      const secondNext = (second + 1) % polygon.length
      const adjacent =
        first === second ||
        firstNext === second ||
        secondNext === first

      if (
        !adjacent &&
        segmentsIntersect(
          polygon[first],
          polygon[firstNext],
          polygon[second],
          polygon[secondNext],
        )
      ) {
        return false
      }
    }
  }

  return true
}

function normalizeBoundary(vertices: readonly ParcelPoint[]): ParcelPoint[] | undefined {
  if (
    vertices.length < 3 ||
    vertices.some(
      ({ eastMeters, northMeters }) =>
        !Number.isFinite(eastMeters) || !Number.isFinite(northMeters),
    )
  ) {
    return undefined
  }

  const withoutClosingDuplicate =
    vertices.length > 3 && pointsMatch(vertices[0], vertices.at(-1)!)
      ? vertices.slice(0, -1)
      : [...vertices]
  const polygon = removeRedundantVertices(withoutClosingDuplicate)

  if (
    polygon.length < 3 ||
    Math.abs(polygonSignedDoubleArea(polygon)) <=
      TERRAIN_CLIP_AREA_EPSILON_SQUARE_METERS ||
    polygon.some((point, index) =>
      polygon.some(
        (other, otherIndex) => index !== otherIndex && pointsMatch(point, other),
      ),
    ) ||
    !boundaryIsSimple(polygon)
  ) {
    return undefined
  }

  if (polygonSignedDoubleArea(polygon) < 0) {
    polygon.reverse()
  }

  let firstIndex = 0
  polygon.forEach((point, index) => {
    const first = polygon[firstIndex]
    if (
      point.eastMeters < first.eastMeters ||
      (point.eastMeters === first.eastMeters &&
        point.northMeters < first.northMeters)
    ) {
      firstIndex = index
    }
  })

  return [...polygon.slice(firstIndex), ...polygon.slice(0, firstIndex)]
}

function pointIsInTriangle(
  point: ParcelPoint,
  a: ParcelPoint,
  b: ParcelPoint,
  c: ParcelPoint,
): boolean {
  const epsilon = TERRAIN_CLIP_AREA_EPSILON_SQUARE_METERS
  return (
    signedDoubleArea(a, b, point) >= -epsilon &&
    signedDoubleArea(b, c, point) >= -epsilon &&
    signedDoubleArea(c, a, point) >= -epsilon
  )
}

function isConvex(polygon: Polygon): boolean {
  return polygon.every(
    (point, index) =>
      signedDoubleArea(
        point,
        polygon[(index + 1) % polygon.length],
        polygon[(index + 2) % polygon.length],
      ) >= -TERRAIN_CLIP_AREA_EPSILON_SQUARE_METERS,
  )
}

function triangulateBoundary(polygon: Polygon): Polygon[] | undefined {
  if (isConvex(polygon)) {
    return [polygon]
  }

  const remaining = polygon.map((_, index) => index)
  const triangles: Polygon[] = []

  while (remaining.length > 3) {
    let earPosition = -1

    for (let position = 0; position < remaining.length; position += 1) {
      const previousIndex = remaining[(position - 1 + remaining.length) % remaining.length]
      const currentIndex = remaining[position]
      const nextIndex = remaining[(position + 1) % remaining.length]
      const a = polygon[previousIndex]
      const b = polygon[currentIndex]
      const c = polygon[nextIndex]

      if (
        signedDoubleArea(a, b, c) <=
        TERRAIN_CLIP_AREA_EPSILON_SQUARE_METERS
      ) {
        continue
      }

      const containsAnotherPoint = remaining.some(
        (candidateIndex) =>
          candidateIndex !== previousIndex &&
          candidateIndex !== currentIndex &&
          candidateIndex !== nextIndex &&
          pointIsInTriangle(polygon[candidateIndex], a, b, c),
      )

      if (!containsAnotherPoint) {
        earPosition = position
        triangles.push([a, b, c])
        break
      }
    }

    if (earPosition < 0) {
      return undefined
    }
    remaining.splice(earPosition, 1)
  }

  triangles.push(remaining.map((index) => polygon[index]))
  return triangles
}

function interpolateAtClipEdge(
  start: TerrainMeshVertex,
  end: TerrainMeshVertex,
  clipStart: ParcelPoint,
  clipEnd: ParcelPoint,
): TerrainMeshVertex {
  const segmentEast = end.eastMeters - start.eastMeters
  const segmentNorth = end.northMeters - start.northMeters
  const clipEast = clipEnd.eastMeters - clipStart.eastMeters
  const clipNorth = clipEnd.northMeters - clipStart.northMeters
  const denominator = segmentEast * clipNorth - segmentNorth * clipEast
  const offsetEast = clipStart.eastMeters - start.eastMeters
  const offsetNorth = clipStart.northMeters - start.northMeters
  const unclamped =
    (offsetEast * clipNorth - offsetNorth * clipEast) / denominator
  const fraction = Math.max(0, Math.min(1, unclamped))

  return {
    eastMeters: start.eastMeters + segmentEast * fraction,
    northMeters: start.northMeters + segmentNorth * fraction,
    elevationMeters:
      start.elevationMeters +
      (end.elevationMeters - start.elevationMeters) * fraction,
    ...(fraction <= TERRAIN_CLIP_COORDINATE_EPSILON_METERS
      ? { spotElevationId: start.spotElevationId }
      : fraction >= 1 - TERRAIN_CLIP_COORDINATE_EPSILON_METERS
        ? { spotElevationId: end.spotElevationId }
        : {}),
  }
}

function removeConsecutiveDuplicates(
  vertices: readonly TerrainMeshVertex[],
): TerrainMeshVertex[] {
  const result = vertices.filter(
    (vertex, index) => index === 0 || !pointsMatch(vertex, vertices[index - 1]),
  )

  if (result.length > 1 && pointsMatch(result[0], result.at(-1)!)) {
    result.pop()
  }
  return result
}

function clipToConvexPolygon(
  subject: readonly TerrainMeshVertex[],
  clipPolygon: Polygon,
): TerrainMeshVertex[] {
  let output = [...subject]

  clipPolygon.forEach((clipStart, index) => {
    const clipEnd = clipPolygon[(index + 1) % clipPolygon.length]
    const input = output
    output = []

    if (input.length === 0) {
      return
    }

    input.forEach((end, inputIndex) => {
      const start = input[(inputIndex - 1 + input.length) % input.length]
      const startInside =
        signedDoubleArea(clipStart, clipEnd, start) >=
        -TERRAIN_CLIP_AREA_EPSILON_SQUARE_METERS
      const endInside =
        signedDoubleArea(clipStart, clipEnd, end) >=
        -TERRAIN_CLIP_AREA_EPSILON_SQUARE_METERS

      if (endInside) {
        if (!startInside) {
          output.push(interpolateAtClipEdge(start, end, clipStart, clipEnd))
        }
        output.push(end)
      } else if (startInside) {
        output.push(interpolateAtClipEdge(start, end, clipStart, clipEnd))
      }
    })

    output = removeConsecutiveDuplicates(output)
  })

  return output
}

export function clipTerrainMeshToParcel(
  mesh: DerivedTerrainMesh,
  boundaryVertices: readonly ParcelPoint[],
): TerrainClipResult {
  const boundary = normalizeBoundary(boundaryVertices)
  const clipRegions = boundary && triangulateBoundary(boundary)

  if (!boundary || !clipRegions) {
    return {
      ok: false,
      issue: {
        code: 'invalid-parcel-boundary',
        message: 'Terrain clipping requires a finite, simple parcel polygon.',
      },
    }
  }

  const vertices: TerrainMeshVertex[] = []
  const triangles: TerrainTriangle[] = []

  mesh.triangles.forEach((triangle) => {
    const terrainTriangle = triangle.map((index) => mesh.vertices[index])

    clipRegions.forEach((clipRegion) => {
      const polygon = clipToConvexPolygon(terrainTriangle, clipRegion)

      if (
        polygon.length < 3 ||
        Math.abs(polygonSignedDoubleArea(polygon)) <=
          TERRAIN_CLIP_AREA_EPSILON_SQUARE_METERS
      ) {
        return
      }

      const firstIndex = vertices.length
      vertices.push(...polygon)
      for (let index = 1; index < polygon.length - 1; index += 1) {
        triangles.push([firstIndex, firstIndex + index, firstIndex + index + 1])
      }
    })
  })

  return { ok: true, mesh: { vertices, triangles } }
}
