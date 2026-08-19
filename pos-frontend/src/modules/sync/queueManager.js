import { replaceSyncQueue } from './indexedDb'
import { trackSyncEvent } from '../../services/observabilityClient'

const PRIORITY_BY_TYPE = {
  transaction_create: 'high',
  reservation_create: 'high',
  reservation_cancel: 'high',
  emergency_withdrawal: 'high',
  student_balance_set: 'medium',
  wallet_entry_create: 'medium',
  book_upsert: 'low',
  student_upsert: 'low',
  receipt_archive: 'low',
}

const MAX_HISTORY_LENGTH = 10

const stableSerialize = (value) => {
  if (Array.isArray(value)) return `[${value.map((item) => stableSerialize(item)).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

const hashString = (input) => {
  let hash = 5381
  for (const char of String(input || '')) {
    hash = (hash * 33) ^ char.charCodeAt(0)
  }
  return `fp-${(hash >>> 0).toString(16)}`
}

const createOperationId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

const defaultPriorityFor = (type) => PRIORITY_BY_TYPE[type] || 'medium'

const limitHistory = (history) => history.slice(-MAX_HISTORY_LENGTH)

const createHistoryEntry = (event, context = {}) => ({
  event,
  at: new Date().toISOString(),
  ...context,
})

const computeOperationFingerprint = (operation) =>
  hashString(
    stableSerialize({
      type: operation?.type || null,
      mode: operation?.mode || null,
      localId: operation?.localId || null,
      payload: operation?.payload || null,
    }),
  )

const computeDedupeKey = (operation) => {
  if (operation?.dedupeKey) return operation.dedupeKey
  if (operation?.type === 'book_upsert') return `book_upsert:${operation.mode || 'unknown'}:${operation.localId ?? 'none'}`
  if (operation?.type === 'student_upsert') return `student_upsert:${operation.mode || 'unknown'}:${operation.localId ?? 'none'}`
  if (operation?.type === 'student_balance_set') return `student_balance_set:${operation?.payload?.studentId ?? 'none'}`
  if (operation?.type === 'wallet_entry_create') return `wallet_entry_create:${operation?.payload?.operation_id ?? 'none'}`
  if (operation?.type === 'reservation_cancel') return `reservation_cancel:${operation?.payload?.reservationId ?? 'none'}`
  return null
}

const appendDependency = (dependencies, operationId) => {
  if (!operationId) return dependencies
  if (dependencies.includes(operationId)) return dependencies
  return [...dependencies, operationId]
}

const deriveDependencies = (operation, existingQueue = []) => {
  const queue = Array.isArray(existingQueue) ? existingQueue : []
  let dependencies = Array.isArray(operation?.dependencies) ? [...operation.dependencies] : []
  const findLatest = (predicate) => queue.slice().reverse().find(predicate)?.id || null

  if (operation?.type === 'reservation_create') {
    dependencies = appendDependency(
      dependencies,
      findLatest((item) => item.type === 'student_upsert' && String(item.localId) === String(operation?.payload?.studentId)),
    )
    dependencies = appendDependency(
      dependencies,
      findLatest((item) => item.type === 'book_upsert' && String(item.localId) === String(operation?.payload?.bookId)),
    )
  }

  if (operation?.type === 'transaction_create') {
    dependencies = appendDependency(
      dependencies,
      findLatest((item) => item.type === 'student_upsert' && String(item.localId) === String(operation?.payload?.studentId)),
    )
    for (const item of operation?.payload?.items || []) {
      dependencies = appendDependency(
        dependencies,
        findLatest((queued) => queued.type === 'book_upsert' && String(queued.localId) === String(item.bookId)),
      )
      if (item.reservationId != null) {
        dependencies = appendDependency(
          dependencies,
          findLatest((queued) => String(queued.localReservationId) === String(item.reservationId)),
        )
      }
    }
  }

  if (operation?.type === 'student_balance_set') {
    dependencies = appendDependency(
      dependencies,
      findLatest((item) => item.type === 'student_upsert' && String(item.localId) === String(operation?.payload?.studentId)),
    )
  }

  if (operation?.type === 'wallet_entry_create') {
    dependencies = appendDependency(
      dependencies,
      findLatest((item) => item.type === 'student_upsert' && String(item.localId) === String(operation?.payload?.studentId)),
    )
  }

  if (operation?.type === 'reservation_cancel') {
    dependencies = appendDependency(
      dependencies,
      findLatest((item) => String(item.localReservationId) === String(operation?.payload?.reservationId)),
    )
  }

  return dependencies.filter(Boolean)
}

const normalizeQueueOperation = (operation) => ({
  id: operation?.id || createOperationId(),
  createdAt: operation?.createdAt || new Date().toISOString(),
  retryCount: Number(operation?.retryCount) || 0,
  status: operation?.status || 'pending',
  dedupeKey: computeDedupeKey(operation),
  fingerprint: operation?.fingerprint || computeOperationFingerprint(operation),
  replayToken: operation?.replayToken || null,
  priority: operation?.priority || defaultPriorityFor(operation?.type),
  maxRetries: Number(operation?.maxRetries) || 6,
  nextRetryAt: operation?.nextRetryAt || null,
  lastAttemptAt: operation?.lastAttemptAt || null,
  lastError: operation?.lastError || null,
  dependencies: Array.isArray(operation?.dependencies) ? operation.dependencies : [],
  history: limitHistory(
    Array.isArray(operation?.history) && operation.history.length > 0
      ? operation.history
      : [createHistoryEntry('queued')],
  ),
  ...operation,
})

export const createQueueOperation = (operation, existingQueue = []) => {
  const normalized = normalizeQueueOperation(operation)
  return {
    ...normalized,
    dedupeKey: computeDedupeKey(normalized),
    dependencies: deriveDependencies(normalized, existingQueue),
    history: limitHistory(
      normalized.history?.length ? normalized.history : [createHistoryEntry('queued')],
    ),
  }
}

export const dedupeQueue = (queue) => {
  const items = Array.isArray(queue) ? queue.map((item) => normalizeQueueOperation(item)) : []
  const lastIndexByKey = new Map()
  for (let index = 0; index < items.length; index += 1) {
    const dedupeKey = items[index]?.dedupeKey
    if (dedupeKey) lastIndexByKey.set(dedupeKey, index)
  }
  return items.filter((item, index) => {
    if (!item?.dedupeKey) return true
    return lastIndexByKey.get(item.dedupeKey) === index
  })
}

export const enqueueOperation = async ({ setSyncQueue, operation }) => {
  let op
  let nextQueue = []
  setSyncQueue((prev) => {
    op = createQueueOperation(operation, prev)
    nextQueue = dedupeQueue([...prev, op])
    return nextQueue
  })
  try {
    await replaceSyncQueue(nextQueue)
    trackSyncEvent('queue_enqueued', {
      queueDepth: nextQueue.length,
      context: {
        operationId: op.id,
        type: op.type,
        mode: op.mode || null,
        priority: op.priority,
        dependencyCount: (op.dependencies || []).length,
      },
    })
  } catch {
    trackSyncEvent('queue_persist_failed', {
      level: 'error',
      context: { operationId: op.id, type: op.type, mode: op.mode || null },
    })
    // Keep in-memory queue if IndexedDB write fails.
  }
  return op
}

export const persistQueueState = async (queue) => {
  const normalized = dedupeQueue((queue || []).map((item) => normalizeQueueOperation(item)))
  await replaceSyncQueue(normalized)
  trackSyncEvent('queue_persisted', { queueDepth: normalized.length })
}
