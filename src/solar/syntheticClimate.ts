import {
  type ClimateInstant,
  type ClimateModel,
  type SyntheticSkyCondition,
} from './climateModel'
import { calculateSolarPosition } from './solarPosition'
import {
  TREGENZA_SKY_PATCHES,
  type SkyPatch,
} from './skyPatches'

export interface SyntheticClimateParameters {
  readonly clear: {
    /** Reference DNI at relative optical air mass one. */
    readonly referenceDirectNormalIrradianceWattsPerSquareMeter: number
    /** Reference DHI when the sun is at zenith. */
    readonly referenceDiffuseHorizontalIrradianceWattsPerSquareMeter: number
  }
  readonly overcast: {
    readonly referenceDirectNormalIrradianceWattsPerSquareMeter: number
    readonly referenceDiffuseHorizontalIrradianceWattsPerSquareMeter: number
  }
}

export const DEFAULT_SYNTHETIC_CLIMATE: SyntheticClimateParameters = {
  clear: {
    referenceDirectNormalIrradianceWattsPerSquareMeter: 850,
    referenceDiffuseHorizontalIrradianceWattsPerSquareMeter: 120,
  },
  overcast: {
    referenceDirectNormalIrradianceWattsPerSquareMeter: 0,
    referenceDiffuseHorizontalIrradianceWattsPerSquareMeter: 250,
  },
}

function validateIrradiance(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative finite number`)
  }
  return value
}

const DEGREES_TO_RADIANS = Math.PI / 180
const RADIANS_TO_DEGREES = 180 / Math.PI
const SOLAR_CONSTANT_WATTS_PER_SQUARE_METER = 1_361

function dayOfYear(date: ClimateInstant['date']): number {
  const start = Date.UTC(date.year, 0, 1)
  const value = Date.UTC(date.year, date.month - 1, date.day)
  const normalized = new Date(value)
  if (
    normalized.getUTCFullYear() !== date.year ||
    normalized.getUTCMonth() + 1 !== date.month ||
    normalized.getUTCDate() !== date.day
  ) throw new Error('Synthetic climate requires a valid Gregorian date')
  return Math.floor((value - start) / 86_400_000) + 1
}

export function extraterrestrialNormalIrradianceWattsPerSquareMeter(
  date: ClimateInstant['date'],
): number {
  const orbitalAngle = 2 * Math.PI * (dayOfYear(date) - 3) / 365
  return SOLAR_CONSTANT_WATTS_PER_SQUARE_METER * (
    1 + 0.033 * Math.cos(orbitalAngle)
  )
}

/** Kasten-Young 1989 relative optical air mass at sea level. */
export function relativeOpticalAirMass(altitudeRadians: number): number {
  if (!Number.isFinite(altitudeRadians)) {
    throw new Error('Solar altitude must be finite')
  }
  if (altitudeRadians <= 0) return Number.POSITIVE_INFINITY
  const zenithDegrees = 90 - altitudeRadians * RADIANS_TO_DEGREES
  return 1 / (
    Math.cos(zenithDegrees * DEGREES_TO_RADIANS) +
    0.50572 * (96.07995 - zenithDegrees) ** -1.6364
  )
}

function directNormalIrradiance(
  referenceDni: number,
  altitudeRadians: number,
  extraterrestrialDni: number,
): number {
  if (referenceDni === 0 || altitudeRadians <= 0) return 0
  if (referenceDni >= extraterrestrialDni) {
    throw new Error('Reference DNI must be below extraterrestrial irradiance')
  }
  const opticalDepth = -Math.log(referenceDni / extraterrestrialDni)
  return extraterrestrialDni * Math.exp(
    -opticalDepth * relativeOpticalAirMass(altitudeRadians),
  )
}

function angularSeparation(
  left: SkyPatch['direction'],
  right: SkyPatch['direction'],
): number {
  const dot = left.east * right.east + left.up * right.up + left.north * right.north
  return Math.acos(Math.max(-1, Math.min(1, dot)))
}

function relativeRadiance(
  condition: SyntheticSkyCondition,
  patch: SkyPatch,
  sunDirection: SkyPatch['direction'],
): number {
  if (condition === 'overcast') {
    // CIE-style overcast gradation: zenith is three times the horizon.
    return 1 + 2 * patch.direction.up
  }
  const separation = angularSeparation(patch.direction, sunDirection)
  const circumsolar = 4 * Math.exp(-(separation ** 2) / (2 * 0.22 ** 2))
  const horizonBrightening = 0.35 * Math.exp(-patch.altitudeRadians / 0.18)
  return 1 + circumsolar + horizonBrightening
}

export function createSyntheticClimateModel(
  parameters: SyntheticClimateParameters = DEFAULT_SYNTHETIC_CLIMATE,
): ClimateModel {
  for (const [condition, values] of Object.entries(parameters)) {
    validateIrradiance(
      values.referenceDirectNormalIrradianceWattsPerSquareMeter,
      `${condition} DNI`,
    )
    validateIrradiance(
      values.referenceDiffuseHorizontalIrradianceWattsPerSquareMeter,
      `${condition} DHI`,
    )
  }

  const irradianceFor = (condition: SyntheticSkyCondition) => parameters[condition]

  return {
    id: 'synthetic.clear-overcast.v1',
    label: 'Synthetic clear/overcast model',
    getDirectNormalIrradiance(instant) {
      const position = calculateSolarPosition(instant)
      const values = irradianceFor(instant.skyCondition)
      return directNormalIrradiance(
        values.referenceDirectNormalIrradianceWattsPerSquareMeter,
        position.altitudeRadians,
        extraterrestrialNormalIrradianceWattsPerSquareMeter(instant.date),
      )
    },
    getDiffuseHorizontalIrradiance(instant) {
      const position = calculateSolarPosition(instant)
      return position.aboveHorizon
        ? irradianceFor(instant.skyCondition)
          .referenceDiffuseHorizontalIrradianceWattsPerSquareMeter *
            Math.sin(position.altitudeRadians)
        : 0
    },
    getSkyRadiance(instant: ClimateInstant, patch: SkyPatch) {
      const position = calculateSolarPosition(instant)
      if (!position.aboveHorizon) return 0
      const horizontal = Math.cos(position.altitudeRadians)
      const sunDirection = {
        east: Math.sin(position.azimuthRadians) * horizontal,
        up: Math.sin(position.altitudeRadians),
        north: Math.cos(position.azimuthRadians) * horizontal,
      }
      const denominator = TREGENZA_SKY_PATCHES.reduce(
        (sum, candidate) => sum +
          relativeRadiance(instant.skyCondition, candidate, sunDirection) *
          candidate.direction.up * candidate.solidAngleSteradians,
        0,
      )
      const dhi = this.getDiffuseHorizontalIrradiance(instant)
      return dhi * relativeRadiance(instant.skyCondition, patch, sunDirection) /
        denominator
    },
  }
}
