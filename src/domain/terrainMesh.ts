import {
  getTerrainLinearConstraints,
  type SpotElevation,
  type TerrainEntity,
  type TerrainLinearConstraint,
} from './terrain'
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
      readonly issues: readonly TerrainMeshIssue[]
    }

export type TerrainMeshIssue =
  | TerrainValidationIssue
  | {
      readonly code: 'constraint-insertion-failed'
      readonly severity: 'error'
      readonly message: string
      readonly constraintIds: readonly string[]
      readonly spotElevationIds: readonly string[]
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

interface MeshEdge {
  readonly a: number
  readonly b: number
  readonly triangleIndices: number[]
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

function edgeKey(a: number, b: number): string {
  return `${Math.min(a, b)}:${Math.max(a, b)}`
}

function triangleEdges({ a, b, c }: WorkingTriangle) {
  return [
    [a, b],
    [b, c],
    [c, a],
  ] as const
}

function buildMeshEdges(triangles: readonly WorkingTriangle[]): Map<string, MeshEdge> {
  const edges = new Map<string, MeshEdge>()

  triangles.forEach((triangle, triangleIndex) => {
    triangleEdges(triangle).forEach(([a, b]) => {
      const key = edgeKey(a, b)
      const existing = edges.get(key)
      if (existing) {
        existing.triangleIndices.push(triangleIndex)
      } else {
        edges.set(key, { a, b, triangleIndices: [triangleIndex] })
      }
    })
  })

  return edges
}

function segmentsProperlyIntersect(
  a: WorkingVertex,
  b: WorkingVertex,
  c: WorkingVertex,
  d: WorkingVertex,
): boolean {
  const abc = signedDoubleArea(a, b, c)
  const abd = signedDoubleArea(a, b, d)
  const cda = signedDoubleArea(c, d, a)
  const cdb = signedDoubleArea(c, d, b)

  return (
    ((abc > 0 && abd < 0) || (abc < 0 && abd > 0)) &&
    ((cda > 0 && cdb < 0) || (cda < 0 && cdb > 0))
  )
}

function oppositeVertex(
  triangle: WorkingTriangle,
  edgeA: number,
  edgeB: number,
): number {
  return [triangle.a, triangle.b, triangle.c].find(
    (index) => index !== edgeA && index !== edgeB,
  )!
}

function pointParameterOnSegment(
  point: WorkingVertex,
  start: WorkingVertex,
  end: WorkingVertex,
): number {
  const eastSpan = end.eastMeters - start.eastMeters
  const northSpan = end.northMeters - start.northMeters

  return Math.abs(eastSpan) >= Math.abs(northSpan)
    ? (point.eastMeters - start.eastMeters) / eastSpan
    : (point.northMeters - start.northMeters) / northSpan
}

function splitConstraintSegment(
  startIndex: number,
  endIndex: number,
  vertices: readonly WorkingVertex[],
  vertexCount: number,
): number[] {
  const start = vertices[startIndex]
  const end = vertices[endIndex]
  const interior = vertices
    .slice(0, vertexCount)
    .map((point, index) => ({
      index,
      area: signedDoubleArea(start, end, point),
      parameter: pointParameterOnSegment(point, start, end),
    }))
    .filter(
      ({ index, area, parameter }) =>
        index !== startIndex &&
        index !== endIndex &&
        area === 0 &&
        parameter > 0 &&
        parameter < 1,
    )
    .sort((left, right) => left.parameter - right.parameter || left.index - right.index)

  return [startIndex, ...interior.map(({ index }) => index), endIndex]
}

function insertConstraintEdge(
  triangles: WorkingTriangle[],
  vertices: readonly WorkingVertex[],
  startIndex: number,
  endIndex: number,
  lockedEdges: ReadonlySet<string>,
): boolean {
  const targetKey = edgeKey(startIndex, endIndex)
  const maximumFlips = Math.max(triangles.length * triangles.length * 2, 1)

  for (let flipCount = 0; flipCount <= maximumFlips; flipCount += 1) {
    const edges = buildMeshEdges(triangles)
    if (edges.has(targetKey)) {
      return true
    }

    const crossingEdges = [...edges.entries()]
      .filter(
        ([key, edge]) =>
          !lockedEdges.has(key) &&
          edge.triangleIndices.length === 2 &&
          segmentsProperlyIntersect(
            vertices[startIndex],
            vertices[endIndex],
            vertices[edge.a],
            vertices[edge.b],
          ),
      )
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))

    let flipped = false
    for (const [, edge] of crossingEdges) {
      const [firstTriangleIndex, secondTriangleIndex] = edge.triangleIndices
      const firstTriangle = triangles[firstTriangleIndex]
      const secondTriangle = triangles[secondTriangleIndex]
      const firstOpposite = oppositeVertex(firstTriangle, edge.a, edge.b)
      const secondOpposite = oppositeVertex(secondTriangle, edge.a, edge.b)

      if (
        !segmentsProperlyIntersect(
          vertices[firstOpposite],
          vertices[secondOpposite],
          vertices[edge.a],
          vertices[edge.b],
        )
      ) {
        continue
      }

      const firstReplacement = createCounterClockwiseTriangle(
        firstOpposite,
        secondOpposite,
        edge.a,
        vertices,
      )
      const secondReplacement = createCounterClockwiseTriangle(
        secondOpposite,
        firstOpposite,
        edge.b,
        vertices,
      )

      if (firstReplacement && secondReplacement) {
        triangles[firstTriangleIndex] = firstReplacement
        triangles[secondTriangleIndex] = secondReplacement
        flipped = true
        break
      }
    }

    if (!flipped) {
      return false
    }
  }

  return false
}

