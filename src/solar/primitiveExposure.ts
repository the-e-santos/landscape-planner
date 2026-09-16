import type { LandscapeProject } from '../domain/project'
import type {
  PolygonExtrusionPoint,
  PrimitiveEntity,
  Rotation3,
} from '../domain/primitive'
import { createDirectPointSolarEvaluator } from './pointSolar'
import type {
  ExposureDisplayChannel,
  InstantSolarHeatmapSettings,
} from './terrainExposure'

export interface LocalSurfaceVertex {
  readonly position: Vector3
  readonly normal: Vector3
}

export interface PrimitiveExposureVertex extends LocalSurfaceVertex {
  readonly directIrradianceWattsPerSquareMeter: number
  readonly diffuseIrradianceWattsPerSquareMeter: number
  readonly totalIrradianceWattsPerSquareMeter: number
}

export interface PrimitiveExposureLayer {
  readonly entityId: string
  readonly vertices: readonly PrimitiveExposureVertex[]
  readonly triangles: readonly (readonly [number, number, number])[]
  readonly spacingMeters: number
  readonly scaleMaximumIrradianceWattsPerSquareMeter: number
  readonly displayChannel: ExposureDisplayChannel
}

interface Vector3 {
  readonly x: number
  readonly y: number
  readonly z: number
}

interface SurfaceMesh {
  readonly vertices: LocalSurfaceVertex[]
  readonly triangles: [number, number, number][]
}

function addRectangularSurface(
  mesh: SurfaceMesh,
  center: Vector3,
  uDirection: Vector3,
  vDirection: Vector3,
  uLength: number,
  vLength: number,
  normal: Vector3,
  spacingMeters: number,
): void {
  const uDivisions = Math.max(1, Math.ceil(uLength / spacingMeters))
  const vDivisions = Math.max(1, Math.ceil(vLength / spacingMeters))
  const start = mesh.vertices.length
  for (let vIndex = 0; vIndex <= vDivisions; vIndex += 1) {
    const v = vIndex / vDivisions - 0.5
    for (let uIndex = 0; uIndex <= uDivisions; uIndex += 1) {
      const u = uIndex / uDivisions - 0.5
      mesh.vertices.push({
        position: {
          x: center.x + uDirection.x * uLength * u + vDirection.x * vLength * v,
          y: center.y + uDirection.y * uLength * u + vDirection.y * vLength * v,
          z: center.z + uDirection.z * uLength * u + vDirection.z * vLength * v,
        },
        normal,
      })
    }
  }
  const stride = uDivisions + 1
  for (let vIndex = 0; vIndex < vDivisions; vIndex += 1) {
    for (let uIndex = 0; uIndex < uDivisions; uIndex += 1) {
      const a = start + vIndex * stride + uIndex
      const b = a + 1
      const c = a + stride
      const d = c + 1
      mesh.triangles.push([a, b, c], [b, d, c])
    }
  }
}

