const DB_NAME = 'tecmo-broadcast-helmets'
const STORE = 'helmets'
const VERSION = 'v1'

export type HelmetSet = Record<number, Blob>

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('blocked'))
  })
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode)
      const request = action(transaction.objectStore(STORE))
      transaction.oncomplete = () => resolve(request.result)
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally {
    db.close()
  }
}

const key = (romSha1: string) => `${VERSION}:${romSha1}`

export const helmetStore = {
  async load(romSha1: string): Promise<HelmetSet | null> {
    try {
      const value = await run<unknown>('readonly', (store) => store.get(key(romSha1)))
      return value && typeof value === 'object' ? (value as HelmetSet) : null
    } catch {
      return null
    }
  },
  async save(romSha1: string, helmets: HelmetSet): Promise<void> {
    try {
      await run('readwrite', (store) => store.put(helmets, key(romSha1)))
    } catch {
      return
    }
  },
}
