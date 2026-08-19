import { useEffect, useRef } from 'react'

export default function useViewData({ view, activeView, enabled, deps = [], loader, onSuccess, onError }) {
  const loaderRef = useRef(loader)
  const onSuccessRef = useRef(onSuccess)
  const onErrorRef = useRef(onError)
  loaderRef.current = loader
  onSuccessRef.current = onSuccess
  onErrorRef.current = onError

  useEffect(() => {
    if (!enabled) return
    if (activeView !== view) return
    let cancelled = false
    const run = async () => {
      try {
        const result = await loaderRef.current()
        if (cancelled) return
        onSuccessRef.current(result)
      } catch (error) {
        if (cancelled) return
        onErrorRef.current(error)
      }
    }
    run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, activeView, enabled, ...deps])
}
