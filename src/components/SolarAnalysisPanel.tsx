import { useEffect, useMemo, useState } from 'react'
import type { LandscapeProject } from '../domain/project'
import {
  queryDirectPointSolar,
  type SurfacePoint,
} from '../solar/pointSolar'
import {
  degreesToRadians,
  calculateSolarPosition,
  radiansToDegrees,
  type SolarDate,
} from '../solar/solarPosition'
import type {
  ExposureDisplayChannel,
  SolarCalculationProgress,
  SolarHeatmapSettings,
} from '../solar/exposureSettings'
import { prepareSurfaceExposure } from '../solar/exposureSettings'
import { useDraggablePanel } from './useDraggablePanel'
import type { SyntheticSkyCondition } from '../solar/climateModel'
import type { SyntheticClimateParameters } from '../solar/syntheticClimate'
import { interpretAccumulatedExposure } from '../solar/exposureInterpretation'
import { createDirectSunDurationEvaluator } from '../solar/directSunDuration'
import type { SolarComputePreference } from '../solar/computeBackend'

interface SolarAnalysisPanelProps {
  readonly project: LandscapeProject
  readonly computePreference: SolarComputePreference
  readonly onHeatmapChange: (settings: SolarHeatmapSettings) => void
  readonly probedSurface: SurfacePoint | null
  readonly onProbeEnabledChange: (enabled: boolean) => void
  readonly progress: SolarCalculationProgress
  readonly onClose: () => void
}

interface PointInputs {
  readonly eastMeters: number
  readonly elevationMeters: number
  readonly northMeters: number
  readonly normalEast: number
  readonly normalUp: number
  readonly normalNorth: number
  readonly owningEntityId?: string
}

function parseDate(value: string): SolarDate {
  const [year, month, day] = value.split('-').map(Number)
  return { year, month, day }
}

function formatNumber(value: number, digits = 1): string {
  return Number.isFinite(value) ? value.toFixed(digits) : '—'
}

function pointInputsFromSurface(surface: SurfacePoint): PointInputs {
  return {
    eastMeters: surface.eastMeters,
    elevationMeters: surface.elevationMeters,
    northMeters: surface.northMeters,
    normalEast: surface.normal.east,
    normalUp: surface.normal.up,
    normalNorth: surface.normal.north,
    owningEntityId: surface.owningEntityId,
  }
}

