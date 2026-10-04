import { useMemo, useState } from 'react'
import {
  runWebGpuValidation,
  type WebGpuValidationReport,
} from '../solar/webgpuValidation'
import './WebGpuValidationPage.css'

type RunState = 'idle' | 'running' | 'complete' | 'error'

function formatMilliseconds(value: number): string {
  return `${value.toFixed(1)} ms`
}

function adapterLabel(report: WebGpuValidationReport): string {
  if (!report.adapter) return 'Unavailable'
  const identity = [report.adapter.vendor, report.adapter.architecture]
    .filter(Boolean)
    .join(' / ')
  return `${identity || 'Unknown adapter'}${
    report.adapter.isFallbackAdapter ? ' (software fallback)' : ''
  }`
}

export function WebGpuValidationPage() {
  const [runState, setRunState] = useState<RunState>('idle')
  const [report, setReport] = useState<WebGpuValidationReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState('')
  const json = useMemo(
    () => report ? JSON.stringify(report, null, 2) : '',
    [report],
  )

  const run = async () => {
    setRunState('running')
    setReport(null)
    setError(null)
    setCopyStatus('')
    try {
      setReport(await runWebGpuValidation())
      setRunState('complete')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Validation failed.')
      setRunState('error')
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json)
      setCopyStatus('Copied.')
    } catch {
      setCopyStatus('Clipboard access failed; select the JSON below manually.')
    }
  }

  const download = () => {
    const url = URL.createObjectURL(new Blob([json], {
      type: 'application/json',
    }))
    const link = document.createElement('a')
    link.href = url
    link.download = `landscape-planner-webgpu-${report?.status ?? 'report'}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main className="webgpu-validation">
      <header>
        <p className="eyebrow">Landscape Planner · Milestone 12F</p>
        <h1>WebGPU validation</h1>
        <p>
          Compare the real WGSL visibility path with the retained CPU solver.
          SwiftShader is valid for correctness testing, but not hardware
          performance conclusions.
        </p>
        <div className="validation-actions">
          <button type="button" onClick={run} disabled={runState === 'running'}>
            {runState === 'running' ? 'Running…' : 'Run validation'}
          </button>
          <a href="./">Return to planner</a>
        </div>
      </header>

      {runState === 'idle' && (
        <section className="validation-card">
          <h2>Ready</h2>
          <p>
            The suite runs three deterministic visibility workloads and one
            accumulated direct-and-diffuse exposure comparison.
          </p>
        </section>
      )}
      {runState === 'running' && (
        <section className="validation-card" aria-live="polite">
          <h2>Running CPU and WebGPU comparisons…</h2>
          <p>Keep this tab in the foreground until the report appears.</p>
        </section>
      )}
      {error && (
        <section className="validation-card validation-error" role="alert">
          <h2>Validation could not finish</h2>
          <p>{error}</p>
        </section>
      )}
      {report && (
        <>
          <section className={`validation-card validation-${report.status}`}>
            <div className="validation-result-heading">
              <h2>{report.status.toUpperCase()}</h2>
              <span>{report.summary.passed} passed · {report.summary.failed} failed</span>
            </div>
            <dl className="validation-metadata">
              <div><dt>Adapter</dt><dd>{adapterLabel(report)}</dd></div>
              <div><dt>Capability</dt><dd>{report.capabilityReason}</dd></div>
              <div><dt>Solver</dt><dd>{report.solverVersion}</dd></div>
              <div><dt>Browser</dt><dd>{report.environment.userAgent}</dd></div>
            </dl>
          </section>

          {report.cases.length > 0 && (
            <section className="validation-card validation-table-wrap">
              <h2>Cases</h2>
              <table>
                <thead>
                  <tr>
                    <th>Case</th>
                    <th>Status</th>
                    <th>Rays</th>
                    <th>CPU</th>
                    <th>WebGPU</th>
                    <th>Disagreement</th>
                  </tr>
                </thead>
                <tbody>
                  {report.cases.map((result) => (
                    <tr key={result.name}>
                      <td>{result.name}</td>
                      <td className={`case-${result.status}`}>
                        {result.status.toUpperCase()}
                      </td>
                      <td>{result.rayCount.toLocaleString()}</td>
                      <td>{formatMilliseconds(result.cpuMilliseconds)}</td>
                      <td>{formatMilliseconds(result.gpuMilliseconds)}</td>
                      <td>
                        {result.kind === 'visibility'
                          ? `${result.transmissionMismatchCount} transmission, ${result.blockerMismatchCount} blocker`
                          : `${result.valueMismatchCount} surface values`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section className="validation-card">
            <div className="validation-result-heading">
              <h2>JSON report</h2>
              <div className="validation-actions">
                <button type="button" onClick={copy}>Copy JSON</button>
                <button type="button" className="secondary" onClick={download}>
                  Download
                </button>
              </div>
            </div>
            {copyStatus && <p aria-live="polite">{copyStatus}</p>}
            <textarea readOnly value={json} aria-label="WebGPU validation JSON" />
          </section>
        </>
      )}
    </main>
  )
}
