import { describe, it, expect } from 'vitest'
import {
  buildWalletEntryOperation,
  buildLegacyBalanceSet,
  walletMutationOperation,
} from './walletSyncPayloads.js'
import { createQueueOperation } from '../sync/queueManager.js'

describe('wallet ledger sync payloads', () => {
  it('builds wallet_entry_create with signed amount and metadata', () => {
    const op = buildWalletEntryOperation({
      studentId: 7,
      entryType: 'purchase_wallet',
      amount: -100,
      sourceType: 'transaction',
      sourceId: null,
      operationId: 'wallet:transaction:ED-0001:purchase_wallet',
      actor: 'youssef',
      description: 'desc',
    })
    expect(op.type).toBe('wallet_entry_create')
    expect(op.payload).toMatchObject({
      studentId: 7,
      entry_type: 'purchase_wallet',
      amount: -100,
      source_type: 'transaction',
      operation_id: 'wallet:transaction:ED-0001:purchase_wallet',
      actor: 'youssef',
    })
    expect(op.payload.metadata).toEqual({ description: 'desc' })
  })

  it('walletMutationOperation selects ledger vs legacy by flag', () => {
    const base = {
      studentId: 7,
      student: { id: 7, balance: 10 },
      nextBalance: 0,
      entryType: 'pickup_wallet',
      amount: -10,
      sourceType: 'pickup',
      sourceId: null,
      operationId: 'wallet:pickup:ED-0002',
      actor: 'youssef',
      description: 'd',
    }
    const ledger = walletMutationOperation({ ...base, ledgerEnabled: true })
    expect(ledger.type).toBe('wallet_entry_create')
    expect(ledger.payload.entry_type).toBe('pickup_wallet')
    expect(ledger.payload.amount).toBe(-10)

    const legacy = walletMutationOperation({ ...base, ledgerEnabled: false })
    expect(legacy.type).toBe('student_balance_set')
    expect(legacy.payload.balance).toBe(0)
    expect(legacy.payload.studentSnapshot.balance).toBe(0)
  })

  it('legacy balance set keeps the full student snapshot', () => {
    const op = buildLegacyBalanceSet({ studentId: 7, nextBalance: 5, student: { id: 7, name: 'Sam', balance: 10 } })
    expect(op.type).toBe('student_balance_set')
    expect(op.payload).toEqual({
      studentId: 7,
      balance: 5,
      studentSnapshot: { id: 7, name: 'Sam', balance: 5 },
    })
  })

  it('queue assigns medium priority, operation_id dedupe key, and student_upsert dependency', () => {
    const student = createQueueOperation({ type: 'student_upsert', mode: 'add', localId: 7 })
    const op = createQueueOperation(
      {
        type: 'wallet_entry_create',
        payload: {
          studentId: 7,
          entry_type: 'pickup_wallet',
          amount: -10,
          source_type: 'pickup',
          source_id: null,
          operation_id: 'wallet:pickup:ED-0002',
        },
      },
      [student],
    )
    expect(op.priority).toBe('medium')
    expect(op.dedupeKey).toBe('wallet_entry_create:wallet:pickup:ED-0002')
    expect(op.dependencies).toContain(student.id)
  })
})
