export const LEGACY_STORAGE_KEY = 'educon-pos-state-v1'

export const readStoredSnapshot = () => {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object') return null
    return data
  } catch {
    return null
  }
}