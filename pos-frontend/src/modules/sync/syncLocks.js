const LOCK_KEY = 'educon-pos-sync-lock-v1'
const DEFAULT_TTL_MS = 12000
const createOwnerId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

const now = () => Date.now()

export const createReplayLockController = ({
  storage,
  lockKey = LOCK_KEY,
  ownerId = createOwnerId(),
} = {}) => {
  const channel =
    typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('educon-pos-sync-leader-v1') : null

  const readLock = () => {
    try {
      if (!storage) return null
      const raw = storage.getItem(lockKey)
      if (!raw) return null
      return JSON.parse(raw)
    } catch {
      return null
    }
  }

  const writeLock = (lock) => {
    if (!storage) return
    storage.setItem(lockKey, JSON.stringify(lock))
  }

  const removeLock = () => {
    if (!storage) return
    storage.removeItem(lockKey)
  }

  const announce = (type, payload = {}) => {
    if (!channel) return
    channel.postMessage({ type, ownerId, ...payload })
  }

  return {
    ownerId,
    acquire({ ttlMs = DEFAULT_TTL_MS } = {}) {
      if (!storage) return { acquired: true, owner: ownerId, release: () => {}, heartbeat: () => true }
      const existing = readLock()
      const current = now()
      if (existing && existing.owner !== ownerId && existing.expiresAt > current) {
        announce('leader_busy', { owner: existing.owner })
        return { acquired: false, owner: existing.owner, release: () => {}, heartbeat: () => false }
      }
      const next = {
        owner: ownerId,
        token: `${ownerId}-${current}`,
        acquiredAt: current,
        expiresAt: current + ttlMs,
      }
      writeLock(next)
      const confirmation = readLock()
      const acquired = confirmation?.token === next.token
      if (acquired) announce('leader_acquired', { token: next.token })
      return {
        acquired,
        owner: acquired ? ownerId : confirmation?.owner,
        token: confirmation?.token || null,
        release: () => {
          const latest = readLock()
          if (latest?.token === next.token) {
            removeLock()
            announce('leader_released', { token: next.token })
          }
        },
        heartbeat: () => {
          const latest = readLock()
          if (!latest || latest.token !== next.token) return false
          writeLock({ ...latest, expiresAt: now() + ttlMs })
          announce('leader_heartbeat', { token: next.token })
          return true
        },
      }
    },
    getOwner() {
      const lock = readLock()
      if (!lock || lock.expiresAt <= now()) return null
      return lock.owner
    },
    subscribe(handler) {
      if (!channel) return () => {}
      const listener = (event) => handler?.(event.data)
      channel.addEventListener('message', listener)
      return () => channel.removeEventListener('message', listener)
    },
  }
}

const defaultController = createReplayLockController({
  storage: typeof localStorage === 'undefined' ? null : localStorage,
})

export const acquireReplayLock = (options = {}) => defaultController.acquire(options)

export const getReplayOwner = () => defaultController.getOwner()

export const getReplayTabId = () => defaultController.ownerId

export const subscribeReplayLeadership = (handler) => defaultController.subscribe(handler)
