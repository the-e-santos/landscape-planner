import {
  applyProjectCommand,
  type ProjectCommand,
} from './projectCommands'
import type { LandscapeProject } from './project'

export interface ProjectStore {
  readonly getSnapshot: () => LandscapeProject
  readonly subscribe: (listener: () => void) => () => void
  readonly dispatch: (command: ProjectCommand) => void
}

export function createProjectStore(
  initialProject: LandscapeProject,
): ProjectStore {
  let project = initialProject
  const listeners = new Set<() => void>()

  return {
    getSnapshot: () => project,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    dispatch: (command) => {
      project = applyProjectCommand(project, command)
      listeners.forEach((listener) => listener())
    },
  }
}
