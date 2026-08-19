import { addReplayFailure, getSyncQueue, setSyncMetadata } from './indexedDb'
import { acquireReplayLock, getReplayTabId } from './syncLocks'
import { classifyReplayError } from './conflictResolver'
import { trackSyncEvent } from '../../services/observabilityClient'

export const runReplayCycle = async ({
  runReplay,
  isAuthError,
  onAuthExpired,
  queueSnapshot,
  setQueueState,
}) => {
  const lock = acquireReplayLock()
  if (!lock.acquired) {
    trackSyncEvent('replay_skipped_locked', {
      level: 'warn',
      queueDepth: Array.isArray(queueSnapshot) ? queueSnapshot.length : 0,
    })
    return { skipped: true, reason: 'locked' }
  }
  const heartbeatTimer = setInterval(() => {
    if (!lock.heartbeat()) {
      trackSyncEvent('replay_lock_lost', {
        level: 'warn',
        context: { owner: lock.owner || null },
      })
    }
  }, 4000)
  const startedAt = new Date().toISOString()
  const startedPerf = performance.now()
  const liveQueue = await getSyncQueue()
  if (typeof setQueueState === 'function') setQueueState(liveQueue)
  trackSyncEvent('replay_started', {
    queueDepth: Array.isArray(liveQueue) ? liveQueue.length : Array.isArray(queueSnapshot) ? queueSnapshot.length : 0,
    context: { owner: getReplayTabId() },
  })
  await setSyncMetadata('replay_last_started_at', startedAt)
  await setSyncMetadata('replay_owner', {
    owner: getReplayTabId(),
    startedAt,
  })
  try {
    const result = await runReplay()
    await setSyncMetadata('replay_last_success_at', new Date().toISOString())
    await setSyncMetadata('replay_last_result', {
      success: true,
      processedCount: result?.processedCount || 0,
      remainingCount: result?.remainingCount || 0,
    })
    trackSyncEvent('replay_succeeded', {
      queueDepth: Array.isArray(liveQueue) ? liveQueue.length : 0,
      replayDurationMs: Math.round(performance.now() - startedPerf),
    })
    return { skipped: false, success: true, result }
  } catch (error) {
    const resolution = classifyReplayError({ error, isAuthError })
    if (resolution.action === 'auth_expired') onAuthExpired?.()
    await addReplayFailure({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      operationId: liveQueue?.[0]?.id || queueSnapshot?.[0]?.id || null,
      error: error?.message || 'Replay failed',
      payload: {
        action: resolution.action,
        queueLength: Array.isArray(liveQueue) ? liveQueue.length : 0,
      },
      createdAt: new Date().toISOString(),
    })
    await setSyncMetadata('replay_last_failure_at', new Date().toISOString())
    await setSyncMetadata('replay_last_result', {
      success: false,
      resolution: resolution.action,
      error: error?.message || 'Replay failed',
    })
    trackSyncEvent('replay_failed', {
      level: resolution.action === 'retry' ? 'warn' : 'error',
      queueDepth: Array.isArray(liveQueue) ? liveQueue.length : 0,
      replayDurationMs: Math.round(performance.now() - startedPerf),
      context: {
        resolution: resolution.action,
        error: error?.message || 'Replay failed',
      },
    })
    return { skipped: false, success: false, resolution }
  } finally {
    clearInterval(heartbeatTimer)
    lock.release()
  }
}
