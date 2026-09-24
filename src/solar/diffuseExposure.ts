import type { LandscapeProject } from '../domain/project'
import type { PrimitiveEntity } from '../domain/primitive'
import {
  overcastProbabilityAt,
  type ClimateInstant,
  type ClimateModel,
  type OvercastProbabilityPoint,
  type SyntheticSkyCondition,
} from './climateModel'
import type { SurfacePoint } from './pointSolar'
import { tracePrimitiveTransmission } from './rayVisibility'
import { calculateSolarPosition, type SolarDate } from './solarPosition'
import { TREGENZA_SKY_PATCHES } from './skyPatches'

export interface DiffuseExposurePeriod {
  readonly startDate: SolarDate
  readonly endDate: SolarDate
  readonly latitudeRadians: number
  readonly timeStepMinutes: number
  readonly overcastProbabilityCurve: readonly OvercastProbabilityPoint[]
}

export interface IntegratedSkyPatch {
  readonly patchId: string
  readonly direction: {
    readonly east: number
    readonly up: number
    readonly north: number
  }
  readonly solidAngleSteradians: number
  readonly radianceExposureKilowattHoursPerSquareMeterSteradian: number
}

export interface IntegratedDiffuseSky {
  readonly patches: readonly IntegratedSkyPatch[]
  readonly temporalSampleCount: number
  readonly expectedDiffuseHorizontalExposureKilowattHoursPerSquareMeter: number
  readonly timeStepMinutes: number
}

const DAY_MILLISECONDS = 86_400_000

function dateToUtcMilliseconds(date: SolarDate): number {
  const value = Date.UTC(date.year, date.month - 1, date.day)
  const normalized = new Date(value)
  if (
    normalized.getUTCFullYear() !== date.year ||
    normalized.getUTCMonth() + 1 !== date.month ||
    normalized.getUTCDate() !== date.day
  ) throw new Error('Diffuse exposure period contains an invalid Gregorian date')
  return value
}

function validatePeriod(period: DiffuseExposurePeriod): {
  readonly startMilliseconds: number
  readonly endMilliseconds: number
} {
  const startMilliseconds = dateToUtcMilliseconds(period.startDate)
  const endMilliseconds = dateToUtcMilliseconds(period.endDate)
  if (endMilliseconds < startMilliseconds) {
    throw new Error('Diffuse exposure period end date must not precede its start date')
  }
  if ((endMilliseconds - startMilliseconds) / DAY_MILLISECONDS > 366) {
    throw new Error('Diffuse exposure period must not exceed 367 inclusive days')
  }
  if (!Number.isFinite(period.latitudeRadians) || Math.abs(period.latitudeRadians) > Math.PI / 2) {
    throw new Error('Latitude must be between -90 and 90 degrees')
  }
  if (!Number.isFinite(period.timeStepMinutes) || period.timeStepMinutes <= 0 || period.timeStepMinutes > 1_440) {
    throw new Error('Temporal step must be between 0 and 1440 minutes')
  }
  // Validate the entire curve even if the first temporal sample is at another time.
  overcastProbabilityAt(period.overcastProbabilityCurve, 0)
  return { startMilliseconds, endMilliseconds }
}

function dateFromMilliseconds(value: number): SolarDate {
  const date = new Date(value)
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  }
}

function climateInstant(
  date: SolarDate,
  latitudeRadians: number,
  localSolarTimeHours: number,
  skyCondition: SyntheticSkyCondition,
): ClimateInstant {
  return { date, latitudeRadians, localSolarTimeHours, skyCondition }
}

