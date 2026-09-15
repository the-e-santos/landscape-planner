import type { LandscapeProject } from '../domain/project'
import { serializeProject } from '../domain/projectSerialization'

const DATABASE_NAME = 'landscape-planner'
const DATABASE_VERSION = 1
const STORE_NAME = 'project-autosaves'
const AUTOSAVE_KEY = 'latest'

export interface ProjectAutosave {
  readonly json: string
  readonly savedAt: string
}

function openDatabase(): Promise<IDBDatabase> {
  if (!globalThis.indexedDB) {
    return Promise.reject(new Error('IndexedDB is unavailable in this browser'))
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open autosave storage'))
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode)
    const request = operation(transaction.objectStore(STORE_NAME))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Autosave operation failed'))
    transaction.oncomplete = () => database.close()
    transaction.onerror = () => {
      database.close()
      reject(transaction.error ?? new Error('Autosave transaction failed'))
    }
  })
}

export async function saveProjectAutosave(project: LandscapeProject): Promise<void> {
  const autosave: ProjectAutosave = {
    json: serializeProject(project),
    savedAt: new Date().toISOString(),
  }
  await withStore('readwrite', (store) => store.put(autosave, AUTOSAVE_KEY))
}

export async function loadProjectAutosave(): Promise<ProjectAutosave | null> {
  const result = await withStore<unknown>('readonly', (store) => store.get(AUTOSAVE_KEY))
  if (result === undefined) {
    return null
  }
  if (
    typeof result !== 'object' || result === null ||
    typeof (result as ProjectAutosave).json !== 'string' ||
    typeof (result as ProjectAutosave).savedAt !== 'string'
  ) {
    throw new Error('The local recovery record is malformed')
  }
  return result as ProjectAutosave
}

export async function clearProjectAutosave(): Promise<void> {
  await withStore('readwrite', (store) => store.delete(AUTOSAVE_KEY))
}
