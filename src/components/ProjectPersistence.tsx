import { useRef, type ChangeEvent } from 'react'
import type { LandscapeProject } from '../domain/project'
import { serializeProject } from '../domain/projectSerialization'

interface ProjectPersistenceProps {
  readonly project: LandscapeProject
  readonly recoverySavedAt: string | null
  readonly status: string
  readonly error: string | null
  readonly onLoad: (file: File) => void
  readonly onRestore: () => void
  readonly onDismissRecovery: () => void
}

function safeFileName(projectName: string): string {
  const stem = projectName.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'landscape-project'
  return `${stem}.json`
}

function downloadProject(project: LandscapeProject): void {
  const blob = new Blob([serializeProject(project)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = safeFileName(project.name)
  anchor.click()
  URL.revokeObjectURL(url)
}

export function ProjectPersistence({
  project,
  recoverySavedAt,
  status,
  error,
  onLoad,
  onRestore,
  onDismissRecovery,
}: ProjectPersistenceProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) onLoad(file)
    event.target.value = ''
  }

  return (
    <section className="persistence-panel" aria-label="Project save and load">
      <div className="persistence-actions">
        <button type="button" onClick={() => downloadProject(project)}>Download JSON</button>
        <button type="button" onClick={() => inputRef.current?.click()}>Load JSON</button>
        <input
          ref={inputRef}
          className="visually-hidden"
          type="file"
          accept=".json,application/json"
          onChange={handleFile}
        />
      </div>
      {recoverySavedAt && (
        <div className="recovery-prompt" role="status">
          <span>Recovery found from {new Date(recoverySavedAt).toLocaleString()}.</span>
          <button type="button" onClick={onRestore}>Restore</button>
          <button type="button" onClick={onDismissRecovery}>Dismiss</button>
        </div>
      )}
      <p className={error ? 'persistence-message error' : 'persistence-message'}>
        {error ?? status}
      </p>
    </section>
  )
}
