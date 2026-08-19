import { useCallback, useRef, useState } from 'react'

export default function useModal(initialState = { open: false }) {
  const [state, setState] = useState(initialState)
  const initialRef = useRef(initialState)
  const open = useCallback((data) => setState({ open: true, ...data }), [])
  const close = useCallback(() => setState(initialRef.current), [])
  const toggle = useCallback(() => setState((prev) => ({ ...prev, open: !prev.open })), [])
  return [state, { open, close, toggle, setState }]
}
