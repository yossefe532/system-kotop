import { appendSyncQueueItem, replaceSyncQueue } from './indexedDb'
import { trackSyncEvent } from '../../services/observabilityClient'

export const createQueueOperation = (operation) => ({
  id: operation?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  createdAt: operation?.createdAt || new Date().toISOString(),
  retryCount: Number(operation?.retryCount) || 0,
  status: operation?.status || 'pending',
  dedupeKey: operation?.dedupeKey || null,
  ...operation,
})

export const dedupeQueue = (queue) => {
  const seen = new Set()
  const result = []
  for (const op of queue || []) {
    const dedupeKey = op?.dedupeKey
    if (dedupeKey) {
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)
    }
    result.push(op)
  }
  return result
}

export const enqueueOperation = async ({ setSyncQueue, operation }) => {
  const op = createQueueOperation(operation)
  setSyncQueue((prev) => dedupeQueue([...prev, op]))
  try {
    await appendSyncQueueItem(op)
    trackSyncEvent('queue_enqueued', {
      queueDepth: 1,
      context: { operationId: op.id, type: op.type, mode: op.mode || null },
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
  const normalized = dedupeQueue((queue || []).map(createQueueOperation))
  await replaceSyncQueue(normalized)
  trackSyncEvent('queue_persisted', { queueDepth: normalized.length })
}