function addBoxSurfaces(
  mesh: SurfaceMesh,
  width: number,
  height: number,
  depth: number,
  spacing: number,
): void {
  addRectangularSurface(mesh, { x: width / 2, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 1, z: 0 }, depth, height, { x: 1, y: 0, z: 0 }, spacing)
  addRectangularSurface(mesh, { x: -width / 2, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 }, depth, height, { x: -1, y: 0, z: 0 }, spacing)
  addRectangularSurface(mesh, { x: 0, y: height / 2, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, width, depth, { x: 0, y: 1, z: 0 }, spacing)
  addRectangularSurface(mesh, { x: 0, y: -height / 2, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, width, depth, { x: 0, y: -1, z: 0 }, spacing)
  addRectangularSurface(mesh, { x: 0, y: 0, z: depth / 2 }, { x: -1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, width, height, { x: 0, y: 0, z: 1 }, spacing)
  addRectangularSurface(mesh, { x: 0, y: 0, z: -depth / 2 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, width, height, { x: 0, y: 0, z: -1 }, spacing)
}

function addCylinderSurfaces(
  mesh: SurfaceMesh,
  radius: number,
  height: number,
  spacing: number,
): void {
  // Match or exceed the 32 radial segments of the rendered cylinder. A coarser
  // overlay cuts inside that mesh and appears as alternating visible bands.
  const around = Math.max(32, Math.ceil(2 * Math.PI * radius / spacing))
  const vertical = Math.max(1, Math.ceil(height / spacing))
  const sideStart = mesh.vertices.length
  for (let yIndex = 0; yIndex <= vertical; yIndex += 1) {
    const y = height * (yIndex / vertical - 0.5)
    for (let angleIndex = 0; angleIndex <= around; angleIndex += 1) {
      const angle = angleIndex / around * Math.PI * 2
      const x = Math.cos(angle)
      const z = Math.sin(angle)
      mesh.vertices.push({
        position: { x: radius * x, y, z: radius * z },
        normal: { x, y: 0, z },
      })
    }
  }
  const stride = around + 1
  for (let yIndex = 0; yIndex < vertical; yIndex += 1) {
    for (let angleIndex = 0; angleIndex < around; angleIndex += 1) {
      const a = sideStart + yIndex * stride + angleIndex
      const b = a + 1
      const c = a + stride
      mesh.triangles.push([a, b, c], [b, c + 1, c])
    }
  }
  const rings = Math.max(1, Math.ceil(radius / spacing))
  for (const side of [-1, 1] as const) {
    const centerIndex = mesh.vertices.length
    const normal = { x: 0, y: side, z: 0 }
    mesh.vertices.push({ position: { x: 0, y: side * height / 2, z: 0 }, normal })
    let previousRing: number[] = []
    for (let ring = 1; ring <= rings; ring += 1) {
      const ringIndices: number[] = []
      for (let angleIndex = 0; angleIndex < around; angleIndex += 1) {
        const angle = angleIndex / around * Math.PI * 2
        ringIndices.push(mesh.vertices.length)
        mesh.vertices.push({
          position: {
            x: radius * ring / rings * Math.cos(angle),
            y: side * height / 2,
            z: radius * ring / rings * Math.sin(angle),
          },
          normal,
        })
      }
      if (ring === 1) {
        for (let index = 0; index < around; index += 1) {
          mesh.triangles.push([centerIndex, ringIndices[index], ringIndices[(index + 1) % around]])
        }
      } else {
        for (let index = 0; index < around; index += 1) {
          const next = (index + 1) % around
          mesh.triangles.push(
            [previousRing[index], ringIndices[index], previousRing[next]],
            [ringIndices[index], ringIndices[next], previousRing[next]],
          )
        }
      }
      previousRing = ringIndices
    }
  }
}

function addEllipsoidSurface(
  mesh: SurfaceMesh,
  radii: Vector3,
  spacing: number,
): void {
  const latitudeDivisions = Math.max(
    16,
    Math.ceil(Math.PI * Math.max(radii.x, radii.y, radii.z) / spacing),
  )
  const longitudeDivisions = Math.max(
    32,
    Math.ceil(2 * Math.PI * Math.max(radii.x, radii.z) / spacing),
  )
  const start = mesh.vertices.length
  for (let latitude = 0; latitude <= latitudeDivisions; latitude += 1) {
    const phi = latitude / latitudeDivisions * Math.PI
    for (let longitude = 0; longitude <= longitudeDivisions; longitude += 1) {
      const theta = longitude / longitudeDivisions * Math.PI * 2
      const position = {
        x: radii.x * Math.sin(phi) * Math.cos(theta),
        y: radii.y * Math.cos(phi),
        z: radii.z * Math.sin(phi) * Math.sin(theta),
      }
      const rawNormal = {
        x: position.x / radii.x ** 2,
        y: position.y / radii.y ** 2,
        z: position.z / radii.z ** 2,
      }
      const length = Math.hypot(rawNormal.x, rawNormal.y, rawNormal.z)
      mesh.vertices.push({
        position,
        normal: {
          x: rawNormal.x / length,
          y: rawNormal.y / length,
          z: rawNormal.z / length,
        },
      })
    }
  }
  const stride = longitudeDivisions + 1
  for (let latitude = 0; latitude < latitudeDivisions; latitude += 1) {
    for (let longitude = 0; longitude < longitudeDivisions; longitude += 1) {
      const a = start + latitude * stride + longitude
      const b = a + 1
      const c = a + stride
      mesh.triangles.push([a, b, c], [b, c + 1, c])
    }
  }
}

function signedArea(a: PolygonExtrusionPoint, b: PolygonExtrusionPoint, c: PolygonExtrusionPoint): number {
  return (b.eastMeters - a.eastMeters) * (c.northMeters - a.northMeters) -
    (b.northMeters - a.northMeters) * (c.eastMeters - a.eastMeters)
}

function pointInTriangle(
  point: PolygonExtrusionPoint,
  a: PolygonExtrusionPoint,
  b: PolygonExtrusionPoint,
  c: PolygonExtrusionPoint,
): boolean {
  const first = signedArea(a, b, point)
  const second = signedArea(b, c, point)
  const third = signedArea(c, a, point)
  return first >= 0 && second >= 0 && third >= 0
}

function triangulatePolygon(footprint: readonly PolygonExtrusionPoint[]): [number, number, number][] {
  const remaining = footprint.map((_, index) => index)
  const triangles: [number, number, number][] = []
  while (remaining.length > 3) {
    let clipped = false
    for (let index = 0; index < remaining.length; index += 1) {
      const previous = remaining[(index - 1 + remaining.length) % remaining.length]
      const current = remaining[index]
      const next = remaining[(index + 1) % remaining.length]
      if (signedArea(footprint[previous], footprint[current], footprint[next]) <= 0) continue
      if (remaining.some((candidate) =>
        candidate !== previous && candidate !== current && candidate !== next &&
        pointInTriangle(
          footprint[candidate],
          footprint[previous],
          footprint[current],
          footprint[next],
        )
      )) continue
      triangles.push([previous, current, next])
      remaining.splice(index, 1)
      clipped = true
      break
    }
    if (!clipped) throw new Error('Could not triangulate polygon extrusion')
  }
  triangles.push([remaining[0], remaining[1], remaining[2]])
  return triangles
}

function addTriangleSurface(
  mesh: SurfaceMesh,
  points: readonly [Vector3, Vector3, Vector3],
  normal: Vector3,
  spacing: number,
): void {
  const edgeLength = (a: Vector3, b: Vector3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
  const divisions = Math.max(1, Math.ceil(Math.max(
    edgeLength(points[0], points[1]),
    edgeLength(points[1], points[2]),
    edgeLength(points[2], points[0]),
  ) / spacing))
  const indices = new Map<string, number>()
  const at = (bStep: number, cStep: number) => {
    const key = `${bStep}:${cStep}`
    const existing = indices.get(key)
    if (existing !== undefined) return existing
    const bWeight = bStep / divisions
    const cWeight = cStep / divisions
    const aWeight = 1 - bWeight - cWeight
    const index = mesh.vertices.length
    mesh.vertices.push({
      position: {
        x: points[0].x * aWeight + points[1].x * bWeight + points[2].x * cWeight,
        y: points[0].y * aWeight + points[1].y * bWeight + points[2].y * cWeight,
        z: points[0].z * aWeight + points[1].z * bWeight + points[2].z * cWeight,
      },
      normal,
    })
    indices.set(key, index)
    return index
  }
  for (let bStep = 0; bStep < divisions; bStep += 1) {
    for (let cStep = 0; cStep < divisions - bStep; cStep += 1) {
      mesh.triangles.push([at(bStep, cStep), at(bStep + 1, cStep), at(bStep, cStep + 1)])
      if (bStep + cStep < divisions - 1) {
        mesh.triangles.push([at(bStep + 1, cStep), at(bStep + 1, cStep + 1), at(bStep, cStep + 1)])
      }
    }
  }
}

function addPolygonExtrusionSurfaces(
  mesh: SurfaceMesh,
  footprint: readonly PolygonExtrusionPoint[],
  height: number,
  spacing: number,
): void {
  const polygonTriangles = triangulatePolygon(footprint)
  for (const triangle of polygonTriangles) {
    const top = triangle.map((index) => ({
      x: footprint[index].eastMeters,
      y: height / 2,
      z: -footprint[index].northMeters,
    })) as unknown as [Vector3, Vector3, Vector3]
    const bottom = top.map((point) => ({ ...point, y: -height / 2 })) as [Vector3, Vector3, Vector3]
    addTriangleSurface(mesh, top, { x: 0, y: 1, z: 0 }, spacing)
    addTriangleSurface(mesh, bottom, { x: 0, y: -1, z: 0 }, spacing)
  }
  for (let index = 0; index < footprint.length; index += 1) {
    const start = footprint[index]
    const end = footprint[(index + 1) % footprint.length]
    const deltaEast = end.eastMeters - start.eastMeters
    const deltaNorth = end.northMeters - start.northMeters
    const length = Math.hypot(deltaEast, deltaNorth)
    addRectangularSurface(
      mesh,
      {
        x: (start.eastMeters + end.eastMeters) / 2,
        y: 0,
        z: -(start.northMeters + end.northMeters) / 2,
      },
      { x: deltaEast / length, y: 0, z: -deltaNorth / length },
      { x: 0, y: 1, z: 0 },
      length,
      height,
      { x: deltaNorth / length, y: 0, z: deltaEast / length },
      spacing,
    )
  }
}

export function samplePrimitiveSurface(
  entity: PrimitiveEntity,
  spacingMeters: number,
): SurfaceMesh {
  if (!Number.isFinite(spacingMeters) || spacingMeters <= 0) {
    throw new Error('Surface spacing must be a positive finite number')
  }
  const mesh: SurfaceMesh = { vertices: [], triangles: [] }
  const geometry = entity.geometry
  switch (geometry.kind) {
    case 'box':
      addBoxSurfaces(mesh, geometry.widthMeters, geometry.heightMeters, geometry.depthMeters, spacingMeters)
      break
    case 'wall':
      addBoxSurfaces(mesh, geometry.lengthMeters, geometry.heightMeters, geometry.thicknessMeters, spacingMeters)
      break
    case 'cylinder':
      addCylinderSurfaces(mesh, geometry.radiusMeters, geometry.heightMeters, spacingMeters)
      break
    case 'canopy':
      addEllipsoidSurface(mesh, {
        x: geometry.eastRadiusMeters,
        y: geometry.verticalRadiusMeters,
        z: geometry.northRadiusMeters,
      }, spacingMeters)
      break
    case 'polygonExtrusion':
      addPolygonExtrusionSurfaces(mesh, geometry.footprint, geometry.heightMeters, spacingMeters)
      break
  }
  return mesh
}

function rotate(vector: Vector3, rotation: Rotation3): Vector3 {
  const a = Math.cos(rotation.xRadians)
  const b = Math.sin(rotation.xRadians)
  const c = Math.cos(rotation.yRadians)
  const d = Math.sin(rotation.yRadians)
  const e = Math.cos(rotation.zRadians)
  const f = Math.sin(rotation.zRadians)
  return {
    x: c * e * vector.x - c * f * vector.y + d * vector.z,
    y: (a * f + b * e * d) * vector.x + (a * e - b * f * d) * vector.y - b * c * vector.z,
    z: (b * f - a * e * d) * vector.x + (b * e + a * f * d) * vector.y + a * c * vector.z,
  }
}

export function generatePrimitiveExposureLayer(
  project: LandscapeProject,
  entity: PrimitiveEntity,
  settings: Extract<InstantSolarHeatmapSettings, { readonly enabled: true }>,
): PrimitiveExposureLayer {
  const sampled = samplePrimitiveSurface(entity, settings.spacingMeters)
  const center = {
    x: entity.transform.position.eastMeters,
    y: entity.transform.position.elevationMeters,
    z: -entity.transform.position.northMeters,
  }
  const evaluatePoint = createDirectPointSolarEvaluator(
    project,
    settings.solarPosition,
    settings.directNormalIrradianceWattsPerSquareMeter,
  )
  const vertices = sampled.vertices.map((vertex): PrimitiveExposureVertex => {
    const rotatedPosition = rotate(vertex.position, entity.transform.rotation)
    const worldNormal = rotate(vertex.normal, entity.transform.rotation)
    const result = evaluatePoint({
        eastMeters: center.x + rotatedPosition.x + worldNormal.x * 1e-4,
        elevationMeters: center.y + rotatedPosition.y + worldNormal.y * 1e-4,
        northMeters: -(center.z + rotatedPosition.z + worldNormal.z * 1e-4),
        normal: { east: worldNormal.x, up: worldNormal.y, north: -worldNormal.z },
        owningEntityId: entity.id,
    })
    return {
      ...vertex,
      directIrradianceWattsPerSquareMeter: result.directIrradianceWattsPerSquareMeter,
      diffuseIrradianceWattsPerSquareMeter: 0,
      totalIrradianceWattsPerSquareMeter: result.directIrradianceWattsPerSquareMeter,
    }
  })
  return {
    entityId: entity.id,
    vertices,
    triangles: sampled.triangles,
    spacingMeters: settings.spacingMeters,
    scaleMaximumIrradianceWattsPerSquareMeter:
      settings.directNormalIrradianceWattsPerSquareMeter,
    displayChannel: settings.displayChannel,
  }
}
