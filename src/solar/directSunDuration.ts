import type { LandscapeProject } from '../domain/project'
import type { PrimitiveEntity } from '../domain/primitive'
import type { ClimateDirectExposurePeriod } from './accumulatedDirect'
import type { SurfacePoint } from './pointSolar'
import { tracePrimitiveTransmission } from './rayVisibility'
import { calculateSolarPosition, type SolarDate } from './solarPosition'

export interface DirectSunDurationResult {
  /** Time with positive surface incidence and a nonzero solar-disk path. */
  readonly potentialDirectSunHours: number
  /** Potential duration weighted by constant path transmission. */
  readonly transmissionWeightedDirectSunHours: number
  readonly temporalSampleCount: number
}

interface SunDurationSample {
  readonly direction: {
    readonly east: number
    readonly up: number
    readonly north: number
  }
  readonly durationHours: number
}

const DAY_MILLISECONDS = 86_400_000

function dateToUtcMilliseconds(date: SolarDate): number {
  const value = Date.UTC(date.year, date.month - 1, date.day)
  const normalized = new Date(value)
  if (
    normalized.getUTCFullYear() !== date.year ||
    normalized.getUTCMonth() + 1 !== date.month ||
    normalized.getUTCDate() !== date.day
  ) throw new Error('Direct-sun period contains an invalid Gregorian date')
  return value
}

function dateFromMilliseconds(value: number): SolarDate {
  const date = new Date(value)
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  }
}

function buildSunDurationSamples(
  period: ClimateDirectExposurePeriod,
): readonly SunDurationSample[] {
  const start = dateToUtcMilliseconds(period.startDate)
  const end = dateToUtcMilliseconds(period.endDate)
  if (end < start) throw new Error('Direct-sun period end date must not precede its start date')
  if ((end - start) / DAY_MILLISECONDS > 366) {
    throw new Error('Direct-sun period must not exceed 367 inclusive days')
  }
  if (!Number.isFinite(period.latitudeRadians) || Math.abs(period.latitudeRadians) > Math.PI / 2) {
    throw new Error('Latitude must be between -90 and 90 degrees')
  }
  if (!Number.isFinite(period.timeStepMinutes) || period.timeStepMinutes <= 0 || period.timeStepMinutes > 1_440) {
    throw new Error('Temporal step must be between 0 and 1440 minutes')
  }

  const samples: SunDurationSample[] = []
  for (let day = start; day <= end; day += DAY_MILLISECONDS) {
    const date = dateFromMilliseconds(day)
    for (let startMinute = 0; startMinute < 1_440; startMinute += period.timeStepMinutes) {
      const durationMinutes = Math.min(period.timeStepMinutes, 1_440 - startMinute)
      const position = calculateSolarPosition({
        date,
        latitudeRadians: period.latitudeRadians,
        localSolarTimeHours: (startMinute + durationMinutes / 2) / 60,
      })
      if (!position.aboveHorizon) continue
      const horizontal = Math.cos(position.altitudeRadians)
      samples.push({
        direction: {
          east: Math.sin(position.azimuthRadians) * horizontal,
          up: Math.sin(position.altitudeRadians),
          north: Math.cos(position.azimuthRadians) * horizontal,
        },
        durationHours: durationMinutes / 60,
      })
    }
  }
  return samples
}

export function createDirectSunDurationEvaluator(
  project: LandscapeProject,
  period: ClimateDirectExposurePeriod,
): (surface: SurfacePoint) => DirectSunDurationResult {
  const primitives = project.entities.filter(
    (entity): entity is PrimitiveEntity => entity.kind === 'primitive',
  )
  const samples = buildSunDurationSamples(period)
  const rotation = project.coordinates.northRotationRadians
  const cosRotation = Math.cos(rotation)
  const sinRotation = Math.sin(rotation)
  const localSamples = samples.map((sample) => ({
    direction: {
      x: sample.direction.east * cosRotation - sample.direction.north * sinRotation,
      y: sample.direction.up,
      z: -(sample.direction.east * sinRotation + sample.direction.north * cosRotation),
    },
    durationHours: sample.durationHours,
  }))

  return (surface) => {
    const normalLength = Math.hypot(
      surface.normal.east,
      surface.normal.up,
      surface.normal.north,
    )
    if (!Number.isFinite(normalLength) || normalLength === 0) {
      throw new Error('Surface normal must have a finite, nonzero length')
    }
    const normal = {
      x: surface.normal.east / normalLength,
      y: surface.normal.up / normalLength,
      z: -surface.normal.north / normalLength,
    }
    const origin = {
      x: surface.eastMeters,
      y: surface.elevationMeters,
      z: -surface.northMeters,
    }
    let potentialDirectSunHours = 0
    let transmissionWeightedDirectSunHours = 0

    localSamples.forEach(({ direction, durationHours }) => {
      const incidence = normal.x * direction.x +
        normal.y * direction.y + normal.z * direction.z
      if (incidence <= 0) return
      const transmission = tracePrimitiveTransmission(
        { origin, direction },
        primitives,
        surface.owningEntityId,
      ).transmission
      if (transmission > 0) potentialDirectSunHours += durationHours
      transmissionWeightedDirectSunHours += durationHours * transmission
    })

    return {
      potentialDirectSunHours,
      transmissionWeightedDirectSunHours,
      temporalSampleCount: samples.length,
    }
  }
}
