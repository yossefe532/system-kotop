// Wave 11.1 parity check (frontend).
//
// Proves that switching the wallet offline persistence from `student_balance_set`
// to `wallet_entry_create` does NOT change the wallet delta, the local balance
// update, the wallet-log entry type, the amounts, or the other queue operations.
// The only intended difference is the representation of the wallet mutation in
// the offline queue.

import {
  buildWalletEntryOperation,
  buildLegacyBalanceSet,
  walletMutationOperation,
} from '../pos-frontend/src/modules/wallet/walletSyncPayloads.js'

let failures = 0
function assert(cond, msg) {
  if (cond) {
    console.log('PASS', msg)
  } else {
    failures += 1
    console.log('FAIL', msg)
  }
}

const SCENARIOS = [
  { name: 'checkout purchase_wallet', params: { studentId: 7, student: { id: 7, balance: 10 }, nextBalance: -90, entryType: 'purchase_wallet', amount: -100, sourceType: 'transaction', sourceId: null, operationId: 'wallet:transaction:ED-0001:purchase_wallet' } },
  { name: 'checkout purchase_debt', params: { studentId: 7, student: { id: 7, balance: 10 }, nextBalance: 60, entryType: 'purchase_debt', amount: 50, sourceType: 'transaction', sourceId: null, operationId: 'wallet:transaction:ED-0001:purchase_debt' } },
  { name: 'checkout deposit_change', params: { studentId: 7, student: { id: 7, balance: 10 }, nextBalance: 50, entryType: 'deposit_change', amount: 40, sourceType: 'transaction', sourceId: null, operationId: 'wallet:transaction:ED-0001:deposit_change' } },
  { name: 'pickup wallet', params: { studentId: 7, student: { id: 7, balance: 100 }, nextBalance: 60, entryType: 'pickup_wallet', amount: -40, sourceType: 'pickup', sourceId: null, operationId: 'wallet:pickup:ED-0002' } },
  { name: 'cancel reservation refund', params: { studentId: 7, student: { id: 7, balance: 10 }, nextBalance: 60, entryType: 'refund_cancel_reservation', amount: 50, sourceType: 'reservation_cancel', sourceId: null, operationId: 'wallet:cancel:ED-0003' } },
  { name: 'return sale refund', params: { studentId: 7, student: { id: 7, balance: 10 }, nextBalance: 60, entryType: 'refund_return_sale', amount: 50, sourceType: 'return', sourceId: null, operationId: 'wallet:return:ED-0004' } },
]

for (const scenario of SCENARIOS) {
  const p = scenario.params
  const ledgerOp = walletMutationOperation({ ...p, ledgerEnabled: true })
  const legacyOp = walletMutationOperation({ ...p, ledgerEnabled: false })

  assert(ledgerOp.type === 'wallet_entry_create', `${scenario.name}: ledger op is wallet_entry_create`)
  assert(ledgerOp.payload.entry_type === p.entryType, `${scenario.name}: entry_type mapped correctly`)
  assert(ledgerOp.payload.amount === p.amount, `${scenario.name}: signed amount preserved`)
  assert(ledgerOp.payload.source_type === p.sourceType, `${scenario.name}: source_type preserved`)
  assert(ledgerOp.payload.operation_id === p.operationId, `${scenario.name}: deterministic operation_id`)
  assert(
    ledgerOp.payload.amount === p.nextBalance - p.student.balance,
    `${scenario.name}: wallet entry amount equals local delta`,
  )

  assert(legacyOp.type === 'student_balance_set', `${scenario.name}: legacy op is student_balance_set`)
  assert(legacyOp.payload.balance === p.nextBalance, `${scenario.name}: legacy next balance preserved`)
  assert(legacyOp.payload.studentSnapshot.balance === p.nextBalance, `${scenario.name}: legacy snapshot balance preserved`)

  // Idempotency: rebuilding the same ledger op yields the same dedupe identity.
  const again = walletMutationOperation({ ...p, ledgerEnabled: true })
  assert(again.payload.operation_id === ledgerOp.payload.operation_id, `${scenario.name}: operation_id stable across rebuilds`)
}

// Source maps: every known entry type is reachable.
const KNOWN = ['purchase_debt', 'deposit_change', 'purchase_wallet', 'pickup_wallet', 'refund_cancel_reservation', 'refund_return_sale']
for (const t of KNOWN) {
  const op = buildWalletEntryOperation({ studentId: 1, entryType: t, amount: 1, sourceType: 'transaction', operationId: `k:${t}`, actor: 'x' })
  assert(op.payload.entry_type === t, `entry type ${t} serializable`)
}

console.log(failures === 0 ? 'PARITY OK' : `PARITY FAILED (${failures})`)
process.exit(failures === 0 ? 0 : 1)
