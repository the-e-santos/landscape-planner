import type { LandscapeProject } from '../domain/project'
import {
  buildClimateDirectDirectionSet,
  createAccumulatedDirectEvaluator,
  type ClimateDirectExposurePeriod,
} from './accumulatedDirect'
import type { SyntheticSkyCondition } from './climateModel'
import {
  buildIntegratedDiffuseSky,
  createAccumulatedDiffuseEvaluator,
  createInstantDiffuseEvaluator,
} from './diffuseExposure'
import {
  createDirectPointSolarEvaluator,
  type SurfacePoint,
} from './pointSolar'
import type { SolarPositionInput } from './solarPosition'
import { calculateSolarPosition } from './solarPosition'
import { TREGENZA_SKY_PATCHES } from './skyPatches'
import {
  createSyntheticClimateModel,
  type SyntheticClimateParameters,
} from './syntheticClimate'

export type ExposureDisplayChannel = 'direct' | 'diffuse' | 'total'
export type ExposureQuantity = 'irradiance' | 'radiantExposure'

interface EnabledHeatmapBase {
  readonly enabled: true
  readonly spacingMeters: number
  readonly displayChannel: ExposureDisplayChannel
  readonly climateParameters: SyntheticClimateParameters
}

export type SolarHeatmapSettings =
  | { readonly enabled: false }
  | (EnabledHeatmapBase & {
      readonly analysisMode: 'instant'
      readonly solarPosition: SolarPositionInput
      readonly skyCondition: SyntheticSkyCondition
    })
  | (EnabledHeatmapBase & {
      readonly analysisMode: 'accumulated'
      readonly period: ClimateDirectExposurePeriod
      readonly maximumDirections: number
    })

export interface ExposureValues {
  readonly direct: number
  readonly diffuse: number
  readonly total: number
}

export interface PreparedSurfaceExposure {
  readonly evaluate: (surface: SurfacePoint) => ExposureValues
  readonly quantity: ExposureQuantity
  readonly unit: 'W/m²' | 'kWh/m²'
  readonly scaleMaximum: number
  readonly directionCount: number
  readonly temporalSampleCount: number
  readonly visibilityDirections: readonly {
    readonly channel: 'direct' | 'diffuse'
    /** Unit illumination direction in local east/up/north coordinates. */
    readonly direction: {
      readonly east: number
      readonly up: number
      readonly north: number
    }
    /** Irradiance or radiant-exposure contribution before incidence/visibility. */
    readonly weight: number
  }[]
  /** Unit illumination directions in local east/up/north coordinates. */
  readonly illuminationDirections: readonly {
    readonly east: number
    readonly up: number
    readonly north: number
  }[]
}

export interface SolarCalculationProgress {
  readonly status: 'idle' | 'calculating' | 'complete' | 'error'
  readonly stage: number
  readonly stageCount: number
  readonly spacingMeters?: number
  readonly directionCount?: number
  readonly temporalSampleCount?: number
  readonly surfaceSampleCount?: number
  readonly evaluatedSurfaceSampleCount?: number
  readonly unit?: 'W/m²' | 'kWh/m²'
  readonly scaleMaximum?: number
  readonly dirtyTileCount?: number
  readonly totalTileCount?: number
  readonly computeBackend?: 'cpu' | 'webgpu'
  readonly fallbackReason?: string
  readonly message: string
}

interface TrueNorthDirection {
  readonly east: number
  readonly up: number
  readonly north: number
}

