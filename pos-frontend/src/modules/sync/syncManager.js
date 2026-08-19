import { trackSyncEvent } from '../../services/observabilityClient'
import { classifyReplayError } from './conflictResolver'
import { getSyncQueue, replaceSyncQueue, setSyncMetadata } from './indexedDb'
import { getRetryDelayMs } from './retryPolicy'

const HISTORY_LIMIT = 12
const TERMINAL_QUEUE_STATUSES = new Set(['quarantined', 'failed_permanent'])

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
  let hash = 2166136261
  for (const character of String(input || '')) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return `req-${(hash >>> 0).toString(16)}`
}

const getRetryToken = (operationId, step, attempt) => `${operationId}:${step}:attempt:${attempt}`

const createHistoryEntry = (event, context = {}) => ({
  event,
  at: new Date().toISOString(),
  ...context,
})

const appendHistory = (operation, event, context = {}) => ({
  ...operation,
  history: [...(Array.isArray(operation?.history) ? operation.history : []), createHistoryEntry(event, context)].slice(
    -HISTORY_LIMIT,
  ),
})

const priorityWeight = (priority) => ({ high: 0, medium: 1, low: 2 }[priority] ?? 1)

const sortReplayQueue = (queue) =>
  (Array.isArray(queue) ? queue : [])
    .slice()
    .sort((left, right) => {
      const leftRetry = left?.nextRetryAt ? new Date(left.nextRetryAt).getTime() : 0
      const rightRetry = right?.nextRetryAt ? new Date(right.nextRetryAt).getTime() : 0
      if (leftRetry !== rightRetry) return leftRetry - rightRetry
      const leftPriority = priorityWeight(left?.priority)
      const rightPriority = priorityWeight(right?.priority)
      if (leftPriority !== rightPriority) return leftPriority - rightPriority
      return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
    })

const buildSyncMeta = (operation, step, payload) => {
  const attempt = (Number(operation?.retryCount) || 0) + 1
  return {
    operationId: `${operation.id}:${step}`,
    operationType: operation.type,
    replayToken: getRetryToken(operation.id, step, attempt),
    fingerprint: hashString(
      stableSerialize({
        operationId: operation.id,
        step,
        payload,
      }),
    ),
  }
}

const withSyncOptions = (operation, step, payload, options = {}) => ({
  ...options,
  syncMeta: buildSyncMeta(operation, step, payload),
})

const persistQueue = async (queue, setSyncQueue) => {
  const nextQueue = sortReplayQueue(queue)
  await replaceSyncQueue(nextQueue)
  setSyncQueue([...nextQueue])
}

export const enqueueSyncOperation = (setSyncQueue, operation) => {
  setSyncQueue((prev) => [
    ...prev,
    {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      ...operation,
    },
  ])
}

export const createFindServerStudentId = ({
  syncMap,
  students,
  setSyncMap,
  apiRequest,
  mapUiStudentToApi,
}) => {
  return async (localStudentId, syncContext = {}) => {
    if (localStudentId == null) return null
    const asKey = String(localStudentId)
    const mapped = syncMap.students?.[asKey]
    if (mapped) return mapped
    const localStudent = students.find((student) => String(student.id) === asKey)
    if (!localStudent) return Number(localStudentId)
    const serverStudents = await apiRequest('/students?limit=200', {
      headers: { 'x-client-request-source': 'offline-sync' },
    })
    const exact = Array.isArray(serverStudents)
      ? serverStudents.find(
          (student) =>
            (localStudent.phone && student.phone && student.phone === localStudent.phone) ||
            student.name?.trim().toLowerCase() === localStudent.name?.trim().toLowerCase(),
        )
      : null
    if (exact?.id != null) {
      const serverId = Number(exact.id)
      setSyncMap((prev) => ({
        ...prev,
        students: { ...(prev.students || {}), [asKey]: serverId },
      }))
      return serverId
    }
    const createPayload = mapUiStudentToApi({
      ...localStudent,
      balance: Number(localStudent.balance) || 0,
    })
    const created = await apiRequest(
      '/students',
      withSyncOptions(syncContext.operation, syncContext.step || `student-create-${asKey}`, createPayload, {
        method: 'POST',
        body: JSON.stringify(createPayload),
      }),
    )
    const serverId = Number(created.id)
    setSyncMap((prev) => ({
      ...prev,
      students: { ...(prev.students || {}), [asKey]: serverId },
    }))
    return serverId
  }
}

