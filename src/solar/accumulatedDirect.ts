import type { LandscapeProject } from '../domain/project'
import type { PrimitiveEntity } from '../domain/primitive'
import { tracePrimitiveTransmission, type Vector3 } from './rayVisibility'
import type { SurfacePoint } from './pointSolar'
import {
  overcastProbabilityAt,
  type ClimateModel,
  type OvercastProbabilityPoint,
} from './climateModel'
import {
  calculateSolarPosition,
  type SolarDate,
} from './solarPosition'

export interface DirectExposurePeriod {
  readonly startDate: SolarDate
  readonly endDate: SolarDate
  readonly latitudeRadians: number
  readonly directNormalIrradianceWattsPerSquareMeter: number
  readonly timeStepMinutes: number
}

export interface ClimateDirectExposurePeriod {
  readonly startDate: SolarDate
  readonly endDate: SolarDate
  readonly latitudeRadians: number
  readonly timeStepMinutes: number
  readonly overcastProbabilityCurve: readonly OvercastProbabilityPoint[]
}

export interface WeightedSunDirection {
  /** Unit vector in true east/up/north coordinates. */
  readonly direction: {
    readonly east: number
    readonly up: number
    readonly north: number
  }
  /** Direct-normal radiant exposure represented by this direction. */
  readonly weightKilowattHoursPerSquareMeter: number
  readonly temporalSampleCount: number
}

export interface DirectDirectionSet {
  readonly directions: readonly WeightedSunDirection[]
  readonly temporalSampleCount: number
  readonly totalDirectNormalExposureKilowattHoursPerSquareMeter: number
  readonly timeStepMinutes: number
}

export interface AccumulatedDirectResult {
  readonly directExposureKilowattHoursPerSquareMeter: number
}

const DAY_MILLISECONDS = 86_400_000

function dateToUtcMilliseconds(date: SolarDate): number {
  const value = Date.UTC(date.year, date.month - 1, date.day)
  const normalized = new Date(value)
  if (
    normalized.getUTCFullYear() !== date.year ||
    normalized.getUTCMonth() + 1 !== date.month ||
    normalized.getUTCDate() !== date.day
  ) {
    throw new Error('Exposure period contains an invalid Gregorian date')
  }
  return value
}

function utcMillisecondsToDate(value: number): SolarDate {
  const date = new Date(value)
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  }
}

function normalize(vector: Vector3): Vector3 {
  const length = Math.hypot(vector.x, vector.y, vector.z)
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length }
}

function fibonacciHemisphereDirections(count: number): Vector3[] {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5))
  return Array.from({ length: count }, (_, index) => {
    const up = (index + 0.5) / count
    const horizontal = Math.sqrt(1 - up * up)
    const azimuth = index * goldenAngle
    return {
      x: Math.sin(azimuth) * horizontal,
      y: up,
      z: Math.cos(azimuth) * horizontal,
    }
  })
}

interface TemporalDirection {
  readonly direction: Vector3
  readonly weightKilowattHoursPerSquareMeter: number
}

function validatePeriod(period: DirectExposurePeriod): {
  readonly startMilliseconds: number
  readonly endMilliseconds: number
} {
  const startMilliseconds = dateToUtcMilliseconds(period.startDate)
  const endMilliseconds = dateToUtcMilliseconds(period.endDate)
  if (endMilliseconds < startMilliseconds) {
    throw new Error('Exposure period end date must not precede its start date')
  }
  if ((endMilliseconds - startMilliseconds) / DAY_MILLISECONDS > 366) {
    throw new Error('Exposure period must not exceed 367 inclusive days')
  }
  if (
    !Number.isFinite(period.latitudeRadians) ||
    Math.abs(period.latitudeRadians) > Math.PI / 2
  ) {
    throw new Error('Latitude must be between -90 and 90 degrees')
  }
  if (
    !Number.isFinite(period.directNormalIrradianceWattsPerSquareMeter) ||
    period.directNormalIrradianceWattsPerSquareMeter < 0
  ) {
    throw new Error('Direct normal irradiance must be non-negative')
  }
  if (
    !Number.isFinite(period.timeStepMinutes) ||
    period.timeStepMinutes <= 0 ||
    period.timeStepMinutes > 1_440
  ) {
    throw new Error('Temporal step must be between 0 and 1440 minutes')
  }
  return { startMilliseconds, endMilliseconds }
}

