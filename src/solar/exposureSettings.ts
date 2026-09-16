import type { LandscapeProject } from '../domain/project'
import {
  buildDirectDirectionSet,
  createAccumulatedDirectEvaluator,
  type DirectExposurePeriod,
} from './accumulatedDirect'
import {
  createDirectPointSolarEvaluator,
  type SurfacePoint,
} from './pointSolar'
import type { SolarPositionInput } from './solarPosition'
import { calculateSolarPosition } from './solarPosition'

export type ExposureDisplayChannel = 'direct' | 'diffuse' | 'total'
export type ExposureQuantity = 'irradiance' | 'radiantExposure'

interface EnabledHeatmapBase {
  readonly enabled: true
  readonly spacingMeters: number
  readonly displayChannel: ExposureDisplayChannel
}

export type SolarHeatmapSettings =
  | { readonly enabled: false }
  | (EnabledHeatmapBase & {
      readonly analysisMode: 'instant'
      readonly solarPosition: SolarPositionInput
      readonly directNormalIrradianceWattsPerSquareMeter: number
    })
  | (EnabledHeatmapBase & {
      readonly analysisMode: 'accumulated'
      readonly period: DirectExposurePeriod
      readonly maximumDirections: number
    })

export interface ExposureValues {
  readonly direct: number
  /** Explicit zero placeholder until Milestone 10. */
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
  readonly message: string
}

export function prepareSurfaceExposure(
  project: LandscapeProject,
  settings: Extract<SolarHeatmapSettings, { readonly enabled: true }>,
): PreparedSurfaceExposure {
  if (settings.analysisMode === 'instant') {
    const solarPosition = calculateSolarPosition(settings.solarPosition)
    const relativeAzimuth = solarPosition.azimuthRadians -
      project.coordinates.northRotationRadians
    const cosAltitude = Math.cos(solarPosition.altitudeRadians)
    const evaluateDirect = createDirectPointSolarEvaluator(
      project,
      settings.solarPosition,
      settings.directNormalIrradianceWattsPerSquareMeter,
    )
    return {
      evaluate: (surface) => {
        const direct = evaluateDirect(surface)
          .directIrradianceWattsPerSquareMeter
        return { direct, diffuse: 0, total: direct }
      },
      quantity: 'irradiance',
      unit: 'W/m²',
      scaleMaximum: settings.directNormalIrradianceWattsPerSquareMeter,
      directionCount: 1,
      temporalSampleCount: 1,
      illuminationDirections: solarPosition.aboveHorizon
        ? [{
            east: Math.sin(relativeAzimuth) * cosAltitude,
            up: Math.sin(solarPosition.altitudeRadians),
            north: Math.cos(relativeAzimuth) * cosAltitude,
          }]
        : [],
    }
  }

  const directionSet = buildDirectDirectionSet(
    settings.period,
    settings.maximumDirections,
  )
  const evaluateDirect = createAccumulatedDirectEvaluator(project, directionSet)
  const rotation = project.coordinates.northRotationRadians
  const cosRotation = Math.cos(rotation)
  const sinRotation = Math.sin(rotation)
  return {
    evaluate: (surface) => {
      const direct = evaluateDirect(surface)
        .directExposureKilowattHoursPerSquareMeter
      return { direct, diffuse: 0, total: direct }
    },
    quantity: 'radiantExposure',
    unit: 'kWh/m²',
    scaleMaximum:
      directionSet.totalDirectNormalExposureKilowattHoursPerSquareMeter,
    directionCount: directionSet.directions.length,
    temporalSampleCount: directionSet.temporalSampleCount,
    illuminationDirections: directionSet.directions.map(({ direction }) => ({
      east: direction.east * cosRotation - direction.north * sinRotation,
      up: direction.up,
      north: direction.east * sinRotation + direction.north * cosRotation,
    })),
  }
}
