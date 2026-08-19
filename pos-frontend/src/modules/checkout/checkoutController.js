// Checkout orchestration controller (Wave 10.1).
//
// Extracted from App.jsx handleCompleteSale. This controller coordinates
// checkout side effects but owns NO state. App.jsx remains the sole owner of
// React state; the controller receives state via a getter and applies changes
// via injected setters.
//
// Pure business logic lives in ./checkoutService.js and is reused here verbatim.
// No business rules are reimplemented in this file.

import {
  buildSaleEntry,
  buildReservationRecords,
  buildServerReservationPayloads,
  buildServerTransactionPayload,
  buildSyncTransactionPayload,
  computeBalanceAdjustment,
  buildStockDeductionItems,
  computeNextStock,
} from './checkoutService.js'
import { walletMutationOperation } from '../wallet/walletSyncPayloads.js'
import { isWalletLedgerEnabled } from '../../config/featureFlags.js'

export function createCheckoutController({
  // API & sync
  apiRequest,
  enqueueSync,
  // auth
  isAuthError,
  handleSessionExpired,
  // data fetching
  fetchCoreSnapshot,
  // cart
  clearCart,
  // utilities
  formatTransactionId,
  t,
  mapUiStudentToApi,
  mapApiBookToUi,
  mapApiStudentToUi,
  alert,
  // state access (getter avoids stale closures)
  getCheckoutState,
  // React setters
  setters,
}) {
  async function completeSale() {
    const {
      cartDetails,
      selectedStudent,
      quickStudent,
      useBackend,
      transactionCounter,
      selectedStaffId,
      paymentMethod,
      paidAmount,
    } = getCheckoutState()

    if (cartDetails.items.length === 0) return

    let studentForSale = selectedStudent
    if (!studentForSale && quickStudent.name?.trim() && quickStudent.phone?.trim()) {
      if (!useBackend) {
        const newStudent = {
          id: Date.now(),
          name: quickStudent.name.trim(),
          phone: quickStudent.phone.trim(),
          stage: quickStudent.stage || 'first',
          gender: quickStudent.gender || 'male',
          system: quickStudent.system || 'general',
          specialty: quickStudent.specialty || '',
        }
        setters.setStudents((prev) => [...prev, newStudent])
        enqueueSync({
          type: 'student_upsert',
          mode: 'add',
          localId: newStudent.id,
          payload: {
            ...newStudent,
            balance: 0,
          },
        })
        setters.setSelectedStudentId(String(newStudent.id))
        setters.setQuickStudent({ name: '', phone: '', stage: 'first', gender: 'male', system: 'general', specialty: '' })
        studentForSale = newStudent
      } else {
        try {
          const created = await apiRequest('/students', {
            method: 'POST',
            body: JSON.stringify(mapUiStudentToApi({ ...quickStudent, balance: 0 })),
          })
          const ui = mapApiStudentToUi(created)
          setters.setStudents((prev) => [...prev, ui])
          setters.setSelectedStudentId(String(ui.id))
          setters.setQuickStudent({ name: '', phone: '', stage: 'first', gender: 'male', system: 'general', specialty: '' })
          studentForSale = ui
        } catch (error) {
          alert(error?.message || 'فشل تسجيل الطالب')
          return
        }
      }
    }
    if (useBackend && !studentForSale?.id) {
      alert('اختر طالبًا قبل إتمام البيع')
      return
    }
    const transactionId = formatTransactionId(transactionCounter)
    const transactionDate = new Date()
    const saleEntry = buildSaleEntry({
      cartDetails,
      studentForSale,
      selectedStaffId,
      t,
      formatTransactionId,
      transactionCounter,
      paymentMethod,
      now: transactionDate,
    })

    const newReservations = buildReservationRecords({
      items: cartDetails.items,
      transactionId,
      studentId: studentForSale?.id,
      now: transactionDate,
    })

    let committedToServer = false
    if (useBackend) {
      try {
        const reservationPayloads = buildServerReservationPayloads({
          items: cartDetails.items,
          studentId: studentForSale.id,
          staffName: selectedStaffId,
        })
        for (const reservationPayload of reservationPayloads) {
          await apiRequest('/reservations', {
            method: 'POST',
            body: JSON.stringify(reservationPayload),
          })
        }

        const transactionPayload = buildServerTransactionPayload({
          cartDetails,
          studentId: studentForSale.id,
          staffName: selectedStaffId,
        })
        if (transactionPayload.items.length) {
          await apiRequest('/transactions', {
            method: 'POST',
            body: JSON.stringify(transactionPayload),
          })
        }
        committedToServer = true
      } catch (error) {
        if (isAuthError(error)) {
          handleSessionExpired()
          return
        }
        alert((error?.message || 'فشل حفظ العملية على السيرفر') + ' — تم التحويل لوضع أوفلاين وسيتم رفعها عند عودة الاتصال')
        setters.setUseBackend(false)
      }
    }

    setters.setSalesHistory((prev) => [saleEntry, ...prev])
    if (!committedToServer && newReservations.length) {
      setters.setPendingReservations((prev) => [...prev, ...newReservations])
      for (const reservation of newReservations) {
        enqueueSync({
          type: 'reservation_create',
          localReservationId: reservation.id,
          payload: {
            studentId: reservation.studentId,
            bookId: reservation.bookId,
            qty: reservation.qty,
            deposit: reservation.deposit,
            staffName: selectedStaffId,
          },
        })
      }
    }
    setters.setTransactionCounter((prev) => prev + 1)
    setters.setLastTransaction(saleEntry)

    // Handle Flexible Payment (Debt/Wallet)
    const { nextBalance, operations, balanceSync } = computeBalanceAdjustment({
      studentForSale,
      paidAmount,
      totalDue: cartDetails.total,
      paymentMethod,
      transactionId,
    })
    if (studentForSale?.id) {
      for (const op of operations) {
        setters.setStudents(prev => prev.map(s =>
           s.id === studentForSale.id
             ? { ...s, balance: (s.balance || 0) + op.delta }
             : s
        ))
        setters.setWalletLog(prev => [
          { ...op.logEntry, id: Date.now(), date: new Date().toISOString() },
          ...prev,
        ])
      }
      if (!committedToServer && balanceSync) {
        if (isWalletLedgerEnabled) {
          for (const op of operations) {
            enqueueSync(
              walletMutationOperation({
                studentId: studentForSale.id,
                student: studentForSale,
                nextBalance: (studentForSale.balance || 0) + op.delta,
                entryType: op.logEntry.type,
                amount: op.delta,
                sourceType: 'transaction',
                sourceId: null,
                operationId: `wallet:transaction:${transactionId}:${op.logEntry.type}`,
                actor: selectedStaffId,
                description: op.logEntry.description,
                ledgerEnabled: isWalletLedgerEnabled,
              }),
            )
          }
        } else {
          enqueueSync({
            type: 'student_balance_set',
            payload: balanceSync,
          })
        }
      }
    }

    const { linkedReservations, stockDeductItems } = buildStockDeductionItems({ items: cartDetails.items })

    if (!committedToServer && linkedReservations.length > 0) {
       setters.setPendingReservations(prev => prev.filter(r => !linkedReservations.includes(r.id)))
    }

    if (!committedToServer && stockDeductItems.length) {
      setters.setBooks((prev) =>
        prev.map((book) => {
          const item = stockDeductItems.find((i) => i.id === book.id)
          if (!item) return book
          return { ...book, stock: computeNextStock({ book, item }) }
        }),
      )
    }
    if (!committedToServer) {
      const syncTransactionPayload = buildSyncTransactionPayload({
        cartDetails,
        studentId: studentForSale?.id,
        staffName: selectedStaffId,
      })
      if (syncTransactionPayload.items.length > 0) {
        enqueueSync({
          type: 'transaction_create',
          payload: syncTransactionPayload,
        })
      }
    }
    if (useBackend && studentForSale?.id) {
      try {
        if (paidAmount !== '' || paymentMethod === 'wallet') {
          await apiRequest(`/students/${studentForSale.id}`, {
            method: 'PUT',
            body: JSON.stringify(mapUiStudentToApi({ ...studentForSale, balance: nextBalance })),
          })
        }
        const { uiBooks, uiStudents, pending } = await fetchCoreSnapshot({
          apiRequest,
          mapApiBookToUi,
          mapApiStudentToUi,
        })
        setters.setBooks(uiBooks)
        setters.setStudents(uiStudents)
        setters.setPendingReservations(pending)
      } catch (error) {
        alert(error?.message || 'فشل تحديث البيانات من السيرفر')
      }
    }
    clearCart()
    setters.setDiscount(0)
    setters.setPaidAmount('')
    setters.setSelectedStudentId('')
    setters.setQuickStudent({
      name: '',
      phone: '',
      stage: 'first',
      gender: 'male',
      system: 'general',
      specialty: '',
    })
    setters.setSearchTerm('')
    setters.setActiveView('receipt')
  }

  return { completeSale }
}
