const DB_NAME = 'tecmo-broadcast'
const STORE = 'rom'
const LEGACY = 'current'
const ACTIVE = 'active'
const romKey = (sha1: string) => `rom:${sha1}`

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

const asBytes = (value: unknown) => (ArrayBuffer.isView(value) ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength) : null)

export const romStore = {
  async load(): Promise<Uint8Array | null> {
    try {
      const active = await run<unknown>('readonly', (store) => store.get(ACTIVE))
      const value = typeof active === 'string' ? await run<unknown>('readonly', (store) => store.get(romKey(active))) : undefined
      return asBytes(value) ?? asBytes(await run<unknown>('readonly', (store) => store.get(LEGACY)))
    } catch {
      return null
    }
  },
  async loadAll(): Promise<Uint8Array[]> {
    try {
      const keys = await run<IDBValidKey[]>('readonly', (store) => store.getAllKeys())
      const wanted = keys.filter((key) => key === LEGACY || (typeof key === 'string' && key.startsWith('rom:')))
      const values = await Promise.all(wanted.map((key) => run<unknown>('readonly', (store) => store.get(key))))
      return values.map(asBytes).filter((bytes): bytes is Uint8Array => bytes !== null)
    } catch {
      return []
    }
  },
  async save(bytes: Uint8Array, sha1: string): Promise<boolean> {
    try {
      await run('readwrite', (store) => store.put(bytes, romKey(sha1)))
      await run('readwrite', (store) => store.put(sha1, ACTIVE))
      await run('readwrite', (store) => store.delete(LEGACY))
      return true
    } catch {
      return false
    }
  },
  async select(sha1: string): Promise<void> {
    try {
      await run('readwrite', (store) => store.put(sha1, ACTIVE))
    } catch {
      return
    }
  },
  async remove(sha1: string): Promise<void> {
    try {
      await run('readwrite', (store) => store.delete(romKey(sha1)))
      const active = await run<unknown>('readonly', (store) => store.get(ACTIVE))
      if (active === sha1) await run('readwrite', (store) => store.delete(ACTIVE))
      if (active === undefined) await run('readwrite', (store) => store.delete(LEGACY))
    } catch {
      return
    }
  },
  async clear(): Promise<void> {
    try {
      await run('readwrite', (store) => store.clear())
    } catch {
      return
    }
  },
}