export const createFindServerBookId = ({
  syncMap,
  books,
  setSyncMap,
  apiRequest,
  mapUiBookToApi,
}) => {
  return async (localBookId, syncContext = {}) => {
    if (localBookId == null) return null
    const asKey = String(localBookId)
    const mapped = syncMap.books?.[asKey]
    if (mapped) return mapped
    const localBook = books.find((book) => String(book.id) === asKey)
    if (!localBook) return Number(localBookId)
    const serverBooks = await apiRequest('/books?limit=200', {
      headers: { 'x-client-request-source': 'offline-sync' },
    })
    const exact = Array.isArray(serverBooks)
      ? serverBooks.find(
          (book) =>
            (localBook.barcode && book.isbn_barcode && book.isbn_barcode === localBook.barcode) ||
            (book.title?.trim().toLowerCase() === localBook.title?.trim().toLowerCase() &&
              book.author?.trim().toLowerCase() === localBook.author?.trim().toLowerCase()),
        )
      : null
    if (exact?.id != null) {
      const serverId = Number(exact.id)
      setSyncMap((prev) => ({
        ...prev,
        books: { ...(prev.books || {}), [asKey]: serverId },
      }))
      return serverId
    }
    const createPayload = mapUiBookToApi({
      ...localBook,
      reservedStock: Number(localBook.reservedStock) || 0,
    })
    const created = await apiRequest(
      '/books',
      withSyncOptions(syncContext.operation, syncContext.step || `book-create-${asKey}`, createPayload, {
        method: 'POST',
        body: JSON.stringify(createPayload),
      }),
    )
    const serverId = Number(created.id)
    setSyncMap((prev) => ({
      ...prev,
      books: { ...(prev.books || {}), [asKey]: serverId },
    }))
    return serverId
  }
}

const markReplayCheckpoint = async (value) => {
  await setSyncMetadata('replay_checkpoint', {
    ...value,
    updatedAt: new Date().toISOString(),
  })
}

const resolveDependencies = (queue, operation) =>
  (operation?.dependencies || []).filter((dependencyId) => queue.some((item) => item.id === dependencyId))

const buildRetriableOperation = (operation, error, resolution) => {
  const retryCount = (Number(operation?.retryCount) || 0) + 1
  const reachedRetryLimit = retryCount >= (Number(operation?.maxRetries) || 6)
  if (resolution.action === 'retry' && !reachedRetryLimit) {
    return appendHistory(
      {
        ...operation,
        status: 'pending',
        retryCount,
        nextRetryAt: new Date(Date.now() + getRetryDelayMs(retryCount - 1)).toISOString(),
        lastError: error?.message || 'Replay failed',
        leaseExpiresAt: null,
      },
      'retry_scheduled',
      {
        retryCount,
        category: resolution.category || 'unknown',
      },
    )
  }
  return appendHistory(
    {
      ...operation,
      status: resolution.action === 'quarantine' ? 'quarantined' : 'failed_permanent',
      retryCount,
      nextRetryAt: null,
      lastError: error?.message || 'Replay failed',
      leaseExpiresAt: null,
    },
    resolution.action === 'quarantine' ? 'conflict_detected' : 'failed_permanent',
    {
      retryCount,
      category: resolution.category || 'unknown',
    },
  )
}

