import type { EntityId } from './project'

export interface Position3 {
  readonly eastMeters: number
  readonly elevationMeters: number
  readonly northMeters: number
}

export interface Rotation3 {
  readonly xRadians: number
  readonly yRadians: number
  readonly zRadians: number
}

export interface ObjectTransform {
  /** Position of the primitive's local center in the project coordinate frame. */
  readonly position: Position3
  /** Intrinsic XYZ Euler rotation, stored in radians. */
  readonly rotation: Rotation3
}

export interface BoxGeometry {
  readonly kind: 'box'
  readonly widthMeters: number
  readonly heightMeters: number
  readonly depthMeters: number
}

export interface CylinderGeometry {
  readonly kind: 'cylinder'
  readonly radiusMeters: number
  readonly heightMeters: number
}

export type WallStructure = 'wall' | 'fence'

export interface WallGeometry {
  readonly kind: 'wall'
  readonly structure: WallStructure
  readonly lengthMeters: number
  readonly heightMeters: number
  readonly thicknessMeters: number
}

export interface PolygonExtrusionPoint {
  readonly eastMeters: number
  readonly northMeters: number
}

export interface PolygonExtrusionGeometry {
  readonly kind: 'polygonExtrusion'
  /** Counterclockwise local footprint vertices viewed from above. */
  readonly footprint: readonly PolygonExtrusionPoint[]
  readonly heightMeters: number
}

export interface CanopyGeometry {
  readonly kind: 'canopy'
  readonly eastRadiusMeters: number
  readonly verticalRadiusMeters: number
  readonly northRadiusMeters: number
}

export interface PrimitiveScale {
  readonly x: number
  readonly y: number
  readonly z: number
}

export const MIN_PRIMITIVE_DIMENSION_METERS = 0.01

export type PrimitiveGeometry =
  | BoxGeometry
  | CylinderGeometry
  | WallGeometry
  | PolygonExtrusionGeometry
  | CanopyGeometry

export type SolarOptics =
  | { readonly mode: 'ignored' }
  | { readonly mode: 'opaque' }
  | { readonly mode: 'transmissive'; readonly transmittance: number }

export interface PrimitiveEntity {
  readonly id: EntityId
  readonly kind: 'primitive'
  readonly name: string
  readonly transform: ObjectTransform
  readonly geometry: PrimitiveGeometry
  /** Missing on early schema-v1 primitives and treated as opaque. */
  readonly solarOptics?: SolarOptics
}

export const DEFAULT_HOUSE_ID = 'primitive.house'

export function createDefaultHouseEntity(): PrimitiveEntity {
  return {
    id: DEFAULT_HOUSE_ID,
    kind: 'primitive',
    name: 'House massing',
    transform: {
      position: {
        eastMeters: -4,
        elevationMeters: 2.2,
        northMeters: 0,
      },
      rotation: {
        xRadians: 0,
        yRadians: 0,
        zRadians: 0,
      },
    },
    geometry: {
      kind: 'box',
      widthMeters: 6,
      heightMeters: 3,
      depthMeters: 8,
    },
    solarOptics: { mode: 'opaque' },
  }
}

export function clonePrimitiveEntity(
  entity: PrimitiveEntity,
): PrimitiveEntity {
  return {
    ...entity,
    transform: {
      position: { ...entity.transform.position },
      rotation: { ...entity.transform.rotation },
    },
    geometry:
      entity.geometry.kind === 'polygonExtrusion'
        ? {
            ...entity.geometry,
            footprint: entity.geometry.footprint.map((point) => ({ ...point })),
          }
        : { ...entity.geometry },
    ...(entity.solarOptics
      ? { solarOptics: { ...entity.solarOptics } }
      : {}),
  }
}

export function getPrimitiveSolarOptics(
  entity: PrimitiveEntity,
): SolarOptics {
  return entity.solarOptics ?? { mode: 'opaque' }
}

function scaledDimension(value: number, scale: number): number {
  return Math.max(
    MIN_PRIMITIVE_DIMENSION_METERS,
    value * Math.abs(scale),
  )
}

function dominantHorizontalScale(scale: PrimitiveScale): number {
  return Math.abs(scale.x - 1) >= Math.abs(scale.z - 1)
    ? scale.x
    : scale.z
}

