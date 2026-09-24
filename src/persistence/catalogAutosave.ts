import type { PlantInteractionCatalogDocument } from '../domain/plantInteractions'
import { serializeInteractionCatalog } from '../domain/interactionCatalog'

const DATABASE_NAME = 'landscape-planner-catalogs'
const DATABASE_VERSION = 1
const STORE_NAME = 'catalogs'

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
    request.onerror = () => reject(request.error ?? new Error('Could not open catalog storage'))
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
    request.onerror = () => reject(request.error ?? new Error('Catalog storage failed'))
    transaction.oncomplete = () => database.close()
    transaction.onerror = () => {
      database.close()
      reject(transaction.error ?? new Error('Catalog transaction failed'))
    }
  })
}

export async function saveCatalogAutosave(
  catalog: PlantInteractionCatalogDocument,
): Promise<void> {
  await withStore('readwrite', (store) => store.put({
    json: serializeInteractionCatalog(catalog),
    savedAt: new Date().toISOString(),
  }, catalog.id))
}

export async function loadCatalogAutosave(
  catalogId: string,
): Promise<{ readonly json: string; readonly savedAt: string } | null> {
  const result = await withStore<unknown>('readonly', (store) => store.get(catalogId))
  if (result === undefined) return null
  if (
    typeof result !== 'object' || result === null ||
    typeof (result as { json?: unknown }).json !== 'string' ||
    typeof (result as { savedAt?: unknown }).savedAt !== 'string'
  ) throw new Error('The local catalog record is malformed')
  return result as { readonly json: string; readonly savedAt: string }
}
