import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./indexedDb', () => ({
  getSyncQueue: vi.fn(),
  replaceSyncQueue: vi.fn(),
  setSyncMetadata: vi.fn(),
}))

vi.mock('../../services/observabilityClient', () => ({
  trackSyncEvent: vi.fn(),
}))

import { getSyncQueue, replaceSyncQueue } from './indexedDb'
import { processSyncQueueOnce } from './syncManager'

describe('sync manager reliability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('schedules retry metadata for transient replay failures', async () => {
    getSyncQueue.mockResolvedValue([
      {
        id: 'op-1',
        type: 'emergency_withdrawal',
        createdAt: '2026-01-01T00:00:00.000Z',
        retryCount: 0,
        status: 'pending',
        maxRetries: 4,
        payload: { amount: 10, reason: 'test', staffName: 'Heba' },
      },
    ])

    const apiRequest = vi.fn(async (path) => {
      if (path === '/auth/me') return { ok: true }
      const error = new Error('temporary outage')
      error.status = 503
      throw error
    })

    const result = await processSyncQueueOnce({
      authUser: { id: 1 },
      useBackend: true,
      syncInFlightRef: { current: false },
      setIsSyncing: vi.fn(),
      syncQueue: [],
      setSyncQueue: vi.fn(),
      apiRequest,
      findServerBookId: vi.fn(),
      findServerStudentId: vi.fn(),
      syncMapReservations: {},
      setSyncMap: vi.fn(),
      mapUiBookToApi: vi.fn(),
      mapUiStudentToApi: vi.fn(),
      isAuthError: () => false,
      handleSessionExpired: vi.fn(),
    })

    expect(result.success).toBe(false)
    expect(replaceSyncQueue).toHaveBeenCalled()
    const persistedQueue = replaceSyncQueue.mock.calls.at(-1)[0]
    expect(persistedQueue[0].retryCount).toBe(1)
    expect(persistedQueue[0].nextRetryAt).toBeTruthy()
    expect(persistedQueue[0].status).toBe('pending')
  })

  it('reloads the latest persisted queue before replaying work', async () => {
    getSyncQueue.mockResolvedValue([
      {
        id: 'op-2',
        type: 'receipt_archive',
        createdAt: '2026-01-01T00:00:00.000Z',
        retryCount: 0,
        status: 'pending',
        payload: {
          transactionCode: 'TX-1',
          receiptType: 'sale',
          staffName: 'Mariam',
          payload: { total: 25 },
        },
      },
    ])

    const setSyncQueue = vi.fn()
    const apiRequest = vi.fn(async (path) => {
      if (path === '/auth/me') return { ok: true }
      if (path === '/receipt-archive') return { id: 9 }
      return null
    })

    const result = await processSyncQueueOnce({
      authUser: { id: 1 },
      useBackend: true,
      syncInFlightRef: { current: false },
      setIsSyncing: vi.fn(),
      syncQueue: [],
      setSyncQueue,
      apiRequest,
      findServerBookId: vi.fn(),
      findServerStudentId: vi.fn(),
      syncMapReservations: {},
      setSyncMap: vi.fn(),
      mapUiBookToApi: vi.fn(),
      mapUiStudentToApi: vi.fn(),
      isAuthError: () => false,
      handleSessionExpired: vi.fn(),
    })

    expect(result.success).toBe(true)
    expect(apiRequest).toHaveBeenCalledWith(
      '/receipt-archive',
      expect.objectContaining({
        method: 'POST',
        syncMeta: expect.objectContaining({
          operationId: expect.stringContaining('op-2:receipt-archive'),
        }),
      }),
    )
    expect(setSyncQueue).toHaveBeenCalledWith([])
  })
})
