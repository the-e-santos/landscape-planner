import type { SolarPositionInput } from './solarPosition'
import type { SkyPatch } from './skyPatches'

export type SyntheticSkyCondition = 'clear' | 'overcast'

export interface ClimateInstant extends SolarPositionInput {
  readonly skyCondition: SyntheticSkyCondition
}

export interface ClimateModel {
  readonly id: string
  readonly label: string
  getDirectNormalIrradiance(
    instant: ClimateInstant,
  ): number
  getDiffuseHorizontalIrradiance(
    instant: ClimateInstant,
  ): number
  getSkyRadiance(
    instant: ClimateInstant,
    patch: SkyPatch,
  ): number
}

export interface OvercastProbabilityPoint {
  /** Apparent local solar time in the closed interval 0 through 24. */
  readonly localSolarTimeHours: number
  readonly probability: number
}

export function overcastProbabilityAt(
  curve: readonly OvercastProbabilityPoint[],
  localSolarTimeHours: number,
): number {
  if (!Number.isFinite(localSolarTimeHours) || localSolarTimeHours < 0 || localSolarTimeHours > 24) {
    throw new Error('Local solar time must be between 0 and 24 hours')
  }
  if (curve.length === 0) {
    throw new Error('Overcast-probability curve must contain at least one point')
  }
  let previousTime = -1
  curve.forEach((point) => {
    if (!Number.isFinite(point.localSolarTimeHours) || point.localSolarTimeHours < 0 || point.localSolarTimeHours > 24) {
      throw new Error('Overcast-probability times must be between 0 and 24 hours')
    }
    if (!Number.isFinite(point.probability) || point.probability < 0 || point.probability > 1) {
      throw new Error('Overcast probabilities must be between 0 and 1')
    }
    if (point.localSolarTimeHours <= previousTime) {
      throw new Error('Overcast-probability times must be strictly increasing')
    }
    previousTime = point.localSolarTimeHours
  })

  if (localSolarTimeHours <= curve[0].localSolarTimeHours) {
    return curve[0].probability
  }
  const last = curve[curve.length - 1]
  if (localSolarTimeHours >= last.localSolarTimeHours) return last.probability

  const upperIndex = curve.findIndex(
    ({ localSolarTimeHours: time }) => time >= localSolarTimeHours,
  )
  const lower = curve[upperIndex - 1]
  const upper = curve[upperIndex]
  const fraction = (
    localSolarTimeHours - lower.localSolarTimeHours
  ) / (upper.localSolarTimeHours - lower.localSolarTimeHours)
  return lower.probability + (upper.probability - lower.probability) * fraction
}
