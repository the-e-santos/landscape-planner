import type { LandscapeProject } from '../domain/project'
import type { PrimitiveEntity } from '../domain/primitive'
import {
  calculateSolarPosition,
  type SolarPositionInput,
} from './solarPosition'
import {
  tracePrimitiveTransmission,
  type OpticalCrossing,
  type Vector3,
} from './rayVisibility'

export interface SurfacePoint {
  readonly eastMeters: number
  readonly elevationMeters: number
  readonly northMeters: number
  readonly normal: {
    readonly east: number
    readonly up: number
    readonly north: number
  }
  readonly owningEntityId?: string
}

export interface DirectPointQuery {
  readonly solarPosition: SolarPositionInput
  readonly directNormalIrradianceWattsPerSquareMeter: number
  readonly surface: SurfacePoint
}

export interface DirectPointResult {
  readonly altitudeRadians: number
  readonly azimuthRadians: number
  readonly incidenceCosine: number
  readonly transmission: number
  readonly directIrradianceWattsPerSquareMeter: number
  readonly crossings: readonly OpticalCrossing[]
  readonly blockedByEntityId?: string
}

export type DirectPointSolarEvaluator = (
  surface: SurfacePoint,
) => DirectPointResult

function normalize(vector: Vector3, label: string): Vector3 {
  const length = Math.hypot(vector.x, vector.y, vector.z)
  if (!Number.isFinite(length) || length === 0) {
    throw new Error(`${label} must have a finite, nonzero length`)
  }
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length }
}

export function queryDirectPointSolar(
  project: LandscapeProject,
  query: DirectPointQuery,
): DirectPointResult {
  return createDirectPointSolarEvaluator(
    project,
    query.solarPosition,
    query.directNormalIrradianceWattsPerSquareMeter,
  )(query.surface)
}

export function createDirectPointSolarEvaluator(
  project: LandscapeProject,
  solarPositionInput: SolarPositionInput,
  directNormalIrradianceWattsPerSquareMeter: number,
): DirectPointSolarEvaluator {
  const dni = directNormalIrradianceWattsPerSquareMeter
  if (!Number.isFinite(dni) || dni < 0) {
    throw new Error('Direct normal irradiance must be a non-negative finite number')
  }
  const position = calculateSolarPosition(solarPositionInput)
  const relativeAzimuth =
    position.azimuthRadians - project.coordinates.northRotationRadians
  const cosAltitude = Math.cos(position.altitudeRadians)
  const sunDirection = normalize({
    x: Math.sin(relativeAzimuth) * cosAltitude,
    y: Math.sin(position.altitudeRadians),
    z: -Math.cos(relativeAzimuth) * cosAltitude,
  }, 'Sun direction')
  const primitives = project.entities.filter(
    (entity): entity is PrimitiveEntity => entity.kind === 'primitive',
  )

  return (surface) => {
    if (!position.aboveHorizon) {
      return {
        altitudeRadians: position.altitudeRadians,
        azimuthRadians: position.azimuthRadians,
        incidenceCosine: 0,
        transmission: 0,
        directIrradianceWattsPerSquareMeter: 0,
        crossings: [],
      }
    }
    const normal = normalize({
      x: surface.normal.east,
      y: surface.normal.up,
      z: -surface.normal.north,
    }, 'Surface normal')
    const incidenceCosine = Math.max(
      0,
      normal.x * sunDirection.x +
        normal.y * sunDirection.y +
        normal.z * sunDirection.z,
    )
    if (incidenceCosine === 0) {
      return {
        altitudeRadians: position.altitudeRadians,
        azimuthRadians: position.azimuthRadians,
        incidenceCosine,
        transmission: 1,
        directIrradianceWattsPerSquareMeter: 0,
        crossings: [],
      }
    }
    const rayResult = tracePrimitiveTransmission(
      {
        origin: {
          x: surface.eastMeters,
          y: surface.elevationMeters,
          z: -surface.northMeters,
        },
        direction: sunDirection,
      },
      primitives,
      surface.owningEntityId,
    )

    return {
      altitudeRadians: position.altitudeRadians,
      azimuthRadians: position.azimuthRadians,
      incidenceCosine,
      transmission: rayResult.transmission,
      directIrradianceWattsPerSquareMeter:
        dni * incidenceCosine * rayResult.transmission,
      crossings: rayResult.crossings,
      ...(rayResult.blockedByEntityId
        ? { blockedByEntityId: rayResult.blockedByEntityId }
        : {}),
    }
  }
}
