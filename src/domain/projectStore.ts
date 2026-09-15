import {
  applyProjectCommand,
  type ProjectCommand,
} from './projectCommands'
import type { LandscapeProject } from './project'

export interface ProjectStore {
  readonly getSnapshot: () => LandscapeProject
  readonly subscribe: (listener: () => void) => () => void
  readonly dispatch: (command: ProjectCommand) => void
  readonly canUndo: () => boolean
  readonly canRedo: () => boolean
  readonly undo: () => void
  readonly redo: () => void
}

export function createProjectStore(
  initialProject: LandscapeProject,
): ProjectStore {
  let project = initialProject
  const undoStack: LandscapeProject[] = []
  const redoStack: LandscapeProject[] = []
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((listener) => listener())

  return {
    getSnapshot: () => project,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    dispatch: (command) => {
      const previous = project
      project = applyProjectCommand(project, command)
      undoStack.push(previous)
      redoStack.length = 0
      notify()
    },
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    undo: () => {
      const previous = undoStack.pop()
      if (!previous) {
        return
      }

      redoStack.push(project)
      project = previous
      notify()
    },
    redo: () => {
      const next = redoStack.pop()
      if (!next) {
        return
      }

      undoStack.push(project)
      project = next
      notify()
    },
  }
}