function compareConstraints(
  left: TerrainLinearConstraint,
  right: TerrainLinearConstraint,
): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
}

function enforceLinearConstraints(
  triangles: WorkingTriangle[],
  vertices: readonly WorkingVertex[],
  sortedSpots: readonly SpotElevation[],
  terrain: TerrainEntity,
): TerrainMeshIssue | undefined {
  const vertexBySpotId = new Map(
    sortedSpots.map((spot, index) => [spot.id, index] as const),
  )
  const lockedEdges = new Set<string>()
  const constraints = [...getTerrainLinearConstraints(terrain)].sort(
    compareConstraints,
  )

  for (const constraint of constraints) {
    for (let index = 0; index < constraint.spotElevationIds.length - 1; index += 1) {
      const startId = constraint.spotElevationIds[index]
      const endId = constraint.spotElevationIds[index + 1]
      const startIndex = vertexBySpotId.get(startId)!
      const endIndex = vertexBySpotId.get(endId)!
      const chain = splitConstraintSegment(
        startIndex,
        endIndex,
        vertices,
        sortedSpots.length,
      )

      for (let chainIndex = 0; chainIndex < chain.length - 1; chainIndex += 1) {
        const edgeStart = chain[chainIndex]
        const edgeEnd = chain[chainIndex + 1]
        if (
          !insertConstraintEdge(
            triangles,
            vertices,
            edgeStart,
            edgeEnd,
            lockedEdges,
          )
        ) {
          return {
            code: 'constraint-insertion-failed',
            severity: 'error',
            message: `Could not insert terrain constraint ${constraint.id}.`,
            constraintIds: [constraint.id],
            spotElevationIds: [startId, endId],
          }
        }
        lockedEdges.add(edgeKey(edgeStart, edgeEnd))
      }
    }
  }

  return undefined
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

  triangles = triangles.filter(
    ({ a, b, c }) =>
      a < superTriangleStart &&
      b < superTriangleStart &&
      c < superTriangleStart,
  )
  const constraintIssue = enforceLinearConstraints(
    triangles,
    vertices,
    sortedSpots,
    terrain,
  )
  if (constraintIssue) {
    return { ok: false, issues: [constraintIssue] }
  }

  const derivedVertices = sortedSpots.map((spot) => ({
    spotElevationId: spot.id,
    eastMeters: spot.eastMeters,
    northMeters: spot.northMeters,
    elevationMeters: spot.elevationMeters,
  }))
  const derivedTriangles = triangles
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
