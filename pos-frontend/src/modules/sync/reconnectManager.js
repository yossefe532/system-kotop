import { trackSyncEvent } from '../../services/observabilityClient'

export const createReconnectManager = ({ onReconnect, intervalMs = 5000 }) => {
  let timer = null

  const runReconnect = async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      trackSyncEvent('network_offline_skip', { level: 'warn' })
      return
    }
    await onReconnect?.()
  }

  const handleOnline = () => {
    trackSyncEvent('network_online', {})
    runReconnect()
  }

  const handleOffline = () => {
    trackSyncEvent('network_offline', { level: 'warn' })
  }

  const start = () => {
    if (typeof window === 'undefined') return () => {}
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    timer = setInterval(() => {
      runReconnect()
    }, intervalMs)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      if (timer) clearInterval(timer)
      timer = null
    }
  }

  return { start }
}
