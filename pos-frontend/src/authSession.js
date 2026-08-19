import { trackApiRequest, trackAuthEvent } from './services/observabilityClient'

const AUTH_STORAGE_KEY = 'educon-pos-auth-v1'
const EXPIRY_SKEW_SECONDS = 30

export class AuthSessionError extends Error {
  constructor(message, code = 'AUTH_ERROR', status = 401) {
    super(message)
    this.name = 'AuthSessionError'
    this.code = code
    this.status = status
    this.authExpired = true
  }
}

const safeJsonParse = (raw) => {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

const decodeJwtPayload = (token) => {
  const parts = String(token || '').split('.')
  if (parts.length < 2) return null
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    return safeJsonParse(atob(padded))
  } catch {
    return null
  }
}

export const loadAuthState = () => {
  if (typeof localStorage === 'undefined') return null
  const raw = localStorage.getItem(AUTH_STORAGE_KEY)
  if (!raw) return null
  const parsed = safeJsonParse(raw)
  if (!parsed || typeof parsed !== 'object') return null
  return parsed
}

export const saveAuthState = (state) => {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(state))
}

export const clearAuthState = () => {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(AUTH_STORAGE_KEY)
}

const isTokenExpiring = (token) => {
  const payload = decodeJwtPayload(token)
  if (!payload?.exp) return true
  const now = Math.floor(Date.now() / 1000)
  return Number(payload.exp) <= now + EXPIRY_SKEW_SECONDS
}

const parseErrorDetail = async (response) => {
  try {
    const data = await response.json()
    return data?.detail ? String(data.detail) : `Request failed: ${response.status}`
  } catch {
    return `Request failed: ${response.status}`
  }
}

const createRequestId = (syncMeta) => {
  if (syncMeta?.operationId) return `${syncMeta.operationId}:${Date.now()}`
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export const login = async (apiBaseUrl, username, password) => {
  const startedAt = performance.now()
  trackAuthEvent('login_started')
  const response = await fetch(`${apiBaseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!response.ok) {
    const detail = await parseErrorDetail(response)
    trackAuthEvent('login_failed', {
      level: 'warn',
      context: { status: response.status, latencyMs: Math.round(performance.now() - startedAt) },
    })
    throw new Error(detail)
  }
  const data = await response.json()
  const state = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    user: data.user,
    accessExpiresAt: data.access_expires_at,
    refreshExpiresAt: data.refresh_expires_at,
  }
  saveAuthState(state)
  trackAuthEvent('login_succeeded', {
    context: { userId: state.user?.id, latencyMs: Math.round(performance.now() - startedAt) },
  })
  return state
}

export const logout = async (apiBaseUrl) => {
  const state = loadAuthState()
  const refreshToken = state?.refreshToken
  if (!refreshToken) {
    clearAuthState()
    return
  }
  try {
    await fetch(`${apiBaseUrl}/auth/logout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
  } catch {
    // Best effort logout. Local auth is still cleared.
  } finally {
    clearAuthState()
    if (typeof sessionStorage !== 'undefined') sessionStorage.clear()
  }
}

export const refreshAuth = async (apiBaseUrl) => {
  const startedAt = performance.now()
  const state = loadAuthState()
  if (!state?.refreshToken) {
    trackAuthEvent('refresh_missing_token', { level: 'warn' })
    throw new AuthSessionError('Session expired', 'AUTH_EXPIRED')
  }
  const response = await fetch(`${apiBaseUrl}/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refresh_token: state.refreshToken }),
  })
  if (!response.ok) {
    clearAuthState()
    trackAuthEvent('refresh_failed', {
      level: 'warn',
      context: { status: response.status, latencyMs: Math.round(performance.now() - startedAt) },
    })
    throw new AuthSessionError('Session expired', 'AUTH_EXPIRED')
  }
  const data = await response.json()
  const nextState = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    user: data.user,
    accessExpiresAt: data.access_expires_at,
    refreshExpiresAt: data.refresh_expires_at,
  }
  saveAuthState(nextState)
  trackAuthEvent('refresh_succeeded', {
    context: { userId: nextState.user?.id, latencyMs: Math.round(performance.now() - startedAt) },
  })
  return nextState
}

export const ensureValidAuth = async (apiBaseUrl) => {
  const state = loadAuthState()
  if (!state?.accessToken) throw new AuthSessionError('Authentication required', 'AUTH_REQUIRED')
  if (!isTokenExpiring(state.accessToken)) return state
  return refreshAuth(apiBaseUrl)
}

export const authorizedApiRequest = async (apiBaseUrl, path, options) => {
  const startedAt = performance.now()
  const method = String(options?.method || 'GET').toUpperCase()
  const syncMeta = options?.syncMeta || null
  let authState = await ensureValidAuth(apiBaseUrl)
  const headers = { 'content-type': 'application/json', ...(options?.headers || {}) }
  headers.Authorization = `Bearer ${authState.accessToken}`
  headers['x-request-id'] = headers['x-request-id'] || createRequestId(syncMeta)
  headers['x-client-request-source'] = headers['x-client-request-source'] || (syncMeta ? 'offline-sync' : 'frontend')
  if (syncMeta?.operationType) headers['x-sync-operation'] = syncMeta.operationType
  if (syncMeta?.operationId) headers['x-sync-operation-id'] = syncMeta.operationId
  if (syncMeta?.fingerprint) headers['x-sync-fingerprint'] = syncMeta.fingerprint
  if (syncMeta?.replayToken) headers['x-sync-replay-token'] = syncMeta.replayToken
  let authRetry = false
  let response
  try {
    response = await fetch(`${apiBaseUrl}${path}`, { ...options, headers })
  } catch (error) {
    trackApiRequest({
      event: 'api_network_failure',
      level: 'error',
      context: {
        method,
        path,
        latencyMs: Math.round(performance.now() - startedAt),
        online: typeof navigator === 'undefined' ? null : navigator.onLine,
      },
    })
    throw error
  }
  if (response.status === 401) {
    authState = await refreshAuth(apiBaseUrl)
    headers.Authorization = `Bearer ${authState.accessToken}`
    authRetry = true
    response = await fetch(`${apiBaseUrl}${path}`, { ...options, headers })
  }
  if (!response.ok) {
    const detail = await parseErrorDetail(response)
    trackApiRequest({
      event: 'api_request_failed',
      level: response.status >= 500 ? 'error' : 'warn',
      context: {
        method,
        path,
        status: response.status,
        authRetry,
        latencyMs: Math.round(performance.now() - startedAt),
      },
    })
    if (response.status === 401 || response.status === 403) {
      throw new AuthSessionError(detail, response.status === 401 ? 'AUTH_EXPIRED' : 'AUTH_FORBIDDEN', response.status)
    }
    const error = new Error(detail)
    error.status = response.status
    throw error
  }
  trackApiRequest({
    event: 'api_request_succeeded',
    context: {
      method,
      path,
      status: response.status,
      authRetry,
      latencyMs: Math.round(performance.now() - startedAt),
    },
  })
  if (response.status === 204) return null
  return response.json()
}

export const currentAuthUser = () => loadAuthState()?.user || null
