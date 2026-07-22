const TELEMETRY_PATH = '/observability/frontend-events'

const defaultApiBaseUrl = (() => {
  const raw = import.meta.env.VITE_API_BASE_URL
  if (typeof raw === 'string' && raw.trim()) return raw.trim().replace(/\/+$/, '')
  return ''
})()

const sanitizeContext = (context = {}) => {
  const next = {}
  for (const [key, value] of Object.entries(context || {})) {
    if (value == null) continue
    if (/(token|password|authorization|payload|phone)/i.test(key)) continue
    if (typeof value === 'string') {
      next[key] = value.slice(0, 200)
      continue
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      next[key] = value
      continue
    }
    if (Array.isArray(value)) {
      next[key] = value.slice(0, 10)
      continue
    }
    if (typeof value === 'object') {
      next[key] = '[object]'
    }
  }
  return next
}

export const emitTelemetry = async ({
  apiBaseUrl = defaultApiBaseUrl,
  event,
  level = 'info',
  category = 'frontend',
  queueDepth,
  replayDurationMs,
  context = {},
}) => {
  const body = {
    event,
    level,
    category,
    queue_depth: queueDepth,
    replay_duration_ms: replayDurationMs,
    context: sanitizeContext(context),
  }

  const logger = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info
  logger('[observability]', body)

  if (!apiBaseUrl || typeof fetch === 'undefined') return
  try {
    await fetch(`${apiBaseUrl}${TELEMETRY_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    })
  } catch {
    // Best-effort telemetry only.
  }
}

export const trackApiRequest = (details) =>
  emitTelemetry({
    event: 'api_request',
    category: 'api',
    ...details,
  })

export const trackAuthEvent = (event, details = {}) =>
  emitTelemetry({
    event,
    category: 'auth',
    ...details,
  })

export const trackSyncEvent = (event, details = {}) =>
  emitTelemetry({
    event,
    category: 'sync',
    ...details,
  })

export const trackUiError = (event, details = {}) =>
  emitTelemetry({
    event,
    category: 'ui',
    level: 'error',
    ...details,
  })