export const processSyncQueueOnce = async ({
  authUser,
  useBackend,
  syncInFlightRef,
  setIsSyncing,
  syncQueue,
  setSyncQueue,
  apiRequest,
  findServerBookId,
  findServerStudentId,
  syncMapReservations,
  setSyncMap,
  mapUiBookToApi,
  mapUiStudentToApi,
  isAuthError,
  handleSessionExpired,
}) => {
  if (!authUser || !useBackend || syncInFlightRef.current) return { skipped: true, reason: 'disabled' }

  const latestQueue = sortReplayQueue((await getSyncQueue()) || syncQueue || [])
  if (latestQueue.length === 0) {
    setSyncQueue([])
    return { skipped: true, reason: 'empty' }
  }

  syncInFlightRef.current = true
  setIsSyncing(true)
  let remaining = latestQueue
  const startedAt = performance.now()

  try {
    setSyncQueue([...remaining])
    trackSyncEvent('sync_batch_started', { queueDepth: remaining.length })
    await apiRequest('/auth/me', {
      headers: { 'x-client-request-source': 'offline-sync' },
    })

    while (remaining.length > 0) {
      remaining = sortReplayQueue(remaining)
      const op = remaining[0]
      const blockedDependencies = resolveDependencies(remaining.slice(1), op)
      const retryAtMs = op?.nextRetryAt ? new Date(op.nextRetryAt).getTime() : 0

      if (TERMINAL_QUEUE_STATUSES.has(op?.status)) {
        await markReplayCheckpoint({
          operationId: op.id,
          status: op.status,
          reason: op.lastError || 'operation_requires_intervention',
        })
        trackSyncEvent('sync_batch_blocked', {
          level: 'warn',
          queueDepth: remaining.length,
          context: { operationId: op.id, status: op.status },
        })
        return { success: false, blocked: true, resolution: { action: op.status } }
      }

      if (retryAtMs && retryAtMs > Date.now()) {
        trackSyncEvent('sync_batch_waiting_retry', {
          queueDepth: remaining.length,
          context: { operationId: op.id, nextRetryAt: op.nextRetryAt },
        })
        return { success: false, blocked: true, resolution: { action: 'retry_wait' } }
      }

      if (blockedDependencies.length > 0) {
        await markReplayCheckpoint({
          operationId: op.id,
          status: 'blocked_dependency',
          dependencies: blockedDependencies,
        })
        trackSyncEvent('sync_batch_waiting_dependency', {
          queueDepth: remaining.length,
          context: { operationId: op.id, dependencyCount: blockedDependencies.length },
        })
        return { success: false, blocked: true, resolution: { action: 'dependency_wait' } }
      }

      const activeOperation = appendHistory(
        {
          ...op,
          status: 'in_progress',
          lastAttemptAt: new Date().toISOString(),
          nextRetryAt: null,
          leaseExpiresAt: new Date(Date.now() + 15000).toISOString(),
        },
        'attempt_started',
        { retryCount: Number(op.retryCount) || 0 },
      )

      remaining[0] = activeOperation
      await persistQueue(remaining, setSyncQueue)
      await markReplayCheckpoint({
        operationId: activeOperation.id,
        status: 'in_progress',
        queueDepth: remaining.length,
      })
      trackSyncEvent('sync_operation_started', {
        queueDepth: remaining.length,
        context: { operationId: activeOperation.id, type: activeOperation.type, mode: activeOperation.mode || null },
      })

      try {
        if (activeOperation.type === 'book_upsert') {
          const payload = activeOperation.payload
          if (activeOperation.mode === 'edit') {
            const serverBookId = await findServerBookId(activeOperation.localId, {
              operation: activeOperation,
              step: 'book-resolve',
            })
            const requestPayload = mapUiBookToApi({ ...payload, reservedStock: payload.reservedStock ?? 0 })
            await apiRequest(
              `/books/${serverBookId}`,
              withSyncOptions(activeOperation, 'book-update', requestPayload, {
                method: 'PUT',
                body: JSON.stringify(requestPayload),
              }),
            )
          } else {
            await findServerBookId(activeOperation.localId, {
              operation: activeOperation,
              step: 'book-create',
            })
          }
        } else if (activeOperation.type === 'student_upsert') {
          const payload = activeOperation.payload
          if (activeOperation.mode === 'edit') {
            const serverStudentId = await findServerStudentId(activeOperation.localId, {
              operation: activeOperation,
              step: 'student-resolve',
            })
            const requestPayload = mapUiStudentToApi({ ...payload, balance: payload.balance ?? 0 })
            await apiRequest(
              `/students/${serverStudentId}`,
              withSyncOptions(activeOperation, 'student-update', requestPayload, {
                method: 'PUT',
                body: JSON.stringify(requestPayload),
              }),
            )
          } else {
            await findServerStudentId(activeOperation.localId, {
              operation: activeOperation,
              step: 'student-create',
            })
          }
        } else if (activeOperation.type === 'reservation_create') {
          const serverStudentId = await findServerStudentId(activeOperation.payload.studentId, {
            operation: activeOperation,
            step: 'reservation-student-resolve',
          })
          const serverBookId = await findServerBookId(activeOperation.payload.bookId, {
            operation: activeOperation,
            step: 'reservation-book-resolve',
          })
          const requestPayload = {
            student_id: serverStudentId,
            book_id: serverBookId,
            quantity: activeOperation.payload.qty,
            deposit_amount: activeOperation.payload.deposit || 0,
            staff_name: activeOperation.payload.staffName,
          }
          const created = await apiRequest(
            '/reservations',
            withSyncOptions(activeOperation, 'reservation-create', requestPayload, {
              method: 'POST',
              body: JSON.stringify(requestPayload),
            }),
          )
          if (activeOperation.localReservationId != null && created?.id != null) {
            setSyncMap((prev) => ({
              ...prev,
              reservations: {
                ...(prev.reservations || {}),
                [String(activeOperation.localReservationId)]: Number(created.id),
              },
            }))
          }
        } else if (activeOperation.type === 'transaction_create') {
          const serverStudentId = await findServerStudentId(activeOperation.payload.studentId, {
            operation: activeOperation,
            step: 'transaction-student-resolve',
          })
          const items = []
          for (const item of activeOperation.payload.items || []) {
            const serverBookId = await findServerBookId(item.bookId, {
              operation: activeOperation,
              step: `transaction-book-resolve-${item.bookId}`,
            })
            let reservationId = null
            if (item.reservationId != null) {
              reservationId = syncMapReservations?.[String(item.reservationId)] || null
            }
            items.push({
              book_id: serverBookId,
              quantity: item.qty,
              reservation_id: reservationId,
            })
          }
          if (items.length > 0) {
            const requestPayload = {
              student_id: serverStudentId,
              discount: activeOperation.payload.discount || 0,
              staff_name: activeOperation.payload.staffName,
              items,
            }
            await apiRequest(
              '/transactions',
              withSyncOptions(activeOperation, 'transaction-create', requestPayload, {
                method: 'POST',
                body: JSON.stringify(requestPayload),
              }),
            )
          }
          } else if (activeOperation.type === 'student_balance_set') {
            const serverStudentId = await findServerStudentId(activeOperation.payload.studentId, {
              operation: activeOperation,
              step: 'student-balance-resolve',
            })
            const requestPayload = mapUiStudentToApi({
              ...activeOperation.payload.studentSnapshot,
              balance: activeOperation.payload.balance,
            })
            await apiRequest(
              `/students/${serverStudentId}`,
              withSyncOptions(activeOperation, 'student-balance-set', requestPayload, {
                method: 'PUT',
                body: JSON.stringify(requestPayload),
              }),
            )
          } else if (activeOperation.type === 'wallet_entry_create') {
            const serverStudentId = await findServerStudentId(activeOperation.payload.studentId, {
              operation: activeOperation,
              step: 'wallet-entry-student-resolve',
            })
            const requestPayload = {
              student_id: serverStudentId,
              entry_type: activeOperation.payload.entry_type,
              amount: activeOperation.payload.amount,
              source_type: activeOperation.payload.source_type ?? null,
              source_id: activeOperation.payload.source_id ?? null,
              operation_id: activeOperation.payload.operation_id,
              actor: activeOperation.payload.actor ?? null,
              device_id: activeOperation.payload.device_id ?? null,
              metadata: activeOperation.payload.metadata ?? null,
            }
            await apiRequest(
              `/students/${serverStudentId}/wallet/entries`,
              withSyncOptions(activeOperation, 'wallet-entry-create', requestPayload, {
                method: 'POST',
                body: JSON.stringify(requestPayload),
              }),
            )
          } else if (activeOperation.type === 'reservation_cancel') {
          const localId = String(activeOperation.payload.reservationId)
          const serverReservationId = syncMapReservations?.[localId] || activeOperation.payload.reservationId
          await apiRequest(
            `/reservations/${serverReservationId}`,
            withSyncOptions(activeOperation, 'reservation-cancel', { reservation_id: serverReservationId }, { method: 'DELETE' }),
          )
          if (activeOperation.payload.refundMethod === 'cash' && activeOperation.payload.refundAmount > 0) {
            const requestPayload = {
              amount: activeOperation.payload.refundAmount,
              reason: 'Refund cancelled reservation',
              staff_name: activeOperation.payload.staffName,
            }
            await apiRequest(
              '/safe/emergency-withdrawals',
              withSyncOptions(activeOperation, 'reservation-cancel-refund-cash', requestPayload, {
                method: 'POST',
                body: JSON.stringify(requestPayload),
              }),
            )
          }
          if (activeOperation.payload.refundMethod === 'wallet') {
            const serverStudentId = await findServerStudentId(activeOperation.payload.studentId, {
              operation: activeOperation,
              step: 'reservation-cancel-student-resolve',
            })
            const requestPayload = mapUiStudentToApi({
              ...activeOperation.payload.studentSnapshot,
              balance: activeOperation.payload.nextBalance,
            })
            await apiRequest(
              `/students/${serverStudentId}`,
              withSyncOptions(activeOperation, 'reservation-cancel-wallet-adjust', requestPayload, {
                method: 'PUT',
                body: JSON.stringify(requestPayload),
              }),
            )
          }
        } else if (activeOperation.type === 'emergency_withdrawal') {
          const requestPayload = {
            amount: activeOperation.payload.amount,
            reason: activeOperation.payload.reason || null,
            staff_name: activeOperation.payload.staffName,
          }
          await apiRequest(
            '/safe/emergency-withdrawals',
            withSyncOptions(activeOperation, 'emergency-withdrawal', requestPayload, {
              method: 'POST',
              body: JSON.stringify(requestPayload),
            }),
          )
        } else if (activeOperation.type === 'receipt_archive') {
          const requestPayload = {
            transaction_code: activeOperation.payload.transactionCode || null,
            receipt_type: activeOperation.payload.receiptType,
            staff_name: activeOperation.payload.staffName || null,
            payload: activeOperation.payload.payload,
          }
          await apiRequest(
            '/receipt-archive',
            withSyncOptions(activeOperation, 'receipt-archive', requestPayload, {
              method: 'POST',
              body: JSON.stringify(requestPayload),
            }),
          )
        }

        trackSyncEvent('sync_operation_succeeded', {
          queueDepth: Math.max(remaining.length - 1, 0),
          context: { operationId: activeOperation.id, type: activeOperation.type, mode: activeOperation.mode || null },
        })
        await markReplayCheckpoint({
          operationId: activeOperation.id,
          status: 'succeeded',
          queueDepth: Math.max(remaining.length - 1, 0),
        })
        remaining.shift()
        await persistQueue(remaining, setSyncQueue)
      } catch (error) {
        if (isAuthError(error)) {
          await markReplayCheckpoint({
            operationId: activeOperation.id,
            status: 'auth_expired',
          })
          trackSyncEvent('sync_batch_auth_expired', {
            level: 'warn',
            queueDepth: remaining.length,
            replayDurationMs: Math.round(performance.now() - startedAt),
          })
          handleSessionExpired()
          return { success: false, authExpired: true }
        }

        const resolution = classifyReplayError({ error, isAuthError })
        const nextOperation = buildRetriableOperation(activeOperation, error, resolution)
        remaining[0] = nextOperation
        await persistQueue(remaining, setSyncQueue)
        await markReplayCheckpoint({
          operationId: nextOperation.id,
          status: nextOperation.status,
          retryCount: nextOperation.retryCount,
          nextRetryAt: nextOperation.nextRetryAt,
          error: error?.message || 'Sync failed',
        })

        trackSyncEvent(
          nextOperation.status === 'pending'
            ? 'sync_operation_retry_scheduled'
            : nextOperation.status === 'quarantined'
              ? 'sync_operation_conflict'
              : 'sync_operation_failed_permanent',
          {
            level: nextOperation.status === 'pending' ? 'warn' : 'error',
            queueDepth: remaining.length,
            context: {
              operationId: nextOperation.id,
              type: nextOperation.type,
              retryCount: nextOperation.retryCount,
              error: error?.message || 'Sync failed',
            },
          },
        )
        return { success: false, resolution }
      }
    }

    trackSyncEvent('sync_batch_succeeded', {
      queueDepth: 0,
      replayDurationMs: Math.round(performance.now() - startedAt),
    })
    return { success: true, processedCount: latestQueue.length }
  } catch (error) {
    trackSyncEvent('sync_batch_failed', {
      level: 'error',
      queueDepth: remaining.length,
      replayDurationMs: Math.round(performance.now() - startedAt),
      context: { error: error?.message || 'Sync failed' },
    })
    return { success: false, error }
  } finally {
    syncInFlightRef.current = false
    setIsSyncing(false)
  }
}