export function prepareSurfaceExposure(
  project: LandscapeProject,
  settings: Extract<SolarHeatmapSettings, { readonly enabled: true }>,
): PreparedSurfaceExposure {
  const climate = createSyntheticClimateModel(settings.climateParameters)
  const rotation = project.coordinates.northRotationRadians
  const cosRotation = Math.cos(rotation)
  const sinRotation = Math.sin(rotation)
  const toLocalDirection = (direction: TrueNorthDirection) => ({
    east: direction.east * cosRotation - direction.north * sinRotation,
    up: direction.up,
    north: direction.east * sinRotation + direction.north * cosRotation,
  })

  if (settings.analysisMode === 'instant') {
    const solarPosition = calculateSolarPosition(settings.solarPosition)
    const instant = {
      ...settings.solarPosition,
      skyCondition: settings.skyCondition,
    }
    const dni = climate.getDirectNormalIrradiance(instant)
    const dhi = climate.getDiffuseHorizontalIrradiance(instant)
    const evaluateDirect = createDirectPointSolarEvaluator(
      project,
      settings.solarPosition,
      dni,
    )
    const evaluateDiffuse = createInstantDiffuseEvaluator(project, climate, instant)
    const cosAltitude = Math.cos(solarPosition.altitudeRadians)
    const directDirection = {
      east: Math.sin(solarPosition.azimuthRadians) * cosAltitude,
      up: Math.sin(solarPosition.altitudeRadians),
      north: Math.cos(solarPosition.azimuthRadians) * cosAltitude,
    }
    const trueDirections = [
      ...(solarPosition.aboveHorizon && dni > 0
        ? [{ channel: 'direct' as const, direction: directDirection, weight: dni }]
        : []),
      ...(dhi > 0 ? TREGENZA_SKY_PATCHES.map((patch) => ({
        channel: 'diffuse' as const,
        direction: patch.direction,
        weight: climate.getSkyRadiance(instant, patch) *
          patch.solidAngleSteradians,
      })) : []),
    ]
    const visibilityDirections = trueDirections.map((direction) => ({
      ...direction,
      direction: toLocalDirection(direction.direction),
    }))
    return {
      evaluate: (surface) => {
        const direct = evaluateDirect(surface).directIrradianceWattsPerSquareMeter
        const diffuse = evaluateDiffuse(surface)
        return { direct, diffuse, total: direct + diffuse }
      },
      quantity: 'irradiance',
      unit: 'W/m²',
      scaleMaximum: settings.displayChannel === 'direct'
        ? dni
        : settings.displayChannel === 'diffuse'
          ? dhi
          : dni + dhi,
      directionCount: trueDirections.length,
      temporalSampleCount: 1,
      visibilityDirections,
      illuminationDirections: visibilityDirections.map(({ direction }) =>
        direction
      ),
    }
  }

  const directionSet = buildClimateDirectDirectionSet(
    settings.period,
    settings.maximumDirections,
    climate,
  )
  const evaluateDirect = createAccumulatedDirectEvaluator(project, directionSet)
  const integratedSky = buildIntegratedDiffuseSky(settings.period, climate)
  const evaluateDiffuse = createAccumulatedDiffuseEvaluator(project, integratedSky)
  const diffuseDirections = integratedSky.patches
    .filter(({ radianceExposureKilowattHoursPerSquareMeterSteradian }) =>
      radianceExposureKilowattHoursPerSquareMeterSteradian > 0
    )
    .map((patch) => ({
      channel: 'diffuse' as const,
      direction: patch.direction,
      weight: patch.radianceExposureKilowattHoursPerSquareMeterSteradian *
        patch.solidAngleSteradians,
    }))
  const trueDirections = [
    ...directionSet.directions.map((direction) => ({
      channel: 'direct' as const,
      direction: direction.direction,
      weight: direction.weightKilowattHoursPerSquareMeter,
    })),
    ...diffuseDirections,
  ]
  const visibilityDirections = trueDirections.map((direction) => ({
    ...direction,
    direction: toLocalDirection(direction.direction),
  }))

  return {
    evaluate: (surface) => {
      const direct = evaluateDirect(surface)
        .directExposureKilowattHoursPerSquareMeter
      const diffuse = evaluateDiffuse(surface)
      return { direct, diffuse, total: direct + diffuse }
    },
    quantity: 'radiantExposure',
    unit: 'kWh/m²',
    scaleMaximum: settings.displayChannel === 'direct'
      ? directionSet.totalDirectNormalExposureKilowattHoursPerSquareMeter
      : settings.displayChannel === 'diffuse'
        ? integratedSky.expectedDiffuseHorizontalExposureKilowattHoursPerSquareMeter
        : directionSet.totalDirectNormalExposureKilowattHoursPerSquareMeter +
          integratedSky.expectedDiffuseHorizontalExposureKilowattHoursPerSquareMeter,
    directionCount: trueDirections.length,
    temporalSampleCount: integratedSky.temporalSampleCount,
    visibilityDirections,
    illuminationDirections: visibilityDirections.map(({ direction }) =>
      direction
    ),
  }
}
