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
  readonly beginTransaction: () => void
  readonly commitTransaction: () => void
  readonly cancelTransaction: () => void
  readonly undo: () => void
  readonly redo: () => void
}

export function createProjectStore(
  initialProject: LandscapeProject,
): ProjectStore {
  let project = initialProject
  const undoStack: LandscapeProject[] = []
  const redoStack: LandscapeProject[] = []
  let transactionStart: LandscapeProject | null = null
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
      if (!transactionStart) {
        undoStack.push(previous)
        redoStack.length = 0
      }
      notify()
    },
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    beginTransaction: () => {
      if (transactionStart) {
        throw new Error('A project transaction is already active')
      }
      transactionStart = project
    },
    commitTransaction: () => {
      if (!transactionStart) {
        return
      }
      if (project !== transactionStart) {
        undoStack.push(transactionStart)
        redoStack.length = 0
      }
      transactionStart = null
    },
    cancelTransaction: () => {
      if (!transactionStart) {
        return
      }
      const changed = project !== transactionStart
      project = transactionStart
      transactionStart = null
      if (changed) {
        notify()
      }
    },
    undo: () => {
      if (transactionStart) {
        throw new Error('Cannot undo during an active project transaction')
      }
      const previous = undoStack.pop()
      if (!previous) {
        return
      }

      redoStack.push(project)
      project = previous
      notify()
    },
    redo: () => {
      if (transactionStart) {
        throw new Error('Cannot redo during an active project transaction')
      }
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
