import type { ParcelGeometry } from '../domain/parcel'
import type { LandscapeProject } from '../domain/project'
import type { TerrainEntity } from '../domain/terrain'
import { clipTerrainMeshToParcel } from '../domain/terrainClipping'
import {
  deriveTerrainMesh,
  type TerrainMeshVertex,
} from '../domain/terrainMesh'
import { createDirectPointSolarEvaluator } from './pointSolar'
import type { SolarPositionInput } from './solarPosition'

export type ExposureDisplayChannel = 'direct' | 'diffuse' | 'total'

export type InstantSolarHeatmapSettings =
  | { readonly enabled: false }
  | {
      readonly enabled: true
      readonly solarPosition: SolarPositionInput
      readonly directNormalIrradianceWattsPerSquareMeter: number
      readonly spacingMeters: number
      readonly displayChannel: ExposureDisplayChannel
    }

export interface TerrainExposureVertex extends TerrainMeshVertex {
  readonly directIrradianceWattsPerSquareMeter: number
  readonly diffuseIrradianceWattsPerSquareMeter: number
  readonly totalIrradianceWattsPerSquareMeter: number
}

export interface TerrainExposureLayer {
  readonly vertices: readonly TerrainExposureVertex[]
  readonly triangles: readonly (readonly [number, number, number])[]
  readonly spacingMeters: number
  readonly minimumIrradianceWattsPerSquareMeter: number
  readonly maximumIrradianceWattsPerSquareMeter: number
  readonly scaleMaximumIrradianceWattsPerSquareMeter: number
  readonly displayChannel: ExposureDisplayChannel
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
  settings: Extract<InstantSolarHeatmapSettings, { readonly enabled: true }>,
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
  const evaluatePoint = createDirectPointSolarEvaluator(
    project,
    settings.solarPosition,
    settings.directNormalIrradianceWattsPerSquareMeter,
  )
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
      const result = evaluatePoint({
          eastMeters: point.eastMeters + normal.x * 1e-4,
          elevationMeters: point.elevationMeters + normal.y * 1e-4,
          northMeters: point.northMeters - normal.z * 1e-4,
          normal: { east: normal.x, up: normal.y, north: -normal.z },
      })
      const index = vertices.length
      vertices.push({
        ...point,
        directIrradianceWattsPerSquareMeter:
          result.directIrradianceWattsPerSquareMeter,
        diffuseIrradianceWattsPerSquareMeter: 0,
        totalIrradianceWattsPerSquareMeter:
          result.directIrradianceWattsPerSquareMeter,
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

  let minimumIrradianceWattsPerSquareMeter = Number.POSITIVE_INFINITY
  let maximumIrradianceWattsPerSquareMeter = Number.NEGATIVE_INFINITY
  vertices.forEach(({ directIrradianceWattsPerSquareMeter }) => {
    minimumIrradianceWattsPerSquareMeter = Math.min(
      minimumIrradianceWattsPerSquareMeter,
      directIrradianceWattsPerSquareMeter,
    )
    maximumIrradianceWattsPerSquareMeter = Math.max(
      maximumIrradianceWattsPerSquareMeter,
      directIrradianceWattsPerSquareMeter,
    )
  })
  return {
    vertices,
    triangles,
    spacingMeters: settings.spacingMeters,
    minimumIrradianceWattsPerSquareMeter,
    maximumIrradianceWattsPerSquareMeter,
    scaleMaximumIrradianceWattsPerSquareMeter:
      settings.directNormalIrradianceWattsPerSquareMeter,
    displayChannel: settings.displayChannel,
  }
}
