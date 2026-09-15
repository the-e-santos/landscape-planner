import {
  getTerrainLinearConstraints,
  getTerrainRetainingWalls,
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
  readonly retainingWallId?: string
  readonly retainingWallProfilePointId?: string
  readonly retainingWallProfile?: 'upper' | 'lower'
  readonly eastMeters: number
  readonly northMeters: number
  readonly elevationMeters: number
}

export type TerrainTriangle = readonly [number, number, number]

export interface DerivedTerrainMesh {
  /** Input vertices are sorted deterministically; lower wall copies follow. */
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
  constraints: readonly TerrainLinearConstraint[],
): TerrainMeshIssue | undefined {
  const vertexBySpotId = new Map(
    sortedSpots.map((spot, index) => [spot.id, index] as const),
  )
  const lockedEdges = new Set<string>()
  const sortedConstraints = [...constraints].sort(compareConstraints)

  for (const constraint of sortedConstraints) {
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

interface WallVertexBinding {
  readonly wallId: string
  readonly lowerPointId: string
  readonly lowerElevationMeters: number
}

function squaredDistanceToSegment(
  point: WorkingVertex,
  start: WorkingVertex,
  end: WorkingVertex,
): number {
  const eastSpan = end.eastMeters - start.eastMeters
  const northSpan = end.northMeters - start.northMeters
  const lengthSquared = eastSpan * eastSpan + northSpan * northSpan
  const parameter = Math.max(
    0,
    Math.min(
      1,
      ((point.eastMeters - start.eastMeters) * eastSpan +
        (point.northMeters - start.northMeters) * northSpan) /
        lengthSquared,
    ),
  )
  const closestEast = start.eastMeters + eastSpan * parameter
  const closestNorth = start.northMeters + northSpan * parameter
  const eastDistance = point.eastMeters - closestEast
  const northDistance = point.northMeters - closestNorth
  return eastDistance * eastDistance + northDistance * northDistance
}

function snapTerrainTrianglesToRetainingWalls(
  triangles: readonly TerrainTriangle[],
  vertices: TerrainMeshVertex[],
  terrain: TerrainEntity,
  vertexByInputId: ReadonlyMap<string, number>,
): TerrainTriangle[] {
  let snappedTriangles = triangles.map(
    (triangle) => [...triangle] as [number, number, number],
  )

  ;[...getTerrainRetainingWalls(terrain)]
    .sort((left, right) =>
      left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
    )
    .forEach((wall) => {
      const bindings = new Map<number, WallVertexBinding>()
      wall.upperProfile.forEach((upper, index) => {
        bindings.set(vertexByInputId.get(upper.id)!, {
          wallId: wall.id,
          lowerPointId: wall.lowerProfile[index].id,
          lowerElevationMeters: wall.lowerProfile[index].elevationMeters,
        })
      })
      const lowerVertexByUpperVertex = new Map<number, number>()

      snappedTriangles = snappedTriangles.map((triangle) => {
        if (!triangle.some((vertexIndex) => bindings.has(vertexIndex))) {
          return triangle
        }

        const centroid = {
          eastMeters:
            triangle.reduce(
              (sum, vertexIndex) => sum + vertices[vertexIndex].eastMeters,
              0,
            ) / 3,
          northMeters:
            triangle.reduce(
              (sum, vertexIndex) => sum + vertices[vertexIndex].northMeters,
              0,
            ) / 3,
        }
        let closestSegmentIndex = 0
        let closestDistance = Number.POSITIVE_INFINITY
        for (let index = 0; index < wall.upperProfile.length - 1; index += 1) {
          const distance = squaredDistanceToSegment(
            centroid,
            wall.upperProfile[index],
            wall.upperProfile[index + 1],
          )
          if (distance < closestDistance) {
            closestDistance = distance
            closestSegmentIndex = index
          }
        }
        const start = wall.upperProfile[closestSegmentIndex]
        const end = wall.upperProfile[closestSegmentIndex + 1]
        const side = signedDoubleArea(start, end, centroid)
        const isUpperSide = wall.upperSide === 'left' ? side > 0 : side < 0

        if (isUpperSide) {
          return triangle
        }

        return triangle.map((vertexIndex) => {
          const binding = bindings.get(vertexIndex)
          if (!binding) {
            return vertexIndex
          }

          const existingLowerIndex = lowerVertexByUpperVertex.get(vertexIndex)
          if (existingLowerIndex !== undefined) {
            return existingLowerIndex
          }

          const upperVertex = vertices[vertexIndex]
          const lowerIndex = vertices.length
          vertices.push({
            eastMeters: upperVertex.eastMeters,
            northMeters: upperVertex.northMeters,
            elevationMeters: binding.lowerElevationMeters,
            retainingWallId: binding.wallId,
            retainingWallProfilePointId: binding.lowerPointId,
            retainingWallProfile: 'lower',
          })
          lowerVertexByUpperVertex.set(vertexIndex, lowerIndex)
          return lowerIndex
        }) as [number, number, number]
      })
    })

  return snappedTriangles
}

export function deriveTerrainMesh(terrain: TerrainEntity): TerrainMeshResult {
  const issues = validateTerrain(terrain)

  if (issues.length > 0) {
    return { ok: false, issues }
  }

  const wallPointBindings = new Map<
    string,
    { readonly wallId: string; readonly pointId: string }
  >()
  const wallSpots: SpotElevation[] = getTerrainRetainingWalls(terrain).flatMap(
    (wall) =>
      wall.upperProfile.map((point) => {
        wallPointBindings.set(point.id, { wallId: wall.id, pointId: point.id })
        return {
          ...point,
          source: wall.source,
          uncertainty: wall.uncertainty,
        }
      }),
  )
  const sortedSpots = [...terrain.spotElevations, ...wallSpots].sort(compareSpots)
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
  const wallConstraints: TerrainLinearConstraint[] = getTerrainRetainingWalls(
    terrain,
  ).map((wall) => ({
    id: `retaining-wall:${wall.id}`,
    name: wall.name,
    role: 'gradeBreak',
    spotElevationIds: wall.upperProfile.map(({ id }) => id),
    source: wall.source,
  }))
  const constraintIssue = enforceLinearConstraints(
    triangles,
    vertices,
    sortedSpots,
    [...getTerrainLinearConstraints(terrain), ...wallConstraints],
  )
  if (constraintIssue) {
    return { ok: false, issues: [constraintIssue] }
  }

  const derivedVertices: TerrainMeshVertex[] = sortedSpots.map((spot) => {
    const wallBinding = wallPointBindings.get(spot.id)
    return {
      ...(wallBinding
        ? {
            retainingWallId: wallBinding.wallId,
            retainingWallProfilePointId: wallBinding.pointId,
            retainingWallProfile: 'upper' as const,
          }
        : { spotElevationId: spot.id }),
      eastMeters: spot.eastMeters,
      northMeters: spot.northMeters,
      elevationMeters: spot.elevationMeters,
    }
  })
  const vertexByInputId = new Map(
    sortedSpots.map((spot, index) => [spot.id, index] as const),
  )
  const derivedTriangles = snapTerrainTrianglesToRetainingWalls(
    triangles.map(rotateSmallestIndexFirst).sort(compareTriangles),
    derivedVertices,
    terrain,
    vertexByInputId,
  )
    .map(({ 0: a, 1: b, 2: c }) => rotateSmallestIndexFirst({ a, b, c }))
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
