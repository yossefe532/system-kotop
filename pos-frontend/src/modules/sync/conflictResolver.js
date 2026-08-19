export const classifyReplayError = ({ error, isAuthError }) => {
  if (isAuthError?.(error)) return { action: 'auth_expired', retryable: false }
  const status = Number(error?.status || error?.statusCode || 0)
  if ([409, 422].includes(status)) return { action: 'quarantine', retryable: false, category: 'conflict' }
  if ([408, 425, 429].includes(status)) return { action: 'retry', retryable: true, category: 'transient' }
  if (status >= 400 && status < 500) return { action: 'drop', retryable: false, category: 'permanent' }
  if (status >= 500) return { action: 'retry', retryable: true, category: 'server' }
  return { action: 'retry', retryable: true, category: 'network' }
}
