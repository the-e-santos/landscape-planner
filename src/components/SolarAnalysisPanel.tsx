import { useEffect, useMemo, useState } from 'react'
import type { LandscapeProject } from '../domain/project'
import { queryDirectPointSolar } from '../solar/pointSolar'
import {
  degreesToRadians,
  calculateSolarPosition,
  radiansToDegrees,
  type SolarDate,
} from '../solar/solarPosition'
import type { InstantSolarHeatmapSettings } from '../solar/terrainExposure'
import { useDraggablePanel } from './useDraggablePanel'

interface SolarAnalysisPanelProps {
  readonly project: LandscapeProject
  readonly onHeatmapChange: (settings: InstantSolarHeatmapSettings) => void
}

interface PointInputs {
  readonly eastMeters: number
  readonly elevationMeters: number
  readonly northMeters: number
  readonly normalEast: number
  readonly normalUp: number
  readonly normalNorth: number
}

function parseDate(value: string): SolarDate {
  const [year, month, day] = value.split('-').map(Number)
  return { year, month, day }
}

function formatNumber(value: number, digits = 1): string {
  return Number.isFinite(value) ? value.toFixed(digits) : '—'
}

export function SolarAnalysisPanel({
  project,
  onHeatmapChange,
}: SolarAnalysisPanelProps) {
  const [collapsed, setCollapsed] = useState(false)
  const { panelRef, dragHandleProps } = useDraggablePanel<HTMLElement>()
  const [date, setDate] = useState('2026-06-21')
  const [solarTimeHours, setSolarTimeHours] = useState(12)
  const [latitudeDegrees, setLatitudeDegrees] = useState(40)
  const [dni, setDni] = useState(800)
  const [heatmapEnabled, setHeatmapEnabled] = useState(false)
  const [heatmapSpacingMeters, setHeatmapSpacingMeters] = useState(1)
  const [point, setPoint] = useState<PointInputs>({
    eastMeters: 0,
    elevationMeters: 0.05,
    northMeters: 0,
    normalEast: 0,
    normalUp: 1,
    normalNorth: 0,
  })
  const calculation = useMemo(() => {
    try {
      return {
        result: queryDirectPointSolar(project, {
          solarPosition: {
            date: parseDate(date),
            latitudeRadians: degreesToRadians(latitudeDegrees),
            localSolarTimeHours: solarTimeHours,
          },
          directNormalIrradianceWattsPerSquareMeter: dni,
          surface: {
            eastMeters: point.eastMeters,
            elevationMeters: point.elevationMeters,
            northMeters: point.northMeters,
            normal: {
              east: point.normalEast,
              up: point.normalUp,
              north: point.normalNorth,
            },
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
  }, [date, dni, latitudeDegrees, point, project, solarTimeHours])
  const updatePoint = (key: keyof PointInputs, value: number) => {
    setPoint((current) => ({ ...current, [key]: value }))
  }
  const result = calculation.result
  const heatmapSettings = useMemo<InstantSolarHeatmapSettings>(() => {
    if (!heatmapEnabled) return { enabled: false }
    const solarPosition = {
      date: parseDate(date),
      latitudeRadians: degreesToRadians(latitudeDegrees),
      localSolarTimeHours: solarTimeHours,
    }
    try {
      calculateSolarPosition(solarPosition)
      if (!Number.isFinite(dni) || dni < 0) throw new Error('Invalid DNI')
      if (!Number.isFinite(heatmapSpacingMeters) || heatmapSpacingMeters <= 0) {
        throw new Error('Invalid spacing')
      }
      return {
        enabled: true,
        solarPosition,
        directNormalIrradianceWattsPerSquareMeter: dni,
        spacingMeters: heatmapSpacingMeters,
      }
    } catch {
      return { enabled: false }
    }
  }, [date, dni, heatmapEnabled, heatmapSpacingMeters, latitudeDegrees, solarTimeHours])

  useEffect(() => {
    onHeatmapChange(heatmapSettings)
  }, [heatmapSettings, onHeatmapChange])

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
          <p className="eyebrow">Milestone 7 reference</p>
          <h1>Point solar</h1>
        </div>
        <button
          className="panel-collapse-button"
          type="button"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? 'Open' : 'Collapse'}
        </button>
      </header>
      <div className="solar-panel-content">
        <p className="panel-intro">
          Instant direct incidence and CPU visibility at one surface point.
        </p>
        <section className="solar-inputs" aria-label="Solar instant">
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
            <span>DNI</span>
            <span className="solar-number-input">
              <input
                type="number" min="0" step="10" value={dni}
                onChange={(event) => setDni(event.target.valueAsNumber)}
              />
              <span>W/m²</span>
            </span>
          </label>
        </section>
        <section className="solar-heatmap-controls" aria-label="Exposure heatmap">
          <label className="snap-toggle">
            <input
              type="checkbox"
              checked={heatmapEnabled}
              onChange={(event) => setHeatmapEnabled(event.target.checked)}
            />
            <span>Terrain heatmap</span>
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
            </select>
          </label>
          <div className="heatmap-legend" aria-label={`Heatmap scale from zero to ${dni} watts per square meter`}>
            <span>0</span>
            <i />
            <span>{formatNumber(dni, 0)} W/m²</span>
          </div>
          <p className="field-note">
            Instant direct irradiance on terrain. Dark areas receive less;
            yellow areas receive more.
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
        {calculation.error ? (
          <p className="solar-error" role="alert">{calculation.error}</p>
        ) : result ? (
          <section className="solar-results" aria-live="polite">
            <div className="solar-primary-result">
              <strong>{formatNumber(result.directIrradianceWattsPerSquareMeter)}</strong>
              <span>W/m² direct</span>
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
          Constant transmission is applied once per intersected primitive.
        </p>
      </div>
    </aside>
  )
}
