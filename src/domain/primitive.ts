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
  /** Omitted optics use the domain's opaque default. */
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
  preserveProportions = false,
): PrimitiveGeometry {
  const effectiveScale = preserveProportions
    ? uniformPrimitiveScale(scale)
    : scale
  switch (geometry.kind) {
    case 'box':
      return {
        ...geometry,
        widthMeters: scaledDimension(geometry.widthMeters, effectiveScale.x),
        heightMeters: scaledDimension(geometry.heightMeters, effectiveScale.y),
        depthMeters: scaledDimension(geometry.depthMeters, effectiveScale.z),
      }

    case 'cylinder': {
      const radiusScale = dominantHorizontalScale(effectiveScale)
      return {
        ...geometry,
        radiusMeters: scaledDimension(geometry.radiusMeters, radiusScale),
        heightMeters: scaledDimension(geometry.heightMeters, effectiveScale.y),
      }
    }

    case 'wall':
      return {
        ...geometry,
        lengthMeters: scaledDimension(geometry.lengthMeters, effectiveScale.x),
        heightMeters: scaledDimension(geometry.heightMeters, effectiveScale.y),
        thicknessMeters: scaledDimension(
          geometry.thicknessMeters,
          effectiveScale.z,
        ),
      }

    case 'polygonExtrusion':
      return {
        ...geometry,
        footprint: geometry.footprint.map((point) => ({
          eastMeters: point.eastMeters * Math.abs(effectiveScale.x),
          northMeters: point.northMeters * Math.abs(effectiveScale.z),
        })),
        heightMeters: scaledDimension(geometry.heightMeters, effectiveScale.y),
      }

    case 'canopy':
      return {
        ...geometry,
        eastRadiusMeters: scaledDimension(
          geometry.eastRadiusMeters,
          effectiveScale.x,
        ),
        verticalRadiusMeters: scaledDimension(
          geometry.verticalRadiusMeters,
          effectiveScale.y,
        ),
        northRadiusMeters: scaledDimension(
          geometry.northRadiusMeters,
          effectiveScale.z,
        ),
      }
  }
}

function uniformPrimitiveScale(scale: PrimitiveScale): PrimitiveScale {
  const factor = [scale.x, scale.y, scale.z].reduce((dominant, candidate) =>
    Math.abs(candidate - 1) > Math.abs(dominant - 1)
      ? candidate
      : dominant,
  )
  return { x: factor, y: factor, z: factor }
}

function snapDimension(value: number, incrementMeters: number): number {
  if (!Number.isFinite(incrementMeters) || incrementMeters <= 0) {
    throw new Error('Resize snap increment must be a positive finite number')
  }
  const snapped = Math.round(value / incrementMeters) * incrementMeters
  return Math.max(
    MIN_PRIMITIVE_DIMENSION_METERS,
    Number(snapped.toPrecision(12)),
  )
}