export function buildIntegratedDiffuseSky(
  period: DiffuseExposurePeriod,
  climate: ClimateModel,
): IntegratedDiffuseSky {
  const { startMilliseconds, endMilliseconds } = validatePeriod(period)
  const radiance = TREGENZA_SKY_PATCHES.map(() => 0)
  let temporalSampleCount = 0
  let expectedDhiExposure = 0

  for (let day = startMilliseconds; day <= endMilliseconds; day += DAY_MILLISECONDS) {
    const date = dateFromMilliseconds(day)
    for (let startMinute = 0; startMinute < 1_440; startMinute += period.timeStepMinutes) {
      const durationMinutes = Math.min(period.timeStepMinutes, 1_440 - startMinute)
      const localSolarTimeHours = (startMinute + durationMinutes / 2) / 60
      const baseInstant = { date, latitudeRadians: period.latitudeRadians, localSolarTimeHours }
      if (!calculateSolarPosition(baseInstant).aboveHorizon) continue
      const probability = overcastProbabilityAt(
        period.overcastProbabilityCurve,
        localSolarTimeHours,
      )
      const clear = climateInstant(date, period.latitudeRadians, localSolarTimeHours, 'clear')
      const overcast = climateInstant(date, period.latitudeRadians, localSolarTimeHours, 'overcast')
      const durationHours = durationMinutes / 60
      expectedDhiExposure += (
        climate.getDiffuseHorizontalIrradiance(clear) * (1 - probability) +
        climate.getDiffuseHorizontalIrradiance(overcast) * probability
      ) * durationHours / 1_000
      TREGENZA_SKY_PATCHES.forEach((patch, index) => {
        radiance[index] += (
          climate.getSkyRadiance(clear, patch) * (1 - probability) +
          climate.getSkyRadiance(overcast, patch) * probability
        ) * durationHours / 1_000
      })
      temporalSampleCount += 1
    }
  }

  return {
    patches: TREGENZA_SKY_PATCHES.map((patch, index) => ({
      patchId: patch.id,
      direction: patch.direction,
      solidAngleSteradians: patch.solidAngleSteradians,
      radianceExposureKilowattHoursPerSquareMeterSteradian: radiance[index],
    })),
    temporalSampleCount,
    expectedDiffuseHorizontalExposureKilowattHoursPerSquareMeter: expectedDhiExposure,
    timeStepMinutes: period.timeStepMinutes,
  }
}

interface WeightedDiffuseDirection {
  readonly direction: IntegratedSkyPatch['direction']
  readonly weight: number
}

function createDiffuseEvaluator(
  project: LandscapeProject,
  directions: readonly WeightedDiffuseDirection[],
): (surface: SurfacePoint) => number {
  const primitives = project.entities.filter(
    (entity): entity is PrimitiveEntity => entity.kind === 'primitive',
  )
  const rotation = project.coordinates.northRotationRadians
  const cosRotation = Math.cos(rotation)
  const sinRotation = Math.sin(rotation)
  const localDirections = directions.map(({ direction, weight }) => ({
    direction: {
      x: direction.east * cosRotation - direction.north * sinRotation,
      y: direction.up,
      z: -(direction.east * sinRotation + direction.north * cosRotation),
    },
    weight,
  }))

  return (surface) => {
    const normalLength = Math.hypot(surface.normal.east, surface.normal.up, surface.normal.north)
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
    return localDirections.reduce((sum, { direction, weight }) => {
      const incidence = Math.max(
        0,
        normal.x * direction.x + normal.y * direction.y + normal.z * direction.z,
      )
      if (incidence === 0 || weight === 0) return sum
      const transmission = tracePrimitiveTransmission(
        { origin, direction },
        primitives,
        surface.owningEntityId,
      ).transmission
      return sum + weight * incidence * transmission
    }, 0)
  }
}

export function createInstantDiffuseEvaluator(
  project: LandscapeProject,
  climate: ClimateModel,
  instant: ClimateInstant,
): (surface: SurfacePoint) => number {
  return createDiffuseEvaluator(
    project,
    TREGENZA_SKY_PATCHES.map((patch) => ({
      direction: patch.direction,
      weight: climate.getSkyRadiance(instant, patch) * patch.solidAngleSteradians,
    })),
  )
}

export function createAccumulatedDiffuseEvaluator(
  project: LandscapeProject,
  sky: IntegratedDiffuseSky,
): (surface: SurfacePoint) => number {
  return createDiffuseEvaluator(
    project,
    sky.patches.map((patch) => ({
      direction: patch.direction,
      weight: patch.radianceExposureKilowattHoursPerSquareMeterSteradian *
        patch.solidAngleSteradians,
    })),
  )
}
