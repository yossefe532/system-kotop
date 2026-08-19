const DB_NAME = 'educon_pos_offline_v2'
const DB_VERSION = 2

const STORE_SYNC_QUEUE = 'sync_queue'
const STORE_ENTITY_CACHE = 'entity_cache'
const STORE_ID_MAPPINGS = 'id_mappings'
const STORE_PENDING_TX = 'pending_transactions'
const STORE_SYNC_META = 'sync_metadata'
const STORE_OFFLINE_SNAPSHOTS = 'offline_snapshots'
const STORE_REPLAY_FAILURES = 'replay_failures'

const META_KEY_MIGRATION = 'legacy_localstorage_migrated_v2'
const STALE_REPLAY_LEASE_MS = 30000

const PRIORITY_ORDER = {
  high: 0,
  medium: 1,
  low: 2,
}

const normalizeQueueItem = (item) => {
  const now = Date.now()
  const leaseExpiresAt = item?.leaseExpiresAt ? new Date(item.leaseExpiresAt).getTime() : null
  const status =
    item?.status === 'in_progress' && leaseExpiresAt && leaseExpiresAt < now ? 'pending' : item?.status || 'pending'
  const nextRetryAt = item?.nextRetryAt || null
  return {
    ...item,
    status,
    retryCount: Number(item?.retryCount) || 0,
    priority: item?.priority || 'medium',
    maxRetries: Number(item?.maxRetries) || 6,
    dependencies: Array.isArray(item?.dependencies) ? item.dependencies : [],
    history: Array.isArray(item?.history) ? item.history : [],
    lastAttemptAt: item?.lastAttemptAt || null,
    nextRetryAt,
    leaseExpiresAt: status === 'in_progress' ? item?.leaseExpiresAt || new Date(now + STALE_REPLAY_LEASE_MS).toISOString() : null,
  }
}

const sortQueueItems = (items) =>
  items.slice().sort((a, b) => {
    const nextRetryA = a?.nextRetryAt ? new Date(a.nextRetryAt).getTime() : 0
    const nextRetryB = b?.nextRetryAt ? new Date(b.nextRetryAt).getTime() : 0
    if (nextRetryA !== nextRetryB) return nextRetryA - nextRetryB
    const priorityA = PRIORITY_ORDER[a?.priority] ?? PRIORITY_ORDER.medium
    const priorityB = PRIORITY_ORDER[b?.priority] ?? PRIORITY_ORDER.medium
    if (priorityA !== priorityB) return priorityA - priorityB
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  })

const LEGACY_STORAGE = {
  snapshot: 'educon-pos-state-v1',
  queue: 'educon-pos-sync-queue-v1',
  map: 'educon-pos-sync-map-v1',
  receiptArchive: 'educon-pos-receipt-archive-v1',
}

let dbPromise = null

const openIndexedDb = () =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error || new Error('IndexedDB open failed'))
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_SYNC_QUEUE)) {
        const queue = db.createObjectStore(STORE_SYNC_QUEUE, { keyPath: 'id' })
        queue.createIndex('by_created_at', 'createdAt', { unique: false })
        queue.createIndex('by_status', 'status', { unique: false })
        queue.createIndex('by_next_retry_at', 'nextRetryAt', { unique: false })
        queue.createIndex('by_priority', 'priority', { unique: false })
      } else {
        const queue = request.transaction.objectStore(STORE_SYNC_QUEUE)
        if (!queue.indexNames.contains('by_created_at')) queue.createIndex('by_created_at', 'createdAt', { unique: false })
        if (!queue.indexNames.contains('by_status')) queue.createIndex('by_status', 'status', { unique: false })
        if (!queue.indexNames.contains('by_next_retry_at')) queue.createIndex('by_next_retry_at', 'nextRetryAt', { unique: false })
        if (!queue.indexNames.contains('by_priority')) queue.createIndex('by_priority', 'priority', { unique: false })
      }
      if (!db.objectStoreNames.contains(STORE_ENTITY_CACHE)) {
        db.createObjectStore(STORE_ENTITY_CACHE, { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains(STORE_ID_MAPPINGS)) {
        db.createObjectStore(STORE_ID_MAPPINGS, { keyPath: 'scope' })
      }
      if (!db.objectStoreNames.contains(STORE_PENDING_TX)) {
        db.createObjectStore(STORE_PENDING_TX, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORE_SYNC_META)) {
        db.createObjectStore(STORE_SYNC_META, { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains(STORE_OFFLINE_SNAPSHOTS)) {
        db.createObjectStore(STORE_OFFLINE_SNAPSHOTS, { keyPath: 'scope' })
      }
      if (!db.objectStoreNames.contains(STORE_REPLAY_FAILURES)) {
        const failures = db.createObjectStore(STORE_REPLAY_FAILURES, { keyPath: 'id' })
        failures.createIndex('by_operation_id', 'operationId', { unique: false })
        failures.createIndex('by_created_at', 'createdAt', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
  })

const getDb = async () => {
  if (typeof indexedDB === 'undefined') throw new Error('IndexedDB is not available')
  if (!dbPromise) dbPromise = openIndexedDb()
  return dbPromise
}

const withStore = async (storeName, mode, executor) => {
  const db = await getDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode)
    const store = tx.objectStore(storeName)
    let result
    tx.oncomplete = () => resolve(result)
    tx.onerror = () => reject(tx.error || new Error(`IndexedDB transaction failed for ${storeName}`))
    tx.onabort = () => reject(tx.error || new Error(`IndexedDB transaction aborted for ${storeName}`))
    result = executor(store, tx)
  })
}

const requestToPromise = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'))
  })

