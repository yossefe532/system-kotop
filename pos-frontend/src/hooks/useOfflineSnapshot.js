import { useEffect, useRef } from 'react'

export default function useOfflineSnapshot({
  hydrated,
  load,
  apply,
  onHydrated,
  buildSnapshot,
  save,
  deps = [],
}) {
  const loadRef = useRef(load)
  const applyRef = useRef(apply)
  const onHydratedRef = useRef(onHydrated)
  const buildSnapshotRef = useRef(buildSnapshot)
  const saveRef = useRef(save)
  loadRef.current = load
  applyRef.current = apply
  onHydratedRef.current = onHydrated
  buildSnapshotRef.current = buildSnapshot
  saveRef.current = save

  useEffect(() => {
    let cancelled = false
    const hydrate = async () => {
      try {
        const data = await loadRef.current()
        if (cancelled) return
        applyRef.current(data)
      } catch {
        // Fallback to in-memory/local bootstrap if IndexedDB is unavailable.
      } finally {
        if (!cancelled) onHydratedRef.current()
      }
    }
    hydrate()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!hydrated) return
    saveRef.current(buildSnapshotRef.current()).catch(() => {
      // Keep runtime behavior even if persistence fails.
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, ...deps])
}
