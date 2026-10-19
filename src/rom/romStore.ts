const DB_NAME = 'tecmo-broadcast'
const STORE = 'rom'
const KEY = 'current'
const NAME_KEY = 'name'

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

export const romStore = {
  async load(): Promise<Uint8Array | null> {
    try {
      const value = await run<unknown>('readonly', (store) => store.get(KEY))
      return ArrayBuffer.isView(value) ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength) : null
    } catch {
      return null
    }
  },
  async loadName(): Promise<string | null> {
    try {
      const value = await run<unknown>('readonly', (store) => store.get(NAME_KEY))
      return typeof value === 'string' && value ? value : null
    } catch {
      return null
    }
  },
  async save(bytes: Uint8Array, name?: string): Promise<boolean> {
    try {
      await run('readwrite', (store) => store.put(bytes, KEY))
      if (name) await run('readwrite', (store) => store.put(name, NAME_KEY))
      else await run('readwrite', (store) => store.delete(NAME_KEY))
      return true
    } catch {
      return false
    }
  },
  async clear(): Promise<void> {
    try {
      await run('readwrite', (store) => store.delete(KEY))
      await run('readwrite', (store) => store.delete(NAME_KEY))
    } catch {
      return
    }
  },
}
