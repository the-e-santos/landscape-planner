import { describe, expect, it } from 'vitest'
import { createDefaultProject } from '../domain/project'
import type { PrimitiveEntity, PrimitiveGeometry } from '../domain/primitive'
import {
  generatePrimitiveExposureLayer,
  samplePrimitiveSurface,
} from './primitiveExposure'

function primitive(geometry: PrimitiveGeometry): PrimitiveEntity {
  return {
    id: `surface.${geometry.kind}`,
    kind: 'primitive',
    name: geometry.kind,
    transform: {
      position: { eastMeters: 0, elevationMeters: 2, northMeters: 0 },
      rotation: { xRadians: 0, yRadians: 0, zRadians: 0 },
    },
    geometry,
    solarOptics: { mode: 'opaque' },
  }
}

const geometries: readonly PrimitiveGeometry[] = [
  { kind: 'box', widthMeters: 2, heightMeters: 1, depthMeters: 3 },
  { kind: 'cylinder', radiusMeters: 1, heightMeters: 2 },
  {
    kind: 'wall', structure: 'fence', lengthMeters: 4,
    heightMeters: 2, thicknessMeters: 0.1,
  },
  {
    kind: 'polygonExtrusion',
    footprint: [
      { eastMeters: -1, northMeters: -1 },
      { eastMeters: 1, northMeters: -1 },
      { eastMeters: 0.25, northMeters: 0 },
      { eastMeters: 1, northMeters: 1 },
      { eastMeters: -1, northMeters: 1 },
    ],
    heightMeters: 1,
  },
  {
    kind: 'canopy', eastRadiusMeters: 2,
    verticalRadiusMeters: 1.5, northRadiusMeters: 1,
  },
]

const settings = {
  enabled: true,
  analysisMode: 'instant',
  solarPosition: {
    date: { year: 2024, month: 3, day: 20 },
    latitudeRadians: 0,
    localSolarTimeHours: 12,
  },
  directNormalIrradianceWattsPerSquareMeter: 800,
  spacingMeters: 0.75,
  displayChannel: 'direct',
} as const

describe('primitive surface exposure sampling', () => {
  it.each(geometries.map((geometry) => [geometry.kind, geometry] as const))(
    'creates a finite sampled mesh for %s',
    (_kind, geometry) => {
      const mesh = samplePrimitiveSurface(primitive(geometry), 0.75)
      expect(mesh.vertices.length).toBeGreaterThan(0)
      expect(mesh.triangles.length).toBeGreaterThan(0)
      expect(mesh.vertices.every(({ position, normal }) =>
        [position.x, position.y, position.z, normal.x, normal.y, normal.z]
          .every(Number.isFinite)
      )).toBe(true)
    },
  )

  it('evaluates all sampled surfaces while excluding the owning primitive', () => {
    const entity = primitive(geometries[0])
    const base = createDefaultProject()
    const project = {
      ...base,
      entities: [
        ...base.entities.filter((candidate) => candidate.kind !== 'primitive'),
        entity,
      ],
    }
    const layer = generatePrimitiveExposureLayer(project, entity, settings)

    expect(layer.entityId).toBe(entity.id)
    expect(layer.vertices.some(
      ({ exposure }) => exposure.direct > 799,
    )).toBe(true)
    expect(layer.vertices.every(({ exposure }) =>
      Number.isFinite(exposure.direct)
    )).toBe(true)
  })

  it('matches the rendered cylinder radial resolution at coarse spacing', () => {
    const entity = primitive({
      kind: 'cylinder', radiusMeters: 1, heightMeters: 2,
    })
    const mesh = samplePrimitiveSurface(entity, 2)
    const sideVertices = mesh.vertices.filter(
      ({ normal }) => Math.abs(normal.y) < 0.5,
    )

    // One vertical interval and 32 radial intervals, including the seam.
    expect(sideVertices.length).toBeGreaterThanOrEqual(2 * 33)
  })

  it('rejects non-positive surface spacing', () => {
    expect(() => samplePrimitiveSurface(primitive(geometries[0]), 0))
      .toThrow('Surface spacing must be a positive finite number')
  })

  it('reuses primitive samples outside dirty tiles', () => {
    const entity = primitive(geometries[0])
    const project = createDefaultProject()
    const first = generatePrimitiveExposureLayer(project, entity, settings)
    const reused = generatePrimitiveExposureLayer(
      project,
      entity,
      settings,
      undefined,
      { previousLayer: first, shouldEvaluate: () => false },
    )

    expect(first.evaluatedSampleCount).toBe(first.vertices.length)
    expect(reused.evaluatedSampleCount).toBe(0)
    expect(reused.vertices.map(({ exposure }) => exposure)).toEqual(
      first.vertices.map(({ exposure }) => exposure),
    )
  })
})