export const ensureOfflineDbReady = async () => {
  await getDb()
}

export const getSyncMetadata = async (key, fallbackValue = null) => {
  return withStore(STORE_SYNC_META, 'readonly', async (store) => {
    const row = await requestToPromise(store.get(key))
    if (!row) return fallbackValue
    return row.value ?? fallbackValue
  })
}

export const setSyncMetadata = async (key, value) => {
  return withStore(STORE_SYNC_META, 'readwrite', async (store) => {
    await requestToPromise(store.put({ key, value, updatedAt: new Date().toISOString() }))
  })
}

export const getOfflineSnapshot = async (scope, fallbackValue = null) => {
  return withStore(STORE_OFFLINE_SNAPSHOTS, 'readonly', async (store) => {
    const row = await requestToPromise(store.get(scope))
    return row?.payload ?? fallbackValue
  })
}

export const setOfflineSnapshot = async (scope, payload) => {
  return withStore(STORE_OFFLINE_SNAPSHOTS, 'readwrite', async (store) => {
    await requestToPromise(store.put({ scope, payload, updatedAt: new Date().toISOString() }))
  })
}

export const getSyncQueue = async () => {
  return withStore(STORE_SYNC_QUEUE, 'readonly', async (store) => {
    const items = await requestToPromise(store.getAll())
    const sorted = Array.isArray(items) ? sortQueueItems(items.map((item) => normalizeQueueItem(item))) : []
    return sorted.map((item) => {
      const { __queuedAt, ...payload } = item
      return payload
    })
  })
}

export const replaceSyncQueue = async (queue) => {
  return withStore(STORE_SYNC_QUEUE, 'readwrite', async (store) => {
    await requestToPromise(store.clear())
    for (const rawOperation of sortQueueItems((queue || []).map((item) => normalizeQueueItem(item)))) {
      const op = normalizeQueueItem(rawOperation)
      await requestToPromise(
        store.put({
          ...op,
          __queuedAt: Date.now(),
        }),
      )
    }
  })
}

export const putSyncQueueItem = async (operation) => {
  return withStore(STORE_SYNC_QUEUE, 'readwrite', async (store) => {
    const normalized = normalizeQueueItem(operation)
    await requestToPromise(
      store.put({
        ...normalized,
        __queuedAt: Date.now(),
      }),
    )
  })
}

export const removeSyncQueueItem = async (operationId) => {
  return withStore(STORE_SYNC_QUEUE, 'readwrite', async (store) => {
    await requestToPromise(store.delete(operationId))
  })
}

export const getIdMappings = async (fallbackValue = { students: {}, books: {}, reservations: {} }) => {
  return withStore(STORE_ID_MAPPINGS, 'readonly', async (store) => {
    const row = await requestToPromise(store.get('default'))
    if (!row?.payload || typeof row.payload !== 'object') return fallbackValue
    return {
      students: row.payload.students || {},
      books: row.payload.books || {},
      reservations: row.payload.reservations || {},
    }
  })
}

export const setIdMappings = async (payload) => {
  return withStore(STORE_ID_MAPPINGS, 'readwrite', async (store) => {
    await requestToPromise(
      store.put({
        scope: 'default',
        payload: {
          students: payload?.students || {},
          books: payload?.books || {},
          reservations: payload?.reservations || {},
        },
        updatedAt: new Date().toISOString(),
      }),
    )
  })
}

