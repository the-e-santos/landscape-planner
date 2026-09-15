import type { SpotElevation, TerrainEntity } from './terrain'
import {
  validateTerrain,
  type TerrainValidationIssue,
} from './terrainValidation'

export interface TerrainMeshVertex {
  /** Present when this vertex is an authoritative spot rather than a clip point. */
  readonly spotElevationId?: string
  readonly eastMeters: number
  readonly northMeters: number
  readonly elevationMeters: number
}

export type TerrainTriangle = readonly [number, number, number]

export interface DerivedTerrainMesh {
  /** Sorted by source coordinates and ID for deterministic indexing. */
  readonly vertices: readonly TerrainMeshVertex[]
  /** Counter-clockwise in east/north coordinates, producing +Y-facing surfaces. */
  readonly triangles: readonly TerrainTriangle[]
}

export type TerrainMeshResult =
  | { readonly ok: true; readonly mesh: DerivedTerrainMesh }
  | {
      readonly ok: false
      readonly issues: readonly TerrainValidationIssue[]
    }

interface WorkingVertex {
  readonly eastMeters: number
  readonly northMeters: number
}

interface WorkingTriangle {
  readonly a: number
  readonly b: number
  readonly c: number
}

interface BoundaryEdge {
  readonly a: number
  readonly b: number
  count: number
}

function compareSpots(left: SpotElevation, right: SpotElevation): number {
  const coordinateOrder =
    left.eastMeters - right.eastMeters ||
    left.northMeters - right.northMeters

  if (coordinateOrder !== 0) {
    return coordinateOrder
  }

  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
}

function signedDoubleArea(
  a: WorkingVertex,
  b: WorkingVertex,
  c: WorkingVertex,
): number {
  return (
    (b.eastMeters - a.eastMeters) * (c.northMeters - a.northMeters) -
    (b.northMeters - a.northMeters) * (c.eastMeters - a.eastMeters)
  )
}

function createCounterClockwiseTriangle(
  a: number,
  b: number,
  c: number,
  vertices: readonly WorkingVertex[],
): WorkingTriangle | undefined {
  const area = signedDoubleArea(vertices[a], vertices[b], vertices[c])

  if (area === 0) {
    return undefined
  }

  return area > 0 ? { a, b, c } : { a: b, b: a, c }
}

function circumcircleContains(
  triangle: WorkingTriangle,
  point: WorkingVertex,
  vertices: readonly WorkingVertex[],
): boolean {
  const a = vertices[triangle.a]
  const b = vertices[triangle.b]
  const c = vertices[triangle.c]
  const ax = a.eastMeters - point.eastMeters
  const ay = a.northMeters - point.northMeters
  const bx = b.eastMeters - point.eastMeters
  const by = b.northMeters - point.northMeters
  const cx = c.eastMeters - point.eastMeters
  const cy = c.northMeters - point.northMeters
  const determinant =
    (ax * ax + ay * ay) * (bx * cy - cx * by) -
    (bx * bx + by * by) * (ax * cy - cx * ay) +
    (cx * cx + cy * cy) * (ax * by - bx * ay)

  return determinant > 0
}

function addBoundaryEdge(
  edges: Map<string, BoundaryEdge>,
  a: number,
  b: number,
): void {
  const low = Math.min(a, b)
  const high = Math.max(a, b)
  const key = `${low}:${high}`
  const existing = edges.get(key)

  if (existing) {
    existing.count += 1
  } else {
    edges.set(key, { a, b, count: 1 })
  }
}

function rotateSmallestIndexFirst(
  triangle: WorkingTriangle,
): TerrainTriangle {
  const { a, b, c } = triangle

  if (a <= b && a <= c) {
    return [a, b, c]
  }
  if (b <= a && b <= c) {
    return [b, c, a]
  }
  return [c, a, b]
}

function compareTriangles(
  left: TerrainTriangle,
  right: TerrainTriangle,
): number {
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2]
}

export function deriveTerrainMesh(terrain: TerrainEntity): TerrainMeshResult {
  const issues = validateTerrain(terrain)

  if (issues.length > 0) {
    return { ok: false, issues }
  }

  const sortedSpots = [...terrain.spotElevations].sort(compareSpots)
  const vertices: WorkingVertex[] = sortedSpots.map(
    ({ eastMeters, northMeters }) => ({ eastMeters, northMeters }),
  )
  const minEast = vertices[0].eastMeters
  const maxEast = vertices.at(-1)!.eastMeters
  const minNorth = Math.min(...vertices.map(({ northMeters }) => northMeters))
  const maxNorth = Math.max(...vertices.map(({ northMeters }) => northMeters))
  const span = Math.max(maxEast - minEast, maxNorth - minNorth)
  const centerEast = (minEast + maxEast) / 2
  const centerNorth = (minNorth + maxNorth) / 2
  const superTriangleStart = vertices.length

  vertices.push(
    {
      eastMeters: centerEast - 20 * span,
      northMeters: centerNorth - span,
    },
    {
      eastMeters: centerEast + 20 * span,
      northMeters: centerNorth - span,
    },
    {
      eastMeters: centerEast,
      northMeters: centerNorth + 20 * span,
    },
  )

  let triangles: WorkingTriangle[] = [
    {
      a: superTriangleStart,
      b: superTriangleStart + 1,
      c: superTriangleStart + 2,
    },
  ]

  sortedSpots.forEach((_, pointIndex) => {
    const badTriangles = triangles.filter((triangle) =>
      circumcircleContains(triangle, vertices[pointIndex], vertices),
    )
    const badTriangleSet = new Set(badTriangles)
    const boundaryEdges = new Map<string, BoundaryEdge>()

    badTriangles.forEach(({ a, b, c }) => {
      addBoundaryEdge(boundaryEdges, a, b)
      addBoundaryEdge(boundaryEdges, b, c)
      addBoundaryEdge(boundaryEdges, c, a)
    })

    triangles = triangles.filter((triangle) => !badTriangleSet.has(triangle))

    boundaryEdges.forEach((edge) => {
      if (edge.count !== 1) {
        return
      }

      const triangle = createCounterClockwiseTriangle(
        edge.a,
        edge.b,
        pointIndex,
        vertices,
      )
      if (triangle) {
        triangles.push(triangle)
      }
    })
  })

  const derivedVertices = sortedSpots.map((spot) => ({
    spotElevationId: spot.id,
    eastMeters: spot.eastMeters,
    northMeters: spot.northMeters,
    elevationMeters: spot.elevationMeters,
  }))
  const derivedTriangles = triangles
    .filter(
      ({ a, b, c }) =>
        a < superTriangleStart &&
        b < superTriangleStart &&
        c < superTriangleStart,
    )
    .map(rotateSmallestIndexFirst)
    .sort(compareTriangles)

  return {
    ok: true,
    mesh: {
      vertices: derivedVertices,
      triangles: derivedTriangles,
    },
  }
}

export function projectedTriangleAreaSquareMeters(
  mesh: DerivedTerrainMesh,
  triangle: TerrainTriangle,
): number {
  return Math.abs(
    signedDoubleArea(
      mesh.vertices[triangle[0]],
      mesh.vertices[triangle[1]],
      mesh.vertices[triangle[2]],
    ) / 2,
  )
}
