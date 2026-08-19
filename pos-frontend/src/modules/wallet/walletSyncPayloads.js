// Pure helpers that build the offline-sync queue operations for student wallet
// mutations. They are shared by checkout, pickup, cancellation, return and the
// student-details modal so that the queue payload shape stays consistent and
// testable.
//
// Legacy mode keeps emitting `student_balance_set` (absolute balance override).
// Ledger mode emits `wallet_entry_create` (immutable ledger entry) instead.
// Both modes produce the SAME local balance delta and the SAME wallet log entry,
// so this change only swaps the offline persistence representation.

export function buildWalletEntryOperation({
  studentId,
  entryType,
  amount,
  sourceType,
  sourceId = null,
  operationId,
  actor = null,
  description = null,
}) {
  return {
    type: 'wallet_entry_create',
    payload: {
      studentId,
      entry_type: entryType,
      amount,
      source_type: sourceType,
      source_id: sourceId,
      operation_id: operationId,
      actor,
      metadata: description ? { description } : null,
    },
  }
}

export function buildLegacyBalanceSet({ studentId, nextBalance, student }) {
  return {
    type: 'student_balance_set',
    payload: {
      studentId,
      balance: nextBalance,
      studentSnapshot: { ...student, balance: nextBalance },
    },
  }
}

// Choose the correct offline operation based on the ledger feature flag.
export function walletMutationOperation({
  studentId,
  student,
  nextBalance,
  entryType,
  amount,
  sourceType,
  sourceId = null,
  operationId,
  actor = null,
  description = null,
  ledgerEnabled,
}) {
  if (ledgerEnabled) {
    return buildWalletEntryOperation({
      studentId,
      entryType,
      amount,
      sourceType,
      sourceId,
      operationId,
      actor,
      description,
    })
  }
  return buildLegacyBalanceSet({ studentId, nextBalance, student })
}
