export type WorkspacePanelId =
  | 'project'
  | 'parcel'
  | 'terrain'
  | 'objects'
  | 'landscape'
  | 'solar'

export type WorkspacePanelVisibility = Readonly<Record<WorkspacePanelId, boolean>>

interface PanelPaletteProps {
  readonly visibility: WorkspacePanelVisibility
  readonly onToggle: (panelId: WorkspacePanelId) => void
}

const panels: ReadonlyArray<{
  readonly id: WorkspacePanelId
  readonly label: string
}> = [
  { id: 'project', label: 'Files' },
  { id: 'parcel', label: 'Parcel' },
  { id: 'terrain', label: 'Terrain' },
  { id: 'objects', label: 'Objects' },
  { id: 'landscape', label: 'Landscape' },
  { id: 'solar', label: 'Solar' },
]

export function PanelPalette({ visibility, onToggle }: PanelPaletteProps) {
  return (
    <nav className="panel-palette" aria-label="Workspace panels">
      <strong>Panels</strong>
      {panels.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          aria-pressed={visibility[id]}
          onClick={() => onToggle(id)}
        >
          {label}
        </button>
      ))}
    </nav>
  )
}
