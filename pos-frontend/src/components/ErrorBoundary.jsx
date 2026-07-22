import React from 'react'
import { trackUiError } from '../services/observabilityClient'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    trackUiError('ui_render_crash', {
      context: {
        message: error?.message || 'Unknown UI error',
        componentStack: errorInfo?.componentStack || '',
      },
    })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6 text-center">
          <div className="max-w-md rounded-3xl bg-white p-6 shadow">
            <h1 className="text-xl font-bold text-slate-900">Something went wrong</h1>
            <p className="mt-3 text-sm text-slate-600">
              The error was captured for diagnostics. Please refresh the page.
            </p>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default ErrorBoundary
