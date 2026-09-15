import {
  PROJECT_SCHEMA_VERSION,
  type LandscapeProject,
} from './project'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function serializeProject(project: LandscapeProject): string {
  return JSON.stringify(project, null, 2)
}

export function deserializeProject(json: string): LandscapeProject {
  const parsed: unknown = JSON.parse(json)

  if (!isRecord(parsed) || parsed.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported project schema version; expected ${PROJECT_SCHEMA_VERSION}`,
    )
  }

  // Full user-facing schema validation and migrations belong to Milestone 6.
  return parsed as unknown as LandscapeProject
}
