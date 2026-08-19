import { DEMO_BOOKS, DEMO_STUDENTS, DEMO_DATA_ENABLED } from '../demoData'

export const logoUrl = 'https://i.postimg.cc/hPWCrLY4/educon_logo_high_quality_png_white.png'

export const initialBooks = DEMO_DATA_ENABLED ? DEMO_BOOKS : []

export const initialStudents = DEMO_DATA_ENABLED ? DEMO_STUDENTS : []

export const staffMembers = [
  { id: 'youssef' },
  { id: 'suad' },
  { id: 'maryam' },
]

export const auditStaffMembers = [
  { id: 'heba' },
  { id: 'maryam' },
]

export const apiBaseUrl = (() => {
  const raw = import.meta.env.VITE_API_BASE_URL
  if (import.meta.env.PROD && !(typeof raw === 'string' && raw.trim())) {
    throw new Error('VITE_API_BASE_URL is required in production')
  }
  if (typeof raw === 'string' && raw.trim()) return raw.trim().replace(/\/+$/, '')
  return 'http://localhost:8000'
})()

// Frontend mirror of the backend WALLET_LEDGER_ENABLED flag.
// MUST be kept in sync with the backend deployment. Defaults to legacy mode
// (student_balance_set) for production safety. Set VITE_WALLET_LEDGER_ENABLED=true
// only when the backend has WALLET_LEDGER_ENABLED=true.
export { isWalletLedgerEnabled } from './featureFlags.js'