export function resizePrimitiveGeometry(
  geometry: PrimitiveGeometry,
  scale: PrimitiveScale,
): PrimitiveGeometry {
  switch (geometry.kind) {
    case 'box':
      return {
        ...geometry,
        widthMeters: scaledDimension(geometry.widthMeters, scale.x),
        heightMeters: scaledDimension(geometry.heightMeters, scale.y),
        depthMeters: scaledDimension(geometry.depthMeters, scale.z),
      }

    case 'cylinder': {
      const radiusScale = dominantHorizontalScale(scale)
      return {
        ...geometry,
        radiusMeters: scaledDimension(geometry.radiusMeters, radiusScale),
        heightMeters: scaledDimension(geometry.heightMeters, scale.y),
      }
    }

    case 'wall':
      return {
        ...geometry,
        lengthMeters: scaledDimension(geometry.lengthMeters, scale.x),
        heightMeters: scaledDimension(geometry.heightMeters, scale.y),
        thicknessMeters: scaledDimension(geometry.thicknessMeters, scale.z),
      }

    case 'polygonExtrusion':
      return {
        ...geometry,
        footprint: geometry.footprint.map((point) => ({
          eastMeters: point.eastMeters * Math.abs(scale.x),
          northMeters: point.northMeters * Math.abs(scale.z),
        })),
        heightMeters: scaledDimension(geometry.heightMeters, scale.y),
      }

    case 'canopy':
      return {
        ...geometry,
        eastRadiusMeters: scaledDimension(geometry.eastRadiusMeters, scale.x),
        verticalRadiusMeters: scaledDimension(
          geometry.verticalRadiusMeters,
          scale.y,
        ),
        northRadiusMeters: scaledDimension(geometry.northRadiusMeters, scale.z),
      }
  }
}

function polygonSignedArea(
  footprint: readonly PolygonExtrusionPoint[],
): number {
  return footprint.reduce((area, point, index) => {
    const next = footprint[(index + 1) % footprint.length]
    return area + point.eastMeters * next.northMeters -
      next.eastMeters * point.northMeters
  }, 0) / 2
}

export function validatePrimitiveEntity(entity: PrimitiveEntity): void {
  const finiteValues = [
    entity.transform.position.eastMeters,
    entity.transform.position.elevationMeters,
    entity.transform.position.northMeters,
    entity.transform.rotation.xRadians,
    entity.transform.rotation.yRadians,
    entity.transform.rotation.zRadians,
  ]

  switch (entity.geometry.kind) {
    case 'box':
      finiteValues.push(
        entity.geometry.widthMeters,
        entity.geometry.heightMeters,
        entity.geometry.depthMeters,
      )
      if (
        entity.geometry.widthMeters <= 0 ||
        entity.geometry.heightMeters <= 0 ||
        entity.geometry.depthMeters <= 0
      ) {
        throw new Error('Primitive dimensions must be greater than zero')
      }
      break

    case 'cylinder':
      finiteValues.push(
        entity.geometry.radiusMeters,
        entity.geometry.heightMeters,
      )
      if (
        entity.geometry.radiusMeters <= 0 ||
        entity.geometry.heightMeters <= 0
      ) {
        throw new Error('Primitive dimensions must be greater than zero')
      }
      break

    case 'wall':
      finiteValues.push(
        entity.geometry.lengthMeters,
        entity.geometry.heightMeters,
        entity.geometry.thicknessMeters,
      )
      if (
        entity.geometry.lengthMeters <= 0 ||
        entity.geometry.heightMeters <= 0 ||
        entity.geometry.thicknessMeters <= 0
      ) {
        throw new Error('Primitive dimensions must be greater than zero')
      }
      break

    case 'polygonExtrusion':
      finiteValues.push(
        entity.geometry.heightMeters,
        ...entity.geometry.footprint.flatMap((point) => [
          point.eastMeters,
          point.northMeters,
        ]),
      )
      if (entity.geometry.heightMeters <= 0) {
        throw new Error('Primitive dimensions must be greater than zero')
      }
      if (
        entity.geometry.footprint.length < 3 ||
        polygonSignedArea(entity.geometry.footprint) < 1e-9
      ) {
        throw new Error(
          'Polygon extrusion footprint must be counterclockwise with a nonzero area',
        )
      }
      break

    case 'canopy':
      finiteValues.push(
        entity.geometry.eastRadiusMeters,
        entity.geometry.verticalRadiusMeters,
        entity.geometry.northRadiusMeters,
      )
      if (
        entity.geometry.eastRadiusMeters <= 0 ||
        entity.geometry.verticalRadiusMeters <= 0 ||
        entity.geometry.northRadiusMeters <= 0
      ) {
        throw new Error('Primitive dimensions must be greater than zero')
      }
      break
  }

  if (finiteValues.some((value) => !Number.isFinite(value))) {
    throw new Error('Primitive transform and dimensions must be finite numbers')
  }

  const solarOptics = getPrimitiveSolarOptics(entity)
  if (
    solarOptics.mode === 'transmissive' &&
    (!Number.isFinite(solarOptics.transmittance) ||
      solarOptics.transmittance < 0 ||
      solarOptics.transmittance > 1)
  ) {
    throw new Error('Solar transmittance must be between zero and one')
  }
}