export const addReplayFailure = async (entry) => {
  return withStore(STORE_REPLAY_FAILURES, 'readwrite', async (store) => {
    await requestToPromise(
      store.put({
        id: entry.id,
        operationId: entry.operationId || null,
        error: entry.error || 'unknown',
        payload: entry.payload || null,
        createdAt: entry.createdAt || new Date().toISOString(),
      }),
    )
  })
}

export const getReplayFailures = async () => {
  return withStore(STORE_REPLAY_FAILURES, 'readonly', async (store) => {
    const rows = await requestToPromise(store.getAll())
    return Array.isArray(rows) ? rows : []
  })
}

const readLegacyJson = (key, fallbackValue) => {
  try {
    if (typeof localStorage === 'undefined') return fallbackValue
    const raw = localStorage.getItem(key)
    if (!raw) return fallbackValue
    const parsed = JSON.parse(raw)
    return parsed ?? fallbackValue
  } catch {
    return fallbackValue
  }
}

const clearLegacyKey = (key) => {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.removeItem(key)
  } catch {
    // no-op
  }
}

export const migrateLegacyLocalStorageToIndexedDb = async () => {
  const alreadyMigrated = await getSyncMetadata(META_KEY_MIGRATION, false)
  if (alreadyMigrated) return

  const legacySnapshot = readLegacyJson(LEGACY_STORAGE.snapshot, null)
  const legacyQueue = readLegacyJson(LEGACY_STORAGE.queue, [])
  const legacyMap = readLegacyJson(LEGACY_STORAGE.map, { students: {}, books: {}, reservations: {} })
  const legacyReceiptArchive = readLegacyJson(LEGACY_STORAGE.receiptArchive, [])

  if (legacySnapshot) await setOfflineSnapshot('app_state', legacySnapshot)
  if (Array.isArray(legacyQueue) && legacyQueue.length > 0) await replaceSyncQueue(legacyQueue)
  if (legacyMap && typeof legacyMap === 'object') await setIdMappings(legacyMap)
  if (Array.isArray(legacyReceiptArchive) && legacyReceiptArchive.length > 0) {
    await setOfflineSnapshot('receipt_archive', legacyReceiptArchive)
  }

  await setSyncMetadata(META_KEY_MIGRATION, true)

  clearLegacyKey(LEGACY_STORAGE.snapshot)
  clearLegacyKey(LEGACY_STORAGE.queue)
  clearLegacyKey(LEGACY_STORAGE.map)
  clearLegacyKey(LEGACY_STORAGE.receiptArchive)
}

export const loadOfflineBootstrap = async () => {
  await ensureOfflineDbReady()
  await migrateLegacyLocalStorageToIndexedDb()
  const [snapshot, queue, mappings, receiptArchive] = await Promise.all([
    getOfflineSnapshot('app_state', null),
    getSyncQueue(),
    getIdMappings(),
    getOfflineSnapshot('receipt_archive', []),
  ])
  return {
    snapshot,
    queue: Array.isArray(queue) ? queue : [],
    mappings: mappings || { students: {}, books: {}, reservations: {} },
    receiptArchive: Array.isArray(receiptArchive) ? receiptArchive : [],
  }
}

export const clearOfflineStorage = async () => {
  const db = await getDb()
  await new Promise((resolve, reject) => {
    const tx = db.transaction(
      [
        STORE_SYNC_QUEUE,
        STORE_ENTITY_CACHE,
        STORE_ID_MAPPINGS,
        STORE_PENDING_TX,
        STORE_SYNC_META,
        STORE_OFFLINE_SNAPSHOTS,
        STORE_REPLAY_FAILURES,
      ],
      'readwrite',
    )
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error || new Error('IndexedDB clear failed'))
    tx.onabort = () => reject(tx.error || new Error('IndexedDB clear aborted'))
    for (const storeName of [
      STORE_SYNC_QUEUE,
      STORE_ENTITY_CACHE,
      STORE_ID_MAPPINGS,
      STORE_PENDING_TX,
      STORE_SYNC_META,
      STORE_OFFLINE_SNAPSHOTS,
      STORE_REPLAY_FAILURES,
    ]) {
      tx.objectStore(storeName).clear()
    }
  })

  clearLegacyKey(LEGACY_STORAGE.snapshot)
  clearLegacyKey(LEGACY_STORAGE.queue)
  clearLegacyKey(LEGACY_STORAGE.map)
  clearLegacyKey(LEGACY_STORAGE.receiptArchive)
}
