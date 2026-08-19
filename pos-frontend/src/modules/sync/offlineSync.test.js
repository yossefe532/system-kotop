import { describe, expect, it, beforeEach, vi } from 'vitest'
import { classifyReplayError } from './conflictResolver'
import { dedupeQueue, createQueueOperation } from './queueManager'
import { getRetryDelayMs } from './retryPolicy'
import { createReplayLockController } from './syncLocks'

const createMemoryStorage = () => {
  const data = new Map()
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    clear: () => data.clear(),
  }
}

describe('offline sync helpers', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage())
  })

  it('dedupes queue by dedupe key while preserving order', () => {
    const one = createQueueOperation({ type: 'book_upsert', dedupeKey: 'book:1', localId: 1 })
    const two = createQueueOperation({ type: 'book_upsert', dedupeKey: 'book:1', localId: 1, payload: { title: 'Latest' } })
    const three = createQueueOperation({ type: 'student_upsert', dedupeKey: 'student:1', localId: 1 })
    const queue = dedupeQueue([one, two, three])
    expect(queue).toHaveLength(2)
    expect(queue[0].payload.title).toBe('Latest')
    expect(queue[1].dedupeKey).toBe('student:1')
  })

  it('assigns dependencies for operations that rely on earlier offline entities', () => {
    const student = createQueueOperation({ type: 'student_upsert', mode: 'add', localId: 11 })
    const reservation = createQueueOperation(
      {
        type: 'reservation_create',
        localReservationId: 'r1',
        payload: { studentId: 11, bookId: 21, qty: 1, deposit: 5, staffName: 'Heba' },
      },
      [student, createQueueOperation({ type: 'book_upsert', mode: 'add', localId: 21 })],
    )
    expect(reservation.dependencies.length).toBeGreaterThan(0)
  })

  it('uses exponential retry delay with cap', () => {
    expect(getRetryDelayMs(0)).toBe(1000)
    expect(getRetryDelayMs(1)).toBe(2000)
    expect(getRetryDelayMs(5)).toBe(30000)
    expect(getRetryDelayMs(10)).toBe(30000)
  })

  it('classifies replay errors for auth and retry handling', () => {
    const auth = classifyReplayError({ error: { message: 'expired' }, isAuthError: () => true })
    const retry = classifyReplayError({ error: { status: 500 }, isAuthError: () => false })
    const quarantine = classifyReplayError({ error: { status: 409 }, isAuthError: () => false })
    expect(auth.action).toBe('auth_expired')
    expect(retry.action).toBe('retry')
    expect(retry.category).toBe('server')
    expect(quarantine.action).toBe('quarantine')
  })

  it('prevents different tabs from owning the replay lock simultaneously', () => {
    const storage = createMemoryStorage()
    const firstController = createReplayLockController({ storage, ownerId: 'tab-a' })
    const secondController = createReplayLockController({ storage, ownerId: 'tab-b' })
    const first = firstController.acquire({ ttlMs: 5000 })
    const second = secondController.acquire({ ttlMs: 5000 })
    expect(first.acquired).toBe(true)
    expect(second.acquired).toBe(false)
    first.release()
  })
})