function generateTemporalDirections(
  period: DirectExposurePeriod,
): TemporalDirection[] {
  const { startMilliseconds, endMilliseconds } = validatePeriod(period)
  const directions: TemporalDirection[] = []
  const stepHours = period.timeStepMinutes / 60
  const weight =
    period.directNormalIrradianceWattsPerSquareMeter * stepHours / 1_000

  for (
    let day = startMilliseconds;
    day <= endMilliseconds;
    day += DAY_MILLISECONDS
  ) {
    const date = utcMillisecondsToDate(day)
    for (
      let startMinute = 0;
      startMinute < 1_440;
      startMinute += period.timeStepMinutes
    ) {
      const durationMinutes = Math.min(
        period.timeStepMinutes,
        1_440 - startMinute,
      )
      const localSolarTimeHours = (
        startMinute + durationMinutes / 2
      ) / 60
      const position = calculateSolarPosition({
        date,
        latitudeRadians: period.latitudeRadians,
        localSolarTimeHours,
      })
      if (!position.aboveHorizon) continue
      const cosAltitude = Math.cos(position.altitudeRadians)
      directions.push({
        direction: {
          x: Math.sin(position.azimuthRadians) * cosAltitude,
          y: Math.sin(position.altitudeRadians),
          z: Math.cos(position.azimuthRadians) * cosAltitude,
        },
        weightKilowattHoursPerSquareMeter:
          weight * durationMinutes / period.timeStepMinutes,
      })
    }
  }
  return directions
}

function generateClimateTemporalDirections(
  period: ClimateDirectExposurePeriod,
  climate: ClimateModel,
): { readonly directions: TemporalDirection[]; readonly sampleCount: number } {
  const validationPeriod: DirectExposurePeriod = {
    ...period,
    directNormalIrradianceWattsPerSquareMeter: 0,
  }
  const { startMilliseconds, endMilliseconds } = validatePeriod(validationPeriod)
  overcastProbabilityAt(period.overcastProbabilityCurve, 0)
  const directions: TemporalDirection[] = []
  let sampleCount = 0

  for (let day = startMilliseconds; day <= endMilliseconds; day += DAY_MILLISECONDS) {
    const date = utcMillisecondsToDate(day)
    for (let startMinute = 0; startMinute < 1_440; startMinute += period.timeStepMinutes) {
      const durationMinutes = Math.min(period.timeStepMinutes, 1_440 - startMinute)
      const localSolarTimeHours = (startMinute + durationMinutes / 2) / 60
      const solarPositionInput = {
        date,
        latitudeRadians: period.latitudeRadians,
        localSolarTimeHours,
      }
      const position = calculateSolarPosition(solarPositionInput)
      if (!position.aboveHorizon) continue
      const probability = overcastProbabilityAt(
        period.overcastProbabilityCurve,
        localSolarTimeHours,
      )
      const clearDni = climate.getDirectNormalIrradiance({
        ...solarPositionInput,
        skyCondition: 'clear',
      })
      const overcastDni = climate.getDirectNormalIrradiance({
        ...solarPositionInput,
        skyCondition: 'overcast',
      })
      const expectedDni = clearDni * (1 - probability) + overcastDni * probability
      const cosAltitude = Math.cos(position.altitudeRadians)
      directions.push({
        direction: {
          x: Math.sin(position.azimuthRadians) * cosAltitude,
          y: Math.sin(position.altitudeRadians),
          z: Math.cos(position.azimuthRadians) * cosAltitude,
        },
        weightKilowattHoursPerSquareMeter:
          expectedDni * durationMinutes / 60 / 1_000,
      })
      sampleCount += 1
    }
  }
  return { directions, sampleCount }
}

