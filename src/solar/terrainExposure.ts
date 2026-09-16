import type { ParcelGeometry } from '../domain/parcel'
import type { LandscapeProject } from '../domain/project'
import type { TerrainEntity } from '../domain/terrain'
import { clipTerrainMeshToParcel } from '../domain/terrainClipping'
import {
  deriveTerrainMesh,
  type TerrainMeshVertex,
} from '../domain/terrainMesh'
import {
  prepareSurfaceExposure,
  type ExposureDisplayChannel,
  type ExposureQuantity,
  type ExposureValues,
  type PreparedSurfaceExposure,
  type SolarHeatmapSettings,
} from './exposureSettings'

export interface TerrainExposureVertex extends TerrainMeshVertex {
  readonly exposure: ExposureValues
}

export interface TerrainExposureLayer {
  readonly vertices: readonly TerrainExposureVertex[]
  readonly triangles: readonly (readonly [number, number, number])[]
  readonly spacingMeters: number
  readonly minimumValue: number
  readonly maximumValue: number
  readonly scaleMaximum: number
  readonly displayChannel: ExposureDisplayChannel
  readonly quantity: ExposureQuantity
  readonly unit: 'W/m²' | 'kWh/m²'
  readonly directionCount: number
  readonly temporalSampleCount: number
  readonly evaluatedSampleCount: number
}

export interface TerrainExposureReuse {
  readonly previousLayer: TerrainExposureLayer
  readonly shouldEvaluate: (point: TerrainMeshVertex) => boolean
}

interface Vector3 {
  readonly x: number
  readonly y: number
  readonly z: number
}

function subtract(left: Vector3, right: Vector3): Vector3 {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z }
}

function cross(left: Vector3, right: Vector3): Vector3 {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  }
}

function normalizedTriangleNormal(
  a: TerrainMeshVertex,
  b: TerrainMeshVertex,
  c: TerrainMeshVertex,
): Vector3 {
  const sceneA = { x: a.eastMeters, y: a.elevationMeters, z: -a.northMeters }
  const sceneB = { x: b.eastMeters, y: b.elevationMeters, z: -b.northMeters }
  const sceneC = { x: c.eastMeters, y: c.elevationMeters, z: -c.northMeters }
  const normal = cross(subtract(sceneB, sceneA), subtract(sceneC, sceneA))
  const length = Math.hypot(normal.x, normal.y, normal.z)
  return { x: normal.x / length, y: normal.y / length, z: normal.z / length }
}

function distance(a: TerrainMeshVertex, b: TerrainMeshVertex): number {
  return Math.hypot(
    b.eastMeters - a.eastMeters,
    b.elevationMeters - a.elevationMeters,
    b.northMeters - a.northMeters,
  )
}

function interpolateTriangle(
  a: TerrainMeshVertex,
  b: TerrainMeshVertex,
  c: TerrainMeshVertex,
  bWeight: number,
  cWeight: number,
): TerrainMeshVertex {
  const aWeight = 1 - bWeight - cWeight
  return {
    eastMeters:
      a.eastMeters * aWeight + b.eastMeters * bWeight + c.eastMeters * cWeight,
    elevationMeters:
      a.elevationMeters * aWeight +
      b.elevationMeters * bWeight +
      c.elevationMeters * cWeight,
    northMeters:
      a.northMeters * aWeight +
      b.northMeters * bWeight +
      c.northMeters * cWeight,
  }
}

export function generateTerrainExposureLayer(
  project: LandscapeProject,
  terrain: TerrainEntity,
  parcel: ParcelGeometry | undefined,
  settings: Extract<SolarHeatmapSettings, { readonly enabled: true }>,
  preparedExposure: PreparedSurfaceExposure = prepareSurfaceExposure(
    project,
    settings,
  ),
  reuse?: TerrainExposureReuse,
): TerrainExposureLayer {
  if (!Number.isFinite(settings.spacingMeters) || settings.spacingMeters <= 0) {
    throw new Error('Heatmap spacing must be a positive finite number')
  }
  const derived = deriveTerrainMesh(terrain)
  if (!derived.ok) {
    throw new Error('Cannot sample invalid terrain')
  }
  const clipped = parcel
    ? clipTerrainMeshToParcel(derived.mesh, parcel.vertices)
    : derived
  if (!clipped.ok) {
    throw new Error(clipped.issue.message)
  }

  const vertices: TerrainExposureVertex[] = []
  const triangles: [number, number, number][] = []
  let evaluatedSampleCount = 0
  clipped.mesh.triangles.forEach(([aIndex, bIndex, cIndex]) => {
    const a = clipped.mesh.vertices[aIndex]
    const b = clipped.mesh.vertices[bIndex]
    const c = clipped.mesh.vertices[cIndex]
    const normal = normalizedTriangleNormal(a, b, c)
    const divisions = Math.max(
      1,
      Math.ceil(
        Math.max(distance(a, b), distance(b, c), distance(c, a)) /
          settings.spacingMeters,
      ),
    )
    const localIndices = new Map<string, number>()
    const vertexAt = (bStep: number, cStep: number): number => {
      const key = `${bStep}:${cStep}`
      const existing = localIndices.get(key)
      if (existing !== undefined) return existing
      const point = interpolateTriangle(
        a,
        b,
        c,
        bStep / divisions,
        cStep / divisions,
      )
      const index = vertices.length
      const previous = reuse?.previousLayer.spacingMeters === settings.spacingMeters
        ? reuse.previousLayer.vertices[index]
        : undefined
      const canReuse = previous !== undefined &&
        previous.eastMeters === point.eastMeters &&
        previous.elevationMeters === point.elevationMeters &&
        previous.northMeters === point.northMeters &&
        !reuse?.shouldEvaluate(point)
      const exposure = canReuse
        ? previous.exposure
        : preparedExposure.evaluate({
            eastMeters: point.eastMeters + normal.x * 1e-4,
            elevationMeters: point.elevationMeters + normal.y * 1e-4,
            northMeters: point.northMeters - normal.z * 1e-4,
            normal: { east: normal.x, up: normal.y, north: -normal.z },
          })
      if (!canReuse) evaluatedSampleCount += 1
      vertices.push({
        ...point,
        exposure,
      })
      localIndices.set(key, index)
      return index
    }

    for (let bStep = 0; bStep < divisions; bStep += 1) {
      for (let cStep = 0; cStep < divisions - bStep; cStep += 1) {
        triangles.push([
          vertexAt(bStep, cStep),
          vertexAt(bStep + 1, cStep),
          vertexAt(bStep, cStep + 1),
        ])
        if (bStep + cStep < divisions - 1) {
          triangles.push([
            vertexAt(bStep + 1, cStep),
            vertexAt(bStep + 1, cStep + 1),
            vertexAt(bStep, cStep + 1),
          ])
        }
      }
    }
  })

  let minimumValue = Number.POSITIVE_INFINITY
  let maximumValue = Number.NEGATIVE_INFINITY
  vertices.forEach(({ exposure }) => {
    const value = exposure[settings.displayChannel]
    minimumValue = Math.min(
      minimumValue,
      value,
    )
    maximumValue = Math.max(
      maximumValue,
      value,
    )
  })
  return {
    vertices,
    triangles,
    spacingMeters: settings.spacingMeters,
    minimumValue,
    maximumValue,
    scaleMaximum: preparedExposure.scaleMaximum,
    displayChannel: settings.displayChannel,
    quantity: preparedExposure.quantity,
    unit: preparedExposure.unit,
    directionCount: preparedExposure.directionCount,
    temporalSampleCount: preparedExposure.temporalSampleCount,
    evaluatedSampleCount,
  }
}
