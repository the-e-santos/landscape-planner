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
    readonly directNormalIrradianceWattsPerSquareMeter: number
    readonly diffuseHorizontalIrradianceWattsPerSquareMeter: number
  }
  readonly overcast: {
    readonly directNormalIrradianceWattsPerSquareMeter: number
    readonly diffuseHorizontalIrradianceWattsPerSquareMeter: number
  }
}

export const DEFAULT_SYNTHETIC_CLIMATE: SyntheticClimateParameters = {
  clear: {
    directNormalIrradianceWattsPerSquareMeter: 800,
    diffuseHorizontalIrradianceWattsPerSquareMeter: 120,
  },
  overcast: {
    directNormalIrradianceWattsPerSquareMeter: 0,
    diffuseHorizontalIrradianceWattsPerSquareMeter: 250,
  },
}

function validateIrradiance(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative finite number`)
  }
  return value
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
      values.directNormalIrradianceWattsPerSquareMeter,
      `${condition} DNI`,
    )
    validateIrradiance(
      values.diffuseHorizontalIrradianceWattsPerSquareMeter,
      `${condition} DHI`,
    )
  }

  const irradianceFor = (condition: SyntheticSkyCondition) => parameters[condition]

  return {
    id: 'synthetic.clear-overcast.v1',
    label: 'Synthetic clear/overcast model',
    getDirectNormalIrradiance(instant) {
      const position = calculateSolarPosition(instant)
      return position.aboveHorizon
        ? irradianceFor(instant.skyCondition)
          .directNormalIrradianceWattsPerSquareMeter
        : 0
    },
    getDiffuseHorizontalIrradiance(instant) {
      const position = calculateSolarPosition(instant)
      return position.aboveHorizon
        ? irradianceFor(instant.skyCondition)
          .diffuseHorizontalIrradianceWattsPerSquareMeter
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
      const dhi = irradianceFor(instant.skyCondition)
        .diffuseHorizontalIrradianceWattsPerSquareMeter
      return dhi * relativeRadiance(instant.skyCondition, patch, sunDirection) /
        denominator
    },
  }
}