export function SolarAnalysisPanel({
  project,
  computePreference,
  onHeatmapChange,
  probedSurface,
  onProbeEnabledChange,
  progress,
  onClose,
}: SolarAnalysisPanelProps) {
  const [collapsed, setCollapsed] = useState(false)
  const { panelRef, dragHandleProps } = useDraggablePanel<HTMLElement>()
  const [date, setDate] = useState('2026-06-21')
  const [solarTimeHours, setSolarTimeHours] = useState(12)
  const [latitudeDegrees, setLatitudeDegrees] = useState(40)
  const [dni, setDni] = useState(850)
  const [clearDhi, setClearDhi] = useState(120)
  const [overcastDni, setOvercastDni] = useState(0)
  const [overcastDhi, setOvercastDhi] = useState(250)
  const [skyCondition, setSkyCondition] =
    useState<SyntheticSkyCondition>('clear')
  const [morningOvercastPercent, setMorningOvercastPercent] = useState(45)
  const [noonOvercastPercent, setNoonOvercastPercent] = useState(25)
  const [eveningOvercastPercent, setEveningOvercastPercent] = useState(50)
  const [heatmapEnabled, setHeatmapEnabled] = useState(false)
  const [heatmapSpacingMeters, setHeatmapSpacingMeters] = useState(1)
  const [displayChannel, setDisplayChannel] =
    useState<ExposureDisplayChannel>('direct')
  const [probeEnabled, setProbeEnabled] = useState(false)
  const [analysisMode, setAnalysisMode] =
    useState<'instant' | 'accumulated'>('instant')
  const [periodStartDate, setPeriodStartDate] = useState('2026-06-01')
  const [periodEndDate, setPeriodEndDate] = useState('2026-06-30')
  const [temporalStepMinutes, setTemporalStepMinutes] = useState(60)
  const [maximumDirections, setMaximumDirections] = useState(64)
  const [pointEdit, setPointEdit] = useState<{
    readonly source: SurfacePoint | null
    readonly values: PointInputs
  }>({
    source: null,
    values: {
      eastMeters: 0,
      elevationMeters: 0.05,
      northMeters: 0,
      normalEast: 0,
      normalUp: 1,
      normalNorth: 0,
    },
  })
  const point = useMemo(
    () => pointEdit.source === probedSurface
      ? pointEdit.values
      : probedSurface
        ? pointInputsFromSurface(probedSurface)
        : pointEdit.values,
    [pointEdit, probedSurface],
  )
  const climateParameters = useMemo<SyntheticClimateParameters>(() => ({
    clear: {
      referenceDirectNormalIrradianceWattsPerSquareMeter: dni,
      referenceDiffuseHorizontalIrradianceWattsPerSquareMeter: clearDhi,
    },
    overcast: {
      referenceDirectNormalIrradianceWattsPerSquareMeter: overcastDni,
      referenceDiffuseHorizontalIrradianceWattsPerSquareMeter: overcastDhi,
    },
  }), [clearDhi, dni, overcastDhi, overcastDni])
  const selectedDni = skyCondition === 'clear' ? dni : overcastDni
  const calculation = useMemo(() => {
    try {
      return {
        result: queryDirectPointSolar(project, {
          solarPosition: {
            date: parseDate(date),
            latitudeRadians: degreesToRadians(latitudeDegrees),
            localSolarTimeHours: solarTimeHours,
          },
          directNormalIrradianceWattsPerSquareMeter: selectedDni,
          surface: {
            eastMeters: point.eastMeters,
            elevationMeters: point.elevationMeters,
            northMeters: point.northMeters,
            normal: {
              east: point.normalEast,
              up: point.normalUp,
              north: point.normalNorth,
            },
            ...(point.owningEntityId
              ? { owningEntityId: point.owningEntityId }
              : {}),
          },
        }),
        error: null,
      }
    } catch (error) {
      return {
        result: null,
        error: error instanceof Error ? error.message : 'Solar query failed',
      }
    }
  }, [date, latitudeDegrees, point, project, selectedDni, solarTimeHours])
  const updatePoint = (key: keyof PointInputs, value: number) => {
    setPointEdit({
      source: probedSurface,
      values: {
        ...point,
        [key]: value,
        owningEntityId: undefined,
      },
    })
  }
  const result = calculation.result
  const analysisSettings = useMemo<SolarHeatmapSettings>(() => {
    try {
      const irradiances = [dni, clearDhi, overcastDni, overcastDhi]
      if (irradiances.some((value) => !Number.isFinite(value) || value < 0)) {
        throw new Error('Invalid synthetic climate irradiance')
      }
      if (!Number.isFinite(heatmapSpacingMeters) || heatmapSpacingMeters <= 0) {
        throw new Error('Invalid spacing')
      }
      if (analysisMode === 'instant') {
        const solarPosition = {
          date: parseDate(date),
          latitudeRadians: degreesToRadians(latitudeDegrees),
          localSolarTimeHours: solarTimeHours,
        }
        calculateSolarPosition(solarPosition)
        return {
          enabled: true,
          analysisMode,
          climateParameters,
          skyCondition,
          solarPosition,
          spacingMeters: heatmapSpacingMeters,
          displayChannel,
        }
      }
      return {
        enabled: true,
        analysisMode,
        climateParameters,
        period: {
          startDate: parseDate(periodStartDate),
          endDate: parseDate(periodEndDate),
          latitudeRadians: degreesToRadians(latitudeDegrees),
          timeStepMinutes: temporalStepMinutes,
          overcastProbabilityCurve: [
            { localSolarTimeHours: 6, probability: morningOvercastPercent / 100 },
            { localSolarTimeHours: 12, probability: noonOvercastPercent / 100 },
            { localSolarTimeHours: 18, probability: eveningOvercastPercent / 100 },
          ],
        },
        maximumDirections,
        spacingMeters: heatmapSpacingMeters,
        displayChannel,
      }
    } catch {
      return { enabled: false }
    }
  }, [analysisMode, clearDhi, climateParameters, date, displayChannel, dni, eveningOvercastPercent, heatmapSpacingMeters, latitudeDegrees, maximumDirections, morningOvercastPercent, noonOvercastPercent, overcastDhi, overcastDni, periodEndDate, periodStartDate, skyCondition, solarTimeHours, temporalStepMinutes])
  const heatmapSettings = useMemo<SolarHeatmapSettings>(
    () => heatmapEnabled ? analysisSettings : { enabled: false },
    [analysisSettings, heatmapEnabled],
  )
  const accumulatedPointCalculation = useMemo(() => {
    if (
      !analysisSettings.enabled ||
      analysisSettings.analysisMode !== 'accumulated'
    ) return {
      exposure: null,
      unobstructedExposure: null,
      directSunDuration: null,
      error: null,
    }
    try {
      const prepared = prepareSurfaceExposure(project, analysisSettings)
      const unobstructedProject = {
        ...project,
        entities: project.entities.filter((entity) => entity.kind !== 'primitive'),
      }
      const unobstructedPrepared = prepareSurfaceExposure(
        unobstructedProject,
        analysisSettings,
      )
      const surface = {
        eastMeters: point.eastMeters,
        elevationMeters: point.elevationMeters,
        northMeters: point.northMeters,
        normal: {
          east: point.normalEast,
          up: point.normalUp,
          north: point.normalNorth,
        },
        ...(point.owningEntityId
          ? { owningEntityId: point.owningEntityId }
          : {}),
      }
      return {
        exposure: prepared.evaluate(surface),
        unobstructedExposure: unobstructedPrepared.evaluate(surface),
        directSunDuration: createDirectSunDurationEvaluator(
          project,
          analysisSettings.period,
        )(surface),
        error: null,
      }
    } catch (error) {
      return {
        exposure: null,
        unobstructedExposure: null,
        directSunDuration: null,
        error: error instanceof Error
          ? error.message
          : 'Accumulated point query failed',
      }
    }
  }, [analysisSettings, point, project])
  const accumulatedInterpretation = useMemo(() => {
    if (
      !analysisSettings.enabled ||
      analysisSettings.analysisMode !== 'accumulated' ||
      !accumulatedPointCalculation.exposure
    ) return null
    return interpretAccumulatedExposure({
      startDate: analysisSettings.period.startDate,
      endDate: analysisSettings.period.endDate,
      directKilowattHoursPerSquareMeter:
        accumulatedPointCalculation.exposure.direct,
      diffuseKilowattHoursPerSquareMeter:
        accumulatedPointCalculation.exposure.diffuse,
      ...(accumulatedPointCalculation.unobstructedExposure
        ? {
            unobstructedTotalKilowattHoursPerSquareMeter:
              accumulatedPointCalculation.unobstructedExposure.total,
          }
        : {}),
    })
  }, [accumulatedPointCalculation, analysisSettings])
  const instantPointCalculation = useMemo(() => {
    if (
      !analysisSettings.enabled ||
      analysisSettings.analysisMode !== 'instant'
    ) return { exposure: null, error: null }
    try {
      const prepared = prepareSurfaceExposure(project, analysisSettings)
      return {
        exposure: prepared.evaluate({
          eastMeters: point.eastMeters,
          elevationMeters: point.elevationMeters,
          northMeters: point.northMeters,
          normal: {
            east: point.normalEast,
            up: point.normalUp,
            north: point.normalNorth,
          },
          ...(point.owningEntityId
            ? { owningEntityId: point.owningEntityId }
            : {}),
        }),
        error: null,
      }
    } catch (error) {
      return {
        exposure: null,
        error: error instanceof Error
          ? error.message
          : 'Instant point query failed',
      }
    }
  }, [analysisSettings, point, project])

  useEffect(() => {
    onHeatmapChange(heatmapSettings)
  }, [heatmapSettings, onHeatmapChange])

  useEffect(() => {
    onProbeEnabledChange(probeEnabled)
  }, [onProbeEnabledChange, probeEnabled])

  return (
    <aside
      ref={panelRef}
      className={`solar-panel${collapsed ? ' panel-collapsed' : ''}`}
    >
      <header
        className="panel-header panel-drag-handle"
        title="Drag to move point solar panel"
        {...dragHandleProps}
      >
        <div>
          <p className="eyebrow">Milestone 10 analysis</p>
          <h1>
            {analysisMode === 'instant'
              ? 'Instant exposure'
              : 'Accumulated exposure'}
          </h1>
        </div>
        <div className="panel-header-actions">
          <button
            className="panel-collapse-button"
            type="button"
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? 'Open' : 'Collapse'}
          </button>
          <button className="panel-close-button" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </header>
      <div className="solar-panel-content">
        <p className="panel-intro">
          {analysisMode === 'instant'
            ? 'CPU-reference values and surface exposure at one solar instant.'
            : 'Direct and diffuse exposure accumulated across a selected calendar period.'}
        </p>
        {computePreference !== 'auto' && (
          <p className="field-note" role="status">
            Diagnostic override: solar computation is forced to{' '}
            {computePreference === 'webgpu' ? 'WebGPU' : 'CPU'}. The completion
            message reports the backend that actually finished the calculation.
          </p>
        )}
        <fieldset className="segmented-field solar-mode-field">
          <legend>Exposure period</legend>
          <div className="segmented-control">
            <button
              type="button"
              aria-pressed={analysisMode === 'instant'}
              onClick={() => setAnalysisMode('instant')}
            >
              Instant
            </button>
            <button
              type="button"
              aria-pressed={analysisMode === 'accumulated'}
              onClick={() => setAnalysisMode('accumulated')}
            >
              Accumulated
            </button>
          </div>
        </fieldset>
        <section
          className="solar-inputs"
          aria-label={analysisMode === 'instant' ? 'Solar instant' : 'Exposure period'}
        >
          {analysisMode === 'instant' ? (
            <>
              <label className="field">
                <span>Date</span>
                <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
              </label>
              <label className="field">
                <span>Solar time</span>
                <input
                  type="number" min="0" max="24" step="0.25"
                  value={solarTimeHours}
                  onChange={(event) => setSolarTimeHours(event.target.valueAsNumber)}
                />
              </label>
              <label className="field">
                <span>Sky condition</span>
                <select
                  value={skyCondition}
                  onChange={(event) => setSkyCondition(
                    event.target.value as SyntheticSkyCondition,
                  )}
                >
                  <option value="clear">Clear</option>
                  <option value="overcast">Overcast</option>
                </select>
              </label>
            </>
          ) : (
            <div className="accumulation-settings">
              <label className="field">
                <span>Start date</span>
                <input
                  type="date"
                  value={periodStartDate}
                  onChange={(event) => setPeriodStartDate(event.target.value)}
                />
              </label>
              <label className="field">
                <span>End date</span>
                <input
                  type="date"
                  value={periodEndDate}
                  onChange={(event) => setPeriodEndDate(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Time step</span>
                <select
                  value={temporalStepMinutes}
                  onChange={(event) => setTemporalStepMinutes(Number(event.target.value))}
                >
                  <option value={120}>2 hours</option>
                  <option value={60}>1 hour</option>
                  <option value={30}>30 minutes</option>
                  <option value={15}>15 minutes</option>
                </select>
              </label>
              <label className="field">
                <span>Final directions</span>
                <select
                  value={maximumDirections}
                  onChange={(event) => setMaximumDirections(Number(event.target.value))}
                >
                  <option value={32}>32 · preview</option>
                  <option value={64}>64 · interactive</option>
                  <option value={128}>128 · refined</option>
                  <option value={256}>256 · analysis</option>
                </select>
              </label>
              {([
                ['Morning overcast', morningOvercastPercent, setMorningOvercastPercent],
                ['Noon overcast', noonOvercastPercent, setNoonOvercastPercent],
                ['Evening overcast', eveningOvercastPercent, setEveningOvercastPercent],
              ] as const).map(([label, value, setter]) => (
                <label className="field" key={label}>
                  <span>{label}</span>
                  <span className="solar-number-input">
                    <input
                      type="number" min="0" max="100" step="5" value={value}
                      onChange={(event) => setter(event.target.valueAsNumber)}
                    />
                    <span>%</span>
                  </span>
                </label>
              ))}
            </div>
          )}
          <label className="field">
            <span>Latitude</span>
            <span className="solar-number-input">
              <input
                type="number" min="-90" max="90" step="0.1"
                value={latitudeDegrees}
                onChange={(event) => setLatitudeDegrees(event.target.valueAsNumber)}
              />
              <span>°</span>
            </span>
          </label>
          <label className="field">
            <span>Clear high-sun DNI</span>
            <span className="solar-number-input">
              <input
                type="number" min="0" step="10" value={dni}
                onChange={(event) => setDni(event.target.valueAsNumber)}
              />
              <span>W/m²</span>
            </span>
          </label>
          <label className="field">
            <span>Clear reference DHI</span>
            <span className="solar-number-input">
              <input
                type="number" min="0" step="10" value={clearDhi}
                onChange={(event) => setClearDhi(event.target.valueAsNumber)}
              />
              <span>W/m²</span>
            </span>
          </label>
          <label className="field">
            <span>Overcast high-sun DNI</span>
            <span className="solar-number-input">
              <input
                type="number" min="0" step="10" value={overcastDni}
                onChange={(event) => setOvercastDni(event.target.valueAsNumber)}
              />
              <span>W/m²</span>
            </span>
          </label>
          <label className="field">
            <span>Overcast reference DHI</span>
            <span className="solar-number-input">
              <input
                type="number" min="0" step="10" value={overcastDhi}
                onChange={(event) => setOvercastDhi(event.target.valueAsNumber)}
              />
              <span>W/m²</span>
            </span>
          </label>
          <p className="field-note">
            High-sun DNI is referenced at optical air mass one. Reference DHI
            represents an overhead sun; the model reduces both through the day.
          </p>
          <details className="solar-reference">
            <summary>Climate value quick reference</summary>
            <table>
              <thead>
                <tr>
                  <th>Input</th>
                  <th>Typical</th>
                  <th>Useful range</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Clear DNI</td>
                  <td>850</td>
                  <td>700–950</td>
                </tr>
                <tr>
                  <td>Clear DHI</td>
                  <td>120</td>
                  <td>50–160</td>
                </tr>
                <tr>
                  <td>Overcast DNI</td>
                  <td>0</td>
                  <td>0–100</td>
                </tr>
                <tr>
                  <td>Overcast DHI</td>
                  <td>250</td>
                  <td>100–400</td>
                </tr>
              </tbody>
            </table>
            <p>
              W/m² reference values. Use the defaults for a neutral synthetic
              comparison; local weather data will vary.
            </p>
          </details>
        </section>
        <section className="solar-heatmap-controls" aria-label="Exposure heatmap">
          <label className="snap-toggle">
            <input
              type="checkbox"
              checked={heatmapEnabled}
              onChange={(event) => setHeatmapEnabled(event.target.checked)}
            />
            <span>Surface heatmap</span>
          </label>
          <label className="field">
            <span>Channel</span>
            <select
              value={displayChannel}
              disabled={!heatmapEnabled}
              onChange={(event) => setDisplayChannel(
                event.target.value as ExposureDisplayChannel,
              )}
            >
              <option value="direct">Direct</option>
              <option value="diffuse">Diffuse sky</option>
              <option value="total">Total</option>
            </select>
          </label>
          <label className="field">
            <span>Sample spacing</span>
            <select
              value={heatmapSpacingMeters}
              disabled={!heatmapEnabled}
              onChange={(event) => setHeatmapSpacingMeters(Number(event.target.value))}
            >
              <option value={2}>2 m · coarse</option>
              <option value={1}>1 m · standard</option>
              <option value={0.5}>0.5 m · refined</option>
              <option value={0.25}>0.25 m · detailed</option>
              <option value={0.1}>0.1 m · analysis</option>
            </select>
          </label>
          <div className="heatmap-legend" aria-label="Heatmap quantitative scale">
            <span>0</span>
            <i />
            <span>
              {formatNumber(
                progress.scaleMaximum ?? dni,
                analysisMode === 'instant' ? 0 : 1,
              )} {progress.unit ?? (analysisMode === 'instant' ? 'W/m²' : 'kWh/m²')}
            </span>
          </div>
          <p className="field-note">
            Direct and 145-patch diffuse exposure on terrain and primitives.
            Detailed spacing can take noticeably longer on large parcels.
          </p>
          {heatmapEnabled && (
            <div className={`solar-progress ${progress.status}`} role="status">
              <strong>{progress.message}</strong>
              <span>
                {progress.stageCount > 0
                  ? `Stage ${progress.stage}/${progress.stageCount}`
                  : 'Waiting'}
                {progress.spacingMeters !== undefined
                  ? ` · ${progress.spacingMeters} m`
                  : ''}
                {progress.directionCount !== undefined
                  ? ` · ${progress.directionCount} directions`
                  : ''}
              </span>
              {progress.surfaceSampleCount !== undefined && (
                <span>
                  {progress.surfaceSampleCount.toLocaleString()} surface samples
                  {progress.temporalSampleCount !== undefined
                    ? ` · ${progress.temporalSampleCount.toLocaleString()} time samples`
                    : ''}
                </span>
              )}
              {progress.evaluatedSurfaceSampleCount !== undefined &&
                progress.surfaceSampleCount !== undefined && (
                <span>
                  {progress.evaluatedSurfaceSampleCount.toLocaleString()} of{' '}
                  {progress.surfaceSampleCount.toLocaleString()} samples evaluated
                  this pass
                </span>
              )}
              {progress.totalTileCount !== undefined && (
                <span>
                  {progress.dirtyTileCount ?? progress.totalTileCount}/
                  {progress.totalTileCount} conservative 8 m tiles dirty
                </span>
              )}
            </div>
          )}
        </section>
        <section className="solar-probe-controls" aria-label="Quantitative probe">
          <label className="snap-toggle">
            <input
              type="checkbox"
              checked={probeEnabled}
              onChange={(event) => setProbeEnabled(event.target.checked)}
            />
            <span>Click-to-probe surfaces</span>
          </label>
          <p className="field-note">
            {probeEnabled
              ? 'Click terrain or an object to update the point and normal below.'
              : 'Enable to inspect a rendered surface quantitatively.'}
          </p>
        </section>
        <section className="solar-point-inputs" aria-labelledby="solar-point-title">
          <h2 id="solar-point-title">Surface point (m)</h2>
          <div className="solar-vector-grid">
            {([
              ['E', 'eastMeters'],
              ['Up', 'elevationMeters'],
              ['N', 'northMeters'],
            ] as const).map(([label, key]) => (
              <label key={key}>
                <span>{label}</span>
                <input
                  type="number" step="0.1" value={point[key]}
                  onChange={(event) => updatePoint(key, event.target.valueAsNumber)}
                />
              </label>
            ))}
          </div>
          <h2>Surface normal</h2>
          <div className="solar-vector-grid">
            {([
              ['E', 'normalEast'],
              ['Up', 'normalUp'],
              ['N', 'normalNorth'],
            ] as const).map(([label, key]) => (
              <label key={key}>
                <span>{label}</span>
                <input
                  type="number" step="0.1" value={point[key]}
                  onChange={(event) => updatePoint(key, event.target.valueAsNumber)}
                />
              </label>
            ))}
          </div>
        </section>
        {analysisMode === 'accumulated' && accumulatedPointCalculation.error ? (
          <p className="solar-error" role="alert">
            {accumulatedPointCalculation.error}
          </p>
        ) : analysisMode === 'accumulated' && accumulatedPointCalculation.exposure ? (
          <section className="solar-results" aria-live="polite">
            <div className="solar-primary-result">
              <strong>{formatNumber(accumulatedPointCalculation.exposure.total, 2)}</strong>
              <span>kWh/m² accumulated total</span>
            </div>
            <div className="solar-channel-results">
              <span>
                Direct {formatNumber(accumulatedPointCalculation.exposure.direct, 2)} kWh/m²
              </span>
              <span>
                Diffuse {formatNumber(accumulatedPointCalculation.exposure.diffuse, 2)} kWh/m²
              </span>
              <span>
                Total {formatNumber(accumulatedPointCalculation.exposure.total, 2)} kWh/m²
              </span>
            </div>
            {accumulatedInterpretation && (
              <dl>
                <div>
                  <dt>Daily average</dt>
                  <dd>
                    {formatNumber(
                      accumulatedInterpretation
                        .averageDailyTotalKilowattHoursPerSquareMeter,
                      2,
                    )} kWh/m²/day
                  </dd>
                </div>
                <div>
                  <dt>Equivalent peak-sun energy</dt>
                  <dd>
                    {formatNumber(
                      accumulatedInterpretation.equivalentPeakSunHoursPerDay,
                      2,
                    )} h/day
                  </dd>
                </div>
                <div>
                  <dt>Energy band</dt>
                  <dd>{accumulatedInterpretation.energyBandLabel}</dd>
                </div>
                <div>
                  <dt>Direct / diffuse</dt>
                  <dd>
                    {formatNumber(accumulatedInterpretation.directShare * 100, 0)}% /{' '}
                    {formatNumber(accumulatedInterpretation.diffuseShare * 100, 0)}%
                  </dd>
                </div>
                <div>
                  <dt>Vs. unobstructed</dt>
                  <dd>
                    {accumulatedInterpretation.unobstructedExposureFraction === null
                      ? '—'
                      : `${formatNumber(
                          accumulatedInterpretation.unobstructedExposureFraction * 100,
                          0,
                        )}%`}
                  </dd>
                </div>
                {accumulatedPointCalculation.directSunDuration && (
                  <>
                    <div>
                      <dt>Potential direct sun</dt>
                      <dd>
                        {formatNumber(
                          accumulatedPointCalculation.directSunDuration
                            .potentialDirectSunHours /
                            accumulatedInterpretation.periodDayCount,
                          2,
                        )} h/day
                      </dd>
                    </div>
                    <div>
                      <dt>Transmission-weighted sun</dt>
                      <dd>
                        {formatNumber(
                          accumulatedPointCalculation.directSunDuration
                            .transmissionWeightedDirectSunHours /
                            accumulatedInterpretation.periodDayCount,
                          2,
                        )} h/day
                      </dd>
                    </div>
                  </>
                )}
              </dl>
            )}
            <p className="field-note">
              Synthetic clear/overcast expected value from {periodStartDate} through{' '}
              {periodEndDate}; morning/noon/evening overcast probabilities are{' '}
              {morningOvercastPercent}%/{noonOvercastPercent}%/{eveningOvercastPercent}%.
            </p>
            <p className="field-note">
              The energy band and peak-sun equivalent describe broadband radiant
              energy, not plant-specific PAR/DLI. Potential direct sun counts a
              nonzero solar-disk path; transmission-weighted sun discounts screens
              and canopies by their solar transmittance.
            </p>
          </section>
        ) : analysisMode === 'instant' && (calculation.error || instantPointCalculation.error) ? (
          <p className="solar-error" role="alert">
            {calculation.error ?? instantPointCalculation.error}
          </p>
        ) : analysisMode === 'instant' && result && instantPointCalculation.exposure ? (
          <section className="solar-results" aria-live="polite">
            <div className="solar-primary-result">
              <strong>{formatNumber(instantPointCalculation.exposure.total)}</strong>
              <span>W/m² total irradiance</span>
            </div>
            <div className="solar-channel-results">
              <span>Direct {formatNumber(instantPointCalculation.exposure.direct)} W/m²</span>
              <span>Diffuse {formatNumber(instantPointCalculation.exposure.diffuse)} W/m²</span>
              <span>Total {formatNumber(instantPointCalculation.exposure.total)} W/m²</span>
            </div>
            <dl>
              <div><dt>Altitude</dt><dd>{formatNumber(radiansToDegrees(result.altitudeRadians))}°</dd></div>
              <div><dt>Azimuth</dt><dd>{formatNumber(radiansToDegrees(result.azimuthRadians))}°</dd></div>
              <div><dt>Incidence</dt><dd>{formatNumber(result.incidenceCosine * 100)}%</dd></div>
              <div><dt>Transmission</dt><dd>{formatNumber(result.transmission * 100)}%</dd></div>
            </dl>
            <p className="field-note">
              {result.altitudeRadians <= 0
                ? 'Sun is below the horizon.'
                : result.blockedByEntityId
                  ? `Blocked by ${result.blockedByEntityId}.`
                  : result.crossings.length > 0
                    ? `Crosses ${result.crossings.map(({ entityId }) => entityId).join(', ')}.`
                    : 'Unobstructed by project primitives.'}
            </p>
          </section>
        ) : null}
        <p className="solar-method-note">
          Local apparent solar time; azimuth is clockwise from true north.
          DNI follows Kasten–Young relative air mass; DHI follows solar altitude.
          Constant transmission is applied once per intersected primitive.
        </p>
      </div>
    </aside>
  )
}
