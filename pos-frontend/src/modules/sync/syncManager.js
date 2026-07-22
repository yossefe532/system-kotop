import { trackSyncEvent } from '../../services/observabilityClient'

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
  return async (localStudentId) => {
    if (localStudentId == null) return null
    const asKey = String(localStudentId)
    const mapped = syncMap.students?.[asKey]
    if (mapped) return mapped
    const localStudent = students.find((s) => String(s.id) === asKey)
    if (!localStudent) return Number(localStudentId)
    const serverStudents = await apiRequest('/students')
    const exact = Array.isArray(serverStudents)
      ? serverStudents.find(
          (s) =>
            (localStudent.phone && s.phone && s.phone === localStudent.phone) ||
            s.name?.trim().toLowerCase() === localStudent.name?.trim().toLowerCase(),
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
    const created = await apiRequest('/students', {
      method: 'POST',
      body: JSON.stringify(
        mapUiStudentToApi({
          ...localStudent,
          balance: Number(localStudent.balance) || 0,
        }),
      ),
    })
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
  return async (localBookId) => {
    if (localBookId == null) return null
    const asKey = String(localBookId)
    const mapped = syncMap.books?.[asKey]
    if (mapped) return mapped
    const localBook = books.find((b) => String(b.id) === asKey)
    if (!localBook) return Number(localBookId)
    const serverBooks = await apiRequest('/books')
    const exact = Array.isArray(serverBooks)
      ? serverBooks.find(
          (b) =>
            (localBook.barcode && b.isbn_barcode && b.isbn_barcode === localBook.barcode) ||
            (b.title?.trim().toLowerCase() === localBook.title?.trim().toLowerCase() &&
              b.author?.trim().toLowerCase() === localBook.author?.trim().toLowerCase()),
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
    const created = await apiRequest('/books', {
      method: 'POST',
      body: JSON.stringify(
        mapUiBookToApi({
          ...localBook,
          reservedStock: Number(localBook.reservedStock) || 0,
        }),
      ),
    })
    const serverId = Number(created.id)
    setSyncMap((prev) => ({
      ...prev,
      books: { ...(prev.books || {}), [asKey]: serverId },
    }))
    return serverId
  }
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
  if (!authUser || !useBackend || syncInFlightRef.current || syncQueue.length === 0) return
  syncInFlightRef.current = true
  setIsSyncing(true)
  let remaining = [...syncQueue]
  const startedAt = performance.now()
  try {
    trackSyncEvent('sync_batch_started', { queueDepth: remaining.length })
    await apiRequest('/auth/me')
    while (remaining.length > 0) {
      const op = remaining[0]
      trackSyncEvent('sync_operation_started', {
        queueDepth: remaining.length,
        context: { operationId: op.id, type: op.type, mode: op.mode || null },
      })
      if (op.type === 'book_upsert') {
        const payload = op.payload
        if (op.mode === 'edit') {
          const serverBookId = await findServerBookId(op.localId)
          await apiRequest(`/books/${serverBookId}`, {
            method: 'PUT',
            body: JSON.stringify(mapUiBookToApi({ ...payload, reservedStock: payload.reservedStock ?? 0 })),
          })
        } else {
          await findServerBookId(op.localId)
        }
      } else if (op.type === 'student_upsert') {
        const payload = op.payload
        if (op.mode === 'edit') {
          const serverStudentId = await findServerStudentId(op.localId)
          await apiRequest(`/students/${serverStudentId}`, {
            method: 'PUT',
            body: JSON.stringify(mapUiStudentToApi({ ...payload, balance: payload.balance ?? 0 })),
          })
        } else {
          await findServerStudentId(op.localId)
        }
      } else if (op.type === 'reservation_create') {
        const serverStudentId = await findServerStudentId(op.payload.studentId)
        const serverBookId = await findServerBookId(op.payload.bookId)
        const created = await apiRequest('/reservations', {
          method: 'POST',
          body: JSON.stringify({
            student_id: serverStudentId,
            book_id: serverBookId,
            quantity: op.payload.qty,
            deposit_amount: op.payload.deposit || 0,
            staff_name: op.payload.staffName,
          }),
        })
        if (op.localReservationId != null && created?.id != null) {
          setSyncMap((prev) => ({
            ...prev,
            reservations: {
              ...(prev.reservations || {}),
              [String(op.localReservationId)]: Number(created.id),
            },
          }))
        }
      } else if (op.type === 'transaction_create') {
        const serverStudentId = await findServerStudentId(op.payload.studentId)
        const items = []
        for (const item of op.payload.items || []) {
          const serverBookId = await findServerBookId(item.bookId)
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
          await apiRequest('/transactions', {
            method: 'POST',
            body: JSON.stringify({
              student_id: serverStudentId,
              discount: op.payload.discount || 0,
              staff_name: op.payload.staffName,
              items,
            }),
          })
        }
      } else if (op.type === 'student_balance_set') {
        const serverStudentId = await findServerStudentId(op.payload.studentId)
        await apiRequest(`/students/${serverStudentId}`, {
          method: 'PUT',
          body: JSON.stringify(
            mapUiStudentToApi({
              ...op.payload.studentSnapshot,
              balance: op.payload.balance,
            }),
          ),
        })
      } else if (op.type === 'reservation_cancel') {
        const localId = String(op.payload.reservationId)
        const serverReservationId = syncMapReservations?.[localId] || op.payload.reservationId
        await apiRequest(`/reservations/${serverReservationId}`, { method: 'DELETE' })
        if (op.payload.refundMethod === 'cash' && op.payload.refundAmount > 0) {
          await apiRequest('/safe/emergency-withdrawals', {
            method: 'POST',
            body: JSON.stringify({
              amount: op.payload.refundAmount,
              reason: 'Refund cancelled reservation',
              staff_name: op.payload.staffName,
            }),
          })
        }
        if (op.payload.refundMethod === 'wallet') {
          const serverStudentId = await findServerStudentId(op.payload.studentId)
          await apiRequest(`/students/${serverStudentId}`, {
            method: 'PUT',
            body: JSON.stringify(
              mapUiStudentToApi({
                ...op.payload.studentSnapshot,
                balance: op.payload.nextBalance,
              }),
            ),
          })
        }
      } else if (op.type === 'emergency_withdrawal') {
        await apiRequest('/safe/emergency-withdrawals', {
          method: 'POST',
          body: JSON.stringify({
            amount: op.payload.amount,
            reason: op.payload.reason || null,
            staff_name: op.payload.staffName,
          }),
        })
      } else if (op.type === 'receipt_archive') {
        await apiRequest('/receipt-archive', {
          method: 'POST',
          body: JSON.stringify({
            transaction_code: op.payload.transactionCode || null,
            receipt_type: op.payload.receiptType,
            staff_name: op.payload.staffName || null,
            payload: op.payload.payload,
          }),
        })
      }
      trackSyncEvent('sync_operation_succeeded', {
        queueDepth: Math.max(remaining.length - 1, 0),
        context: { operationId: op.id, type: op.type, mode: op.mode || null },
      })
      remaining.shift()
      setSyncQueue([...remaining])
    }
    trackSyncEvent('sync_batch_succeeded', {
      queueDepth: 0,
      replayDurationMs: Math.round(performance.now() - startedAt),
    })
  } catch (error) {
    if (isAuthError(error)) {
      trackSyncEvent('sync_batch_auth_expired', {
        level: 'warn',
        queueDepth: remaining.length,
        replayDurationMs: Math.round(performance.now() - startedAt),
      })
      handleSessionExpired()
    } else {
      trackSyncEvent('sync_batch_failed', {
        level: 'error',
        queueDepth: remaining.length,
        replayDurationMs: Math.round(performance.now() - startedAt),
        context: { error: error?.message || 'Sync failed' },
      })
    }
  } finally {
    syncInFlightRef.current = false
    setIsSyncing(false)
  }
}
