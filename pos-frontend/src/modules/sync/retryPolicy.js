export const getRetryCategory = (error) => {
  const status = Number(error?.status || error?.statusCode || 0)
  if (!status) return 'network'
  if ([408, 425, 429].includes(status)) return 'transient'
  if (status >= 500) return 'server'
  if ([409, 422].includes(status)) return 'conflict'
  if (status >= 400 && status < 500) return 'permanent'
  return 'unknown'
}

export const getRetryDelayMs = (retryCount) => {
  const attempt = Math.max(Number(retryCount) || 0, 0)
  const base = 1000
  const cap = 30000
  return Math.min(base * 2 ** attempt, cap)
}

export const withBackoff = async (retryCount) => {
  const delay = getRetryDelayMs(retryCount)
  await new Promise((resolve) => setTimeout(resolve, delay))
}