export function snapPrimitiveGeometryDimensions(
  geometry: PrimitiveGeometry,
  incrementMeters: number,
  preserveProportions = false,
): PrimitiveGeometry {
  if (preserveProportions) {
    let dimensions: readonly number[]
    if (geometry.kind === 'polygonExtrusion') {
      const eastValues = geometry.footprint.map(({ eastMeters }) => eastMeters)
      const northValues = geometry.footprint.map(({ northMeters }) => northMeters)
      dimensions = [
        Math.max(...eastValues) - Math.min(...eastValues),
        geometry.heightMeters,
        Math.max(...northValues) - Math.min(...northValues),
      ]
    } else if (geometry.kind === 'box') {
      dimensions = [
        geometry.widthMeters,
        geometry.heightMeters,
        geometry.depthMeters,
      ]
    } else if (geometry.kind === 'cylinder') {
      dimensions = [geometry.radiusMeters, geometry.heightMeters]
    } else if (geometry.kind === 'wall') {
      dimensions = [
        geometry.lengthMeters,
        geometry.heightMeters,
        geometry.thicknessMeters,
      ]
    } else {
      dimensions = [
        geometry.eastRadiusMeters,
        geometry.verticalRadiusMeters,
        geometry.northRadiusMeters,
      ]
    }
    const referenceDimension = Math.max(...dimensions)
    const factor = snapDimension(referenceDimension, incrementMeters) /
      referenceDimension
    return resizePrimitiveGeometry(
      geometry,
      { x: factor, y: factor, z: factor },
    )
  }

  switch (geometry.kind) {
    case 'box':
      return {
        ...geometry,
        widthMeters: snapDimension(geometry.widthMeters, incrementMeters),
        heightMeters: snapDimension(geometry.heightMeters, incrementMeters),
        depthMeters: snapDimension(geometry.depthMeters, incrementMeters),
      }

    case 'cylinder':
      return {
        ...geometry,
        radiusMeters: snapDimension(geometry.radiusMeters, incrementMeters),
        heightMeters: snapDimension(geometry.heightMeters, incrementMeters),
      }

    case 'wall':
      return {
        ...geometry,
        lengthMeters: snapDimension(geometry.lengthMeters, incrementMeters),
        heightMeters: snapDimension(geometry.heightMeters, incrementMeters),
        thicknessMeters: snapDimension(
          geometry.thicknessMeters,
          incrementMeters,
        ),
      }

    case 'polygonExtrusion': {
      const eastValues = geometry.footprint.map(({ eastMeters }) => eastMeters)
      const northValues = geometry.footprint.map(({ northMeters }) => northMeters)
      const width = Math.max(...eastValues) - Math.min(...eastValues)
      const depth = Math.max(...northValues) - Math.min(...northValues)
      const widthScale = snapDimension(width, incrementMeters) / width
      const depthScale = snapDimension(depth, incrementMeters) / depth
      return {
        ...geometry,
        footprint: geometry.footprint.map((point) => ({
          eastMeters: point.eastMeters * widthScale,
          northMeters: point.northMeters * depthScale,
        })),
        heightMeters: snapDimension(geometry.heightMeters, incrementMeters),
      }
    }

    case 'canopy':
      return {
        ...geometry,
        eastRadiusMeters: snapDimension(
          geometry.eastRadiusMeters,
          incrementMeters,
        ),
        verticalRadiusMeters: snapDimension(
          geometry.verticalRadiusMeters,
          incrementMeters,
        ),
        northRadiusMeters: snapDimension(
          geometry.northRadiusMeters,
          incrementMeters,
        ),
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

const POLYGON_EPSILON = 1e-9

function pointsEqual(
  first: PolygonExtrusionPoint,
  second: PolygonExtrusionPoint,
): boolean {
  return Math.abs(first.eastMeters - second.eastMeters) < POLYGON_EPSILON &&
    Math.abs(first.northMeters - second.northMeters) < POLYGON_EPSILON
}

function crossProduct(
  start: PolygonExtrusionPoint,
  end: PolygonExtrusionPoint,
  point: PolygonExtrusionPoint,
): number {
  return (end.eastMeters - start.eastMeters) *
    (point.northMeters - start.northMeters) -
    (end.northMeters - start.northMeters) *
    (point.eastMeters - start.eastMeters)
}

function pointOnSegment(
  point: PolygonExtrusionPoint,
  start: PolygonExtrusionPoint,
  end: PolygonExtrusionPoint,
): boolean {
  return Math.abs(crossProduct(start, end, point)) < POLYGON_EPSILON &&
    point.eastMeters >= Math.min(start.eastMeters, end.eastMeters) - POLYGON_EPSILON &&
    point.eastMeters <= Math.max(start.eastMeters, end.eastMeters) + POLYGON_EPSILON &&
    point.northMeters >= Math.min(start.northMeters, end.northMeters) - POLYGON_EPSILON &&
    point.northMeters <= Math.max(start.northMeters, end.northMeters) + POLYGON_EPSILON
}

function segmentsIntersect(
  firstStart: PolygonExtrusionPoint,
  firstEnd: PolygonExtrusionPoint,
  secondStart: PolygonExtrusionPoint,
  secondEnd: PolygonExtrusionPoint,
): boolean {
  const firstSideStart = crossProduct(firstStart, firstEnd, secondStart)
  const firstSideEnd = crossProduct(firstStart, firstEnd, secondEnd)
  const secondSideStart = crossProduct(secondStart, secondEnd, firstStart)
  const secondSideEnd = crossProduct(secondStart, secondEnd, firstEnd)

  if (
    firstSideStart * firstSideEnd < -POLYGON_EPSILON &&
    secondSideStart * secondSideEnd < -POLYGON_EPSILON
  ) {
    return true
  }
  return pointOnSegment(secondStart, firstStart, firstEnd) ||
    pointOnSegment(secondEnd, firstStart, firstEnd) ||
    pointOnSegment(firstStart, secondStart, secondEnd) ||
    pointOnSegment(firstEnd, secondStart, secondEnd)
}

function polygonSelfIntersects(
  footprint: readonly PolygonExtrusionPoint[],
): boolean {
  for (let firstIndex = 0; firstIndex < footprint.length; firstIndex += 1) {
    const firstNext = (firstIndex + 1) % footprint.length
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < footprint.length;
      secondIndex += 1
    ) {
      const secondNext = (secondIndex + 1) % footprint.length
      if (
        firstIndex === secondIndex ||
        firstNext === secondIndex ||
        secondNext === firstIndex
      ) {
        continue
      }
      if (segmentsIntersect(
        footprint[firstIndex],
        footprint[firstNext],
        footprint[secondIndex],
        footprint[secondNext],
      )) {
        return true
      }
    }
  }
  return false
}

export function validatePolygonExtrusionFootprint(
  footprint: readonly PolygonExtrusionPoint[],
): void {
  if (footprint.length < 3) {
    throw new Error('Polygon extrusion footprint requires at least three vertices')
  }
  if (footprint.some((point) =>
    !Number.isFinite(point.eastMeters) || !Number.isFinite(point.northMeters)
  )) {
    throw new Error('Polygon extrusion vertices must be finite numbers')
  }
  if (footprint.some((point, index) =>
    pointsEqual(point, footprint[(index + 1) % footprint.length])
  )) {
    throw new Error('Polygon extrusion consecutive vertices must be distinct')
  }
  if (polygonSelfIntersects(footprint)) {
    throw new Error('Polygon extrusion footprint must not self-intersect')
  }
  const area = polygonSignedArea(footprint)
  if (Math.abs(area) < POLYGON_EPSILON) {
    throw new Error('Polygon extrusion footprint must have a nonzero area')
  }
  if (area < 0) {
    throw new Error('Polygon extrusion vertices must be counterclockwise')
  }
}

export function insertPolygonExtrusionMidpoint(
  footprint: readonly PolygonExtrusionPoint[],
  afterIndex: number,
): PolygonExtrusionPoint[] {
  if (footprint.length < 2) {
    return [...footprint]
  }
  const nextIndex = (afterIndex + 1) % footprint.length
  const current = footprint[afterIndex]
  const next = footprint[nextIndex]
  return [
    ...footprint.slice(0, afterIndex + 1),
    {
      eastMeters: (current.eastMeters + next.eastMeters) / 2,
      northMeters: (current.northMeters + next.northMeters) / 2,
    },
    ...footprint.slice(afterIndex + 1),
  ]
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
      validatePolygonExtrusionFootprint(entity.geometry.footprint)
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