function clusterTemporalDirections(
  temporalDirections: readonly TemporalDirection[],
  maximumDirections: number,
  temporalSampleCount: number,
  timeStepMinutes: number,
): DirectDirectionSet {
  if (!Number.isInteger(maximumDirections) || maximumDirections <= 0) {
    throw new Error('Maximum direction count must be a positive integer')
  }
  const bins = fibonacciHemisphereDirections(maximumDirections)
  const accumulators = bins.map(() => ({
    x: 0,
    y: 0,
    z: 0,
    weight: 0,
    count: 0,
  }))
  temporalDirections.forEach((sample) => {
    let closestIndex = 0
    let closestDot = Number.NEGATIVE_INFINITY
    bins.forEach((bin, index) => {
      const dot =
        sample.direction.x * bin.x +
        sample.direction.y * bin.y +
        sample.direction.z * bin.z
      if (dot > closestDot) {
        closestDot = dot
        closestIndex = index
      }
    })
    const accumulator = accumulators[closestIndex]
    accumulator.x += sample.direction.x * sample.weightKilowattHoursPerSquareMeter
    accumulator.y += sample.direction.y * sample.weightKilowattHoursPerSquareMeter
    accumulator.z += sample.direction.z * sample.weightKilowattHoursPerSquareMeter
    accumulator.weight += sample.weightKilowattHoursPerSquareMeter
    accumulator.count += 1
  })
  const directions = accumulators.flatMap((accumulator) => {
    if (accumulator.count === 0 || accumulator.weight === 0) return []
    const direction = normalize(accumulator)
    return [{
      direction: {
        east: direction.x,
        up: direction.y,
        north: direction.z,
      },
      weightKilowattHoursPerSquareMeter: accumulator.weight,
      temporalSampleCount: accumulator.count,
    }]
  })
  return {
    directions,
    temporalSampleCount,
    totalDirectNormalExposureKilowattHoursPerSquareMeter: directions.reduce(
      (sum, direction) => sum + direction.weightKilowattHoursPerSquareMeter,
      0,
    ),
    timeStepMinutes,
  }
}

export function buildDirectDirectionSet(
  period: DirectExposurePeriod,
  maximumDirections: number,
): DirectDirectionSet {
  const temporalDirections = generateTemporalDirections(period)
  return clusterTemporalDirections(
    temporalDirections,
    maximumDirections,
    temporalDirections.length,
    period.timeStepMinutes,
  )
}

export function buildClimateDirectDirectionSet(
  period: ClimateDirectExposurePeriod,
  maximumDirections: number,
  climate: ClimateModel,
): DirectDirectionSet {
  const temporal = generateClimateTemporalDirections(period, climate)
  return clusterTemporalDirections(
    temporal.directions,
    maximumDirections,
    temporal.sampleCount,
    period.timeStepMinutes,
  )
}

export function createAccumulatedDirectEvaluator(
  project: LandscapeProject,
  directionSet: DirectDirectionSet,
): (surface: SurfacePoint) => AccumulatedDirectResult {
  const primitives = project.entities.filter(
    (entity): entity is PrimitiveEntity => entity.kind === 'primitive',
  )
  const rotation = project.coordinates.northRotationRadians
  const cosRotation = Math.cos(rotation)
  const sinRotation = Math.sin(rotation)
  const preparedDirections = directionSet.directions.map((weighted) => ({
    direction: {
      x: weighted.direction.east * cosRotation -
        weighted.direction.north * sinRotation,
      y: weighted.direction.up,
      z: -(
        weighted.direction.east * sinRotation +
        weighted.direction.north * cosRotation
      ),
    },
    weight: weighted.weightKilowattHoursPerSquareMeter,
  }))

  return (surface) => {
    const normal = normalize({
      x: surface.normal.east,
      y: surface.normal.up,
      z: -surface.normal.north,
    })
    const origin = {
      x: surface.eastMeters,
      y: surface.elevationMeters,
      z: -surface.northMeters,
    }
    let directExposureKilowattHoursPerSquareMeter = 0
    preparedDirections.forEach(({ direction, weight }) => {
      const incidence = Math.max(
        0,
        normal.x * direction.x +
          normal.y * direction.y +
          normal.z * direction.z,
      )
      if (incidence === 0) return
      const transmission = tracePrimitiveTransmission(
        { origin, direction },
        primitives,
        surface.owningEntityId,
      ).transmission
      directExposureKilowattHoursPerSquareMeter +=
        weight * incidence * transmission
    })
    return { directExposureKilowattHoursPerSquareMeter }
  }
}
