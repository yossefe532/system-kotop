import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReceiptText,
  ScanBarcode,
  Plus,
  Pencil,
  Globe,
  Lock,
  Printer,
  Moon,
  Sun,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import * as XLSX from 'xlsx'
import { validateBookDraft } from './posLogic'
import { isWalletLedgerEnabled } from './config/app'
import { walletMutationOperation } from './modules/wallet/walletSyncPayloads'
import LoginPage from './LoginPage'
import { createApiRequest } from './services/apiClient'
import { hydrateCoreData, fetchBooksInsights, fetchCoreSnapshot } from './modules/catalog/coreDataService'
import {
  createFindServerBookId,
  createFindServerStudentId,
  processSyncQueueOnce,
} from './modules/sync/syncManager'
import { enqueueOperation, persistQueueState } from './modules/sync/queueManager'
import { runReplayCycle } from './modules/sync/replayManager'
import { createReconnectManager } from './modules/sync/reconnectManager'
import {
  clearOfflineStorage,
  loadOfflineBootstrap,
  setIdMappings,
  setOfflineSnapshot,
} from './modules/sync/indexedDb'
import { archiveReceiptPayload, refreshReceiptArchiveItems } from './modules/receipt/receiptArchiveService'
import { createSupplyRecord, refreshAccountingSnapshot } from './modules/accounting/accountingService'
import { createCheckoutController } from './modules/checkout/checkoutController'
import { isStudentDuplicate } from './modules/students/studentService'
import {
  clearAuthState,
  currentAuthUser,
  loadAuthState,
  login,
  logout,
} from './authSession'
import { apiBaseUrl, auditStaffMembers, initialBooks, initialStudents, staffMembers } from './config/app'
import { rolePriority, viewAccessLevel } from './config/access'
import { navItems } from './config/navigation'
import { defaultChannelLink, defaultWhatsappGroupLinks } from './config/whatsapp'
import { cartKey, getDefaultReservationDeposit } from './lib/cart'
import { isAuthError } from './lib/errors'
import { formatCurrency, formatPhoneForWhatsApp } from './lib/format'
import {
  mapApiBookToUi,
  mapApiStudentToUi,
  mapUiBookToApi,
  mapUiStudentToApi,
} from './lib/mappers'
import { buildReceiptText, paymentMethodLabels, receiptTypeLabels } from './lib/receipt'
import { readStoredSnapshot } from './lib/storage'
import Modal from './components/ui/Modal'
import ModalHeader from './components/ui/ModalHeader'
import ModalActions from './components/ui/ModalActions'
import InputField from './components/ui/InputField'
import SelectField from './components/ui/SelectField'
import MetricBar from './components/ui/MetricBar'
import ThermalReceipt from './components/ui/ThermalReceipt'
import BooksView from './features/books/BooksView'
import BooksInsightsView from './features/books/BooksInsightsView'
import StudentsView from './features/students/StudentsView'
import ReportsView from './features/reports/ReportsView'
import EmergencyView from './features/emergency/EmergencyView'
import AdminView from './features/admin/AdminView'
import AccountingView from './features/accounting/AccountingView'
import ReceiptArchiveView from './features/receipts/ReceiptArchiveView'
import InventoryAuditView from './features/inventory/InventoryAuditView'
import POSView from './features/pos/POSView'
import ReservationsView from './features/reservations/ReservationsView'
import PickupReservationContent from './features/reservations/PickupReservationContent'
import CancelReservationContent from './features/reservations/CancelReservationContent'
import LegacyReservationModal from './features/reservations/LegacyReservationModal'
import ReturnsView from './features/returns/ReturnsView'
import ReturnSaleContent from './features/returns/ReturnSaleContent'
import useModal from './hooks/useModal'
import useViewData from './hooks/useViewData'
import useOfflineSnapshot from './hooks/useOfflineSnapshot'
import useStudentSearch from './hooks/useStudentSearch'
import useCart from './hooks/useCart'


function App() {
  const { t, i18n } = useTranslation()
  const storedSnapshot = useMemo(() => readStoredSnapshot(), [])
  const [authState, setAuthState] = useState(() => loadAuthState())
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  const authUser = authState?.user || currentAuthUser()
  const activeRole = authUser?.roles?.[0] || 'viewer'

  const canAccessView = useCallback(
    (viewId) => {
      const minimum = viewAccessLevel[viewId] || 'viewer'
      return (rolePriority[activeRole] || 0) >= (rolePriority[minimum] || 0)
    },
    [activeRole],
  )

  const [useBackend, setUseBackend] = useState(() =>
    typeof storedSnapshot?.useBackend === 'boolean' ? storedSnapshot.useBackend : true,
  )
  const [activeView, setActiveView] = useState(() =>
    typeof storedSnapshot?.activeView === 'string' ? storedSnapshot.activeView : 'pos',
  )
  const [books, setBooks] = useState(() =>
    Array.isArray(storedSnapshot?.books) ? storedSnapshot.books : initialBooks,
  )
  const [students, setStudents] = useState(() =>
    Array.isArray(storedSnapshot?.students) ? storedSnapshot.students : initialStudents,
  )
  const initialCartItems = useMemo(() => {
    if (!Array.isArray(storedSnapshot?.cartItems)) return []
    const raw = storedSnapshot.cartItems
    if (raw.length === 0) return []
    if (raw.every((item) => item && typeof item === 'object' && typeof item.key === 'string')) return raw
    return raw
      .map((item) => {
        if (!item || typeof item !== 'object') return null
        const bookId = item.bookId ?? item.id
        if (typeof bookId !== 'number') return null
        const type = item.type === 'reservation' ? 'reservation' : 'sale'
        return {
          key: cartKey(bookId, type),
          bookId,
          qty: Number(item.qty) || 1,
          type,
          deposit: Number(item.deposit) || 0,
          linkedReservation: item.linkedReservation || null,
        }
      })
      .filter(Boolean)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [searchTerm, setSearchTerm] = useState(() =>
    typeof storedSnapshot?.searchTerm === 'string' ? storedSnapshot.searchTerm : '',
  )
  const [studentPickerSearch, setStudentPickerSearch] = useState('')
  const [selectedStudentId, setSelectedStudentId] = useState(() =>
    typeof storedSnapshot?.selectedStudentId === 'string' ? storedSnapshot.selectedStudentId : '',
  )
  const [discount, setDiscount] = useState(() =>
    typeof storedSnapshot?.discount === 'number' ? storedSnapshot.discount : 0,
  )
  const {
    cartItems,
    setCartItems,
    cartDetails,
    reservationOutstandingTotal,
    addCartLine,
    updateCartQty,
    updateCartType,
    updateCartDeposit,
    clearCart,
  } = useCart({ books, discount, initialCartItems })
  const [bookModal, bookModalHelpers] = useModal({ open: false, mode: 'add', data: null })
  const [studentModal, studentModalHelpers] = useModal({ open: false, mode: 'add', data: null })
  const [barcodeModal, barcodeModalHelpers] = useModal({ open: false, book: null })
  const [selectedStaffId, setSelectedStaffId] = useState(() =>
    typeof storedSnapshot?.selectedStaffId === 'string' ? storedSnapshot.selectedStaffId : 'youssef',
  )
  const [pendingReservations, setPendingReservations] = useState(() =>
    Array.isArray(storedSnapshot?.pendingReservations) ? storedSnapshot.pendingReservations : [],
  )
  const [salesHistory, setSalesHistory] = useState(() =>
    Array.isArray(storedSnapshot?.salesHistory) ? storedSnapshot.salesHistory : [],
  )
  const [withdrawals, setWithdrawals] = useState(() =>
    Array.isArray(storedSnapshot?.withdrawals) ? storedSnapshot.withdrawals : [],
  )
  const [auditLog, setAuditLog] = useState(() =>
    Array.isArray(storedSnapshot?.auditLog) ? storedSnapshot.auditLog : [],
  )
  const [adminUnlocked, setAdminUnlocked] = useState(() =>
    typeof storedSnapshot?.adminUnlocked === 'boolean' ? storedSnapshot.adminUnlocked : false,
  )
  const [adminPassword, setAdminPassword] = useState('')
  const [transactionCounter, setTransactionCounter] = useState(() =>
    typeof storedSnapshot?.transactionCounter === 'number' ? storedSnapshot.transactionCounter : 1,
  )
  const [lastTransaction, setLastTransaction] = useState(() => storedSnapshot?.lastTransaction ?? null)
  const [quickStudent, setQuickStudent] = useState(() =>
    storedSnapshot?.quickStudent && typeof storedSnapshot.quickStudent === 'object'
      ? storedSnapshot.quickStudent
      : {
          name: '',
          phone: '',
          stage: 'first',
          gender: 'male',
          system: 'general',
          specialty: '',
        },
  )
  const [emergencyForm, setEmergencyForm] = useState(() =>
    storedSnapshot?.emergencyForm && typeof storedSnapshot.emergencyForm === 'object'
      ? storedSnapshot.emergencyForm
      : { amount: '', reason: '', staffId: '' },
  )
  const [auditStaffId, setAuditStaffId] = useState(() =>
    typeof storedSnapshot?.auditStaffId === 'string' ? storedSnapshot.auditStaffId : 'heba',
  )
  const [cancelledReservations, setCancelledReservations] = useState(() =>
    Array.isArray(storedSnapshot?.cancelledReservations) ? storedSnapshot.cancelledReservations : [],
  )
  const [isDarkMode, setIsDarkMode] = useState(() =>
    typeof storedSnapshot?.isDarkMode === 'boolean' ? storedSnapshot.isDarkMode : false,
  )
  const [followsUs, setFollowsUs] = useState(() =>
    typeof storedSnapshot?.followsUs === 'boolean' ? storedSnapshot.followsUs : false,
  )
  const [adminCustomFooter, setAdminCustomFooter] = useState(() =>
    typeof storedSnapshot?.adminCustomFooter === 'string' ? storedSnapshot.adminCustomFooter : '',
  )
  const [adminWhatsappLinks, _setAdminWhatsappLinks] = useState(() =>
    storedSnapshot?.adminWhatsappLinks ?? null,
  )
  const [adminChannelLink, _setAdminChannelLink] = useState(() =>
    storedSnapshot?.adminChannelLink ?? null,
  )
  const [pickupSearch, setPickupSearch] = useState('')
  const [cancelSearch, setCancelSearch] = useState('')
  const [paymentMethod, setPaymentMethod] = useState(() =>
    typeof storedSnapshot?.paymentMethod === 'string' ? storedSnapshot.paymentMethod : 'cash',
  )
  const [auditActualCash, setAuditActualCash] = useState(() =>
    typeof storedSnapshot?.auditActualCash === 'string' ? storedSnapshot.auditActualCash : '',
  )
  const [legacyReservationModal, legacyReservationModalHelpers] = useModal({ open: false })
  const [studentDetailsModal, studentDetailsModalHelpers] = useModal({ open: false, student: null })
  const [paidAmount, setPaidAmount] = useState('')
  const [walletLog, setWalletLog] = useState(() =>
    Array.isArray(storedSnapshot?.walletLog) ? storedSnapshot.walletLog : [],
  )
  const [receiptArchiveItems, setReceiptArchiveItems] = useState([])
  const [booksInsightsRows, setBooksInsightsRows] = useState([])
  const [financeReport, setFinanceReport] = useState(null)
  const [supplies, setSupplies] = useState([])
  const [supplyForm, setSupplyForm] = useState({ bookId: '', qty: '1', unitCost: '', paid: '', supplier: '' })
  const [syncQueue, setSyncQueue] = useState([])
  const [syncMap, setSyncMap] = useState({ students: {}, books: {}, reservations: {} })
  const [offlineHydrated, setOfflineHydrated] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const syncInFlightRef = useRef(false)
  const inputRef = useRef(null)

  const whatsappGroupLinks = adminWhatsappLinks || defaultWhatsappGroupLinks
  const channelLink = adminChannelLink || defaultChannelLink

  const isRtl = i18n.language === 'ar'
  const locale = isRtl ? 'ar-EG' : 'en-US'
  const apiRequest = useMemo(() => createApiRequest(apiBaseUrl), [])

  useOfflineSnapshot({
    hydrated: offlineHydrated,
    load: loadOfflineBootstrap,
    apply: ({ snapshot, queue, mappings, receiptArchive }) => {
      if (snapshot && typeof snapshot === 'object') {
        if (typeof snapshot.useBackend === 'boolean') setUseBackend(snapshot.useBackend)
        if (typeof snapshot.activeView === 'string') setActiveView(snapshot.activeView)
        if (Array.isArray(snapshot.books)) setBooks(snapshot.books)
        if (Array.isArray(snapshot.students)) setStudents(snapshot.students)
        if (Array.isArray(snapshot.cartItems)) setCartItems(snapshot.cartItems)
        if (typeof snapshot.searchTerm === 'string') setSearchTerm(snapshot.searchTerm)
        if (typeof snapshot.selectedStudentId === 'string') setSelectedStudentId(snapshot.selectedStudentId)
        if (typeof snapshot.discount === 'number') setDiscount(snapshot.discount)
        if (Array.isArray(snapshot.pendingReservations)) setPendingReservations(snapshot.pendingReservations)
        if (Array.isArray(snapshot.salesHistory)) setSalesHistory(snapshot.salesHistory)
        if (Array.isArray(snapshot.withdrawals)) setWithdrawals(snapshot.withdrawals)
        if (Array.isArray(snapshot.auditLog)) setAuditLog(snapshot.auditLog)
        if (typeof snapshot.adminUnlocked === 'boolean') setAdminUnlocked(snapshot.adminUnlocked)
        if (typeof snapshot.transactionCounter === 'number') setTransactionCounter(snapshot.transactionCounter)
        if (snapshot.lastTransaction !== undefined) setLastTransaction(snapshot.lastTransaction)
        if (snapshot.quickStudent && typeof snapshot.quickStudent === 'object') setQuickStudent(snapshot.quickStudent)
        if (snapshot.emergencyForm && typeof snapshot.emergencyForm === 'object') setEmergencyForm(snapshot.emergencyForm)
        if (typeof snapshot.auditStaffId === 'string') setAuditStaffId(snapshot.auditStaffId)
        if (Array.isArray(snapshot.cancelledReservations)) setCancelledReservations(snapshot.cancelledReservations)
        if (typeof snapshot.selectedStaffId === 'string') setSelectedStaffId(snapshot.selectedStaffId)
        if (typeof snapshot.isDarkMode === 'boolean') setIsDarkMode(snapshot.isDarkMode)
        if (typeof snapshot.followsUs === 'boolean') setFollowsUs(snapshot.followsUs)
        if (typeof snapshot.adminCustomFooter === 'string') setAdminCustomFooter(snapshot.adminCustomFooter)
        if (snapshot.adminWhatsappLinks !== undefined) _setAdminWhatsappLinks(snapshot.adminWhatsappLinks)
        if (snapshot.adminChannelLink !== undefined) _setAdminChannelLink(snapshot.adminChannelLink)
        if (typeof snapshot.paymentMethod === 'string') setPaymentMethod(snapshot.paymentMethod)
        if (typeof snapshot.auditActualCash === 'string') setAuditActualCash(snapshot.auditActualCash)
        if (Array.isArray(snapshot.walletLog)) setWalletLog(snapshot.walletLog)
      }
      setSyncQueue(Array.isArray(queue) ? queue : [])
      setSyncMap(mappings && typeof mappings === 'object' ? mappings : { students: {}, books: {}, reservations: {} })
      setReceiptArchiveItems(Array.isArray(receiptArchive) ? receiptArchive : [])
    },
    onHydrated: () => setOfflineHydrated(true),
    buildSnapshot: () =>
      useBackend
        ? {
            useBackend,
            activeView,
            selectedStaffId,
            isDarkMode,
            followsUs,
            adminCustomFooter,
            adminWhatsappLinks,
            adminChannelLink,
            paymentMethod,
            auditActualCash,
          }
        : {
            useBackend,
            activeView,
            books,
            students,
            cartItems,
            searchTerm,
            selectedStudentId,
            discount,
            pendingReservations,
            salesHistory,
            withdrawals,
            auditLog,
            adminUnlocked,
            transactionCounter,
            lastTransaction,
            quickStudent,
            emergencyForm,
            auditStaffId,
            cancelledReservations,
            selectedStaffId,
            isDarkMode,
            followsUs,
            adminCustomFooter,
            adminWhatsappLinks,
            adminChannelLink,
            paymentMethod,
            auditActualCash,
            walletLog,
          },
    save: (snapshot) => setOfflineSnapshot('app_state', snapshot),
    deps: [
      useBackend,
      activeView,
      books,
      students,
      cartItems,
      searchTerm,
      selectedStudentId,
      discount,
      pendingReservations,
      salesHistory,
      withdrawals,
      auditLog,
      adminUnlocked,
      transactionCounter,
      lastTransaction,
      quickStudent,
      emergencyForm,
      auditStaffId,
      cancelledReservations,
      selectedStaffId,
      isDarkMode,
      followsUs,
      adminCustomFooter,
      adminWhatsappLinks,
      adminChannelLink,
      paymentMethod,
      auditActualCash,
      walletLog,
    ],
  })

  const handleSessionExpired = useCallback(() => {
    clearAuthState()
    clearOfflineStorage().catch(() => {})
    setAuthState(null)
    setAuthError('Your session has expired. Please sign in again.')
  }, [])

  const handleLogin = useCallback(async ({ username, password }) => {
    setAuthLoading(true)
    setAuthError('')
    try {
      const next = await login(apiBaseUrl, username, password)
      setAuthState(next)
    } catch (error) {
      setAuthError(error?.message || 'Login failed')
    } finally {
      setAuthLoading(false)
    }
  }, [])

  const handleLogout = useCallback(async () => {
    await logout(apiBaseUrl)
    clearOfflineStorage().catch(() => {})
    setAuthState(null)
  }, [])

  const availableNavItems = useMemo(() => {
    return navItems.filter((item) => canAccessView(item.id)).filter((item) => item.id !== 'receipt' || lastTransaction)
  }, [canAccessView, lastTransaction])

  useEffect(() => {
    if (!availableNavItems.some((item) => item.id === activeView)) {
      const fallback = availableNavItems[0]?.id || 'pos'
      setActiveView(fallback)
    }
  }, [activeView, availableNavItems])

  useEffect(() => {
    document.body.setAttribute('dir', isRtl ? 'rtl' : 'ltr')
  }, [isRtl])

  useEffect(() => {
    if (!offlineHydrated) return
    persistQueueState(syncQueue).catch(() => {})
  }, [syncQueue, offlineHydrated])

  useEffect(() => {
    if (!offlineHydrated) return
    setIdMappings(syncMap).catch(() => {})
  }, [syncMap, offlineHydrated])

  useEffect(() => {
    if (!offlineHydrated) return
    setOfflineSnapshot('receipt_archive', receiptArchiveItems).catch(() => {})
  }, [receiptArchiveItems, offlineHydrated])

  const enqueueSync = useCallback((operation) => {
    enqueueOperation({ setSyncQueue, operation }).catch(() => {})
  }, [])

  const findServerStudentId = useMemo(
    () =>
      createFindServerStudentId({
        syncMap,
        students,
        setSyncMap,
        apiRequest,
        mapUiStudentToApi,
      }),
    [syncMap, students, setSyncMap, apiRequest],
  )

  const findServerBookId = useMemo(
    () =>
      createFindServerBookId({
        syncMap,
        books,
        setSyncMap,
        apiRequest,
        mapUiBookToApi,
      }),
    [syncMap, books, setSyncMap, apiRequest],
  )

  const processSyncQueue = useCallback(async () => {
    await runReplayCycle({
      queueSnapshot: syncQueue,
      setQueueState: setSyncQueue,
      isAuthError,
      onAuthExpired: handleSessionExpired,
      runReplay: async () => {
        await processSyncQueueOnce({
          authUser,
          useBackend,
          syncInFlightRef,
          setIsSyncing,
          syncQueue,
          setSyncQueue,
          apiRequest,
          findServerBookId,
          findServerStudentId,
          syncMapReservations: syncMap.reservations,
          setSyncMap,
          mapUiBookToApi,
          mapUiStudentToApi,
          isAuthError,
          handleSessionExpired,
        })
      },
    })
  }, [authUser, useBackend, syncQueue, apiRequest, findServerBookId, findServerStudentId, syncMap.reservations, handleSessionExpired])

  useEffect(() => {
    if (!offlineHydrated || !authUser || !useBackend || syncQueue.length === 0) return
    processSyncQueue()
  }, [offlineHydrated, authUser, useBackend, syncQueue, processSyncQueue])

  useEffect(() => {
    if (!offlineHydrated) return
    const manager = createReconnectManager({
      onReconnect: async () => {
        if (!authUser || !useBackend || syncQueue.length === 0) return
        await processSyncQueue()
      },
    })
    return manager.start()
  }, [offlineHydrated, authUser, useBackend, syncQueue.length, processSyncQueue])

  useEffect(() => {
    if (!authUser) return
    if (useBackend) return
    let mounted = true
    let timer = null
    const probe = async () => {
      try {
        await apiRequest('/books')
        if (!mounted) return
        setUseBackend(true)
      } catch (error) {
        void error
        if (!mounted) return
        timer = setTimeout(probe, 5000)
      }
    }
    probe()
    return () => {
      mounted = false
      if (timer) clearTimeout(timer)
    }
  }, [authUser, useBackend])

  useEffect(() => {
    if (!authUser) return
    if (!useBackend) return
    let cancelled = false
    const run = async () => {
      try {
        const { uiBooks, uiStudents, pending } = await hydrateCoreData({
          apiRequest,
          storedBooks: storedSnapshot?.books,
          storedStudents: storedSnapshot?.students,
          mapUiBookToApi,
          mapUiStudentToApi,
          mapApiBookToUi,
          mapApiStudentToUi,
        })

        if (cancelled) return
        setBooks(uiBooks)
        setStudents(uiStudents)
        setPendingReservations(pending)
        setSelectedStudentId((prev) => (uiStudents.some((s) => String(s.id) === String(prev)) ? prev : ''))
      } catch (error) {
        if (cancelled) return
        if (isAuthError(error)) {
          handleSessionExpired()
          return
        }
        setUseBackend(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [authUser, useBackend, storedSnapshot, handleSessionExpired, apiRequest])

  useEffect(() => {
    if (isDarkMode) document.documentElement.classList.add('dark')
    else document.documentElement.classList.remove('dark')
  }, [isDarkMode])

  useEffect(() => {
    if (activeView === 'pos' && inputRef.current) {
      inputRef.current.focus()
    }
  }, [activeView])

  useViewData({
    view: 'receiptArchive',
    activeView,
    enabled: Boolean(authUser && useBackend),
    deps: [authUser, useBackend, apiRequest],
    loader: () => refreshReceiptArchiveItems(apiRequest),
    onSuccess: (data) => setReceiptArchiveItems(data),
    onError: () => setReceiptArchiveItems([]),
  })

  useViewData({
    view: 'booksInsights',
    activeView,
    enabled: Boolean(authUser && useBackend),
    deps: [authUser, useBackend, books, apiRequest],
    loader: () => fetchBooksInsights(apiRequest, books),
    onSuccess: (merged) => setBooksInsightsRows(merged),
    onError: () => setBooksInsightsRows([]),
  })

  useViewData({
    view: 'accounting',
    activeView,
    enabled: Boolean(authUser && useBackend),
    deps: [authUser, useBackend, apiRequest],
    loader: () => refreshAccountingSnapshot(apiRequest),
    onSuccess: ({ finance, supplies: suppliesList }) => {
      setFinanceReport(finance)
      setSupplies(suppliesList)
    },
    onError: () => {
      setFinanceReport(null)
      setSupplies([])
    },
  })

  const stageOptions = [
    { value: 'first', label: t('stages.first') },
    { value: 'second', label: t('stages.second') },
    { value: 'third', label: t('stages.third') },
  ]

  const genderOptions = [
    { value: 'male', label: t('gender.male') },
    { value: 'female', label: t('gender.female') },
  ]

  const systemOptions = [
    { value: 'general', label: t('system.general') },
    { value: 'azhar', label: t('system.azhar') },
  ]

  const filteredBooks = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) return books
    if (term.match(/^ed-?\d+$/i)) return books
    return books.filter(
      (book) =>
        book.title.toLowerCase().includes(term) ||
        book.author.toLowerCase().includes(term) ||
        book.barcode.includes(term)
    )
  }, [books, searchTerm])

  const { filteredStudents: studentAutocomplete } = useStudentSearch({
    students,
    query: quickStudent.name,
    options: { minQueryLength: 2, bidirectional: true, matchPhone: false, mode: 'find' },
  })

  const selectedStudent = students.find((student) => student.id === Number(selectedStudentId))
  const { filteredStudents: filteredStudentsForPicker } = useStudentSearch({
    students,
    query: studentPickerSearch,
    options: { emptyResult: 'none', minPhoneDigits: 3, limit: 12 },
  })
  const pendingReservationMap = useMemo(() => {
    return pendingReservations.reduce((acc, item) => {
      acc[`${item.studentId}-${item.bookId}`] = item
      return acc
    }, {})
  }, [pendingReservations])

  const hasPendingReservation = (studentId, bookId) =>
    Boolean(pendingReservationMap[`${studentId}-${bookId}`])

  const addToCart = (book) => {
    if (selectedStudent && hasPendingReservation(selectedStudent.id, book.id)) {
      const res = pendingReservationMap[`${selectedStudent.id}-${book.id}`]
      if (res && !book.isArriving) {
        addCartLine(book.id, 'sale', { deposit: res.deposit || 0, linkedReservation: res })
        return
      }
    }

    const type = book.isArriving ? 'reservation' : 'sale'
    addCartLine(book.id, type, { deposit: type === 'reservation' ? getDefaultReservationDeposit(book) : 0, isZeroReservation: false })
  }

  const formatTransactionId = (n) => `ED-${String(n).padStart(4, '0')}`

  const handleScanKey = (event) => {
    if (event.key !== 'Enter') return
    const value = searchTerm.trim()
    if (!value) return
    const match = books.find((book) => book.barcode === value)
    if (match) {
      addToCart(match)
      setSearchTerm('')
      return
    }
    const txMatch = value.toUpperCase().match(/^ED-?(\d+)$/i)
    if (txMatch) {
      const txNum = parseInt(txMatch[1], 10)
      const sale = salesHistory.find((s) => s.id === formatTransactionId(txNum) || s.id === `ED-${txNum}`)
      if (sale?.student) {
        setSelectedStudentId(String(sale.student.id))
        setQuickStudent({
          name: sale.student.name || '',
          phone: sale.student.phone || '',
          stage: sale.student.stage || 'first',
          gender: sale.student.gender || 'male',
          system: sale.student.system || 'general',
          specialty: sale.student.specialty || '',
        })
      }
      setSearchTerm('')
    }
  }

  const toggleLanguage = () => {
    i18n.changeLanguage(isRtl ? 'en' : 'ar')
  }

  const openBookModal = (mode, data = null) => {
    bookModalHelpers.open({ mode, data })
  }

  const openStudentModal = (mode, data = null) => {
    studentModalHelpers.open({ mode, data })
  }

  const saveBook = async (event) => {
    event.preventDefault()
    const formData = new FormData(event.target)
    const title = formData.get('title')?.trim()
    const barcode = formData.get('barcode')?.trim()
    const sellingPrice = Number(formData.get('sellingPrice'))
    const costPrice = Number(formData.get('costPrice'))
    const stock = Number(formData.get('stock'))
    const isArriving = formData.get('isArriving') === 'on'
    const estimatedSellingPriceRaw = formData.get('estimatedSellingPrice')
    const estimatedCostPriceRaw = formData.get('estimatedCostPrice')
    const estimatedSellingPrice = estimatedSellingPriceRaw === '' ? null : Number(estimatedSellingPriceRaw)
    const estimatedCostPrice = estimatedCostPriceRaw === '' ? null : Number(estimatedCostPriceRaw)

    const validationError = validateBookDraft({ title, barcode, sellingPrice, costPrice, stock, isArriving })
    if (validationError) return alert(validationError)
    if (estimatedSellingPrice != null && (Number.isNaN(estimatedSellingPrice) || estimatedSellingPrice < 0)) {
      return alert('سعر البيع التقريبي غير صحيح')
    }
    if (estimatedCostPrice != null && (Number.isNaN(estimatedCostPrice) || estimatedCostPrice < 0)) {
      return alert('سعر التكلفة التقريبي غير صحيح')
    }
    if (barcode) {
      if (bookModal.mode === 'add' && books.some((b) => b.barcode === barcode)) {
        return alert('هذا الباركود مستخدم بالفعل لكتاب آخر!')
      }
      if (bookModal.mode === 'edit' && books.some((b) => b.id !== bookModal.data?.id && b.barcode === barcode)) {
        return alert('هذا الباركود مستخدم بالفعل لكتاب آخر!')
      }
    }

    const payload = {
      title: formData.get('title'),
      author: formData.get('author'),
      sellingPrice: Number(formData.get('sellingPrice')) || 0,
      costPrice: Number(formData.get('costPrice')) || 0,
      stock: Number(formData.get('stock')) || 0,
      estimatedSellingPrice,
      estimatedCostPrice,
      barcode: formData.get('barcode'),
      isArriving,
    }
    if (!useBackend) {
      const local = { ...payload, id: bookModal.mode === 'edit' ? bookModal.data.id : Date.now() }
      setBooks((prev) => {
        if (bookModal.mode === 'edit') {
          return prev.map((item) => (item.id === local.id ? local : item))
        }
        return [...prev, local]
      })
      enqueueSync({
        type: 'book_upsert',
        mode: bookModal.mode,
        localId: local.id,
        payload: {
          ...local,
          reservedStock: bookModal.data?.reservedStock ?? 0,
        },
      })
      bookModalHelpers.close()
      return
    }

    try {
      const baseDraft = {
        ...payload,
        reservedStock: bookModal.data?.reservedStock ?? 0,
      }
      if (bookModal.mode === 'edit') {
        const updated = await apiRequest(`/books/${bookModal.data.id}`, {
          method: 'PUT',
          body: JSON.stringify(mapUiBookToApi(baseDraft)),
        })
        const ui = mapApiBookToUi(updated)
        setBooks((prev) => prev.map((item) => (item.id === ui.id ? ui : item)))
      } else {
        const created = await apiRequest('/books', {
          method: 'POST',
          body: JSON.stringify(mapUiBookToApi(baseDraft)),
        })
        const ui = mapApiBookToUi(created)
        setBooks((prev) => [...prev, ui])
      }
      bookModalHelpers.close()
    } catch (error) {
      alert(error?.message || 'فشل حفظ الكتاب')
    }
  }

  const saveStudent = async (event) => {
    event.preventDefault()
    const formData = new FormData(event.target)
    const name = formData.get('name')?.trim()
    const phone = formData.get('phone')?.trim()

    if (!name) return alert('اسم الطالب مطلوب')
    if (!phone) return alert('رقم الهاتف مطلوب')
    
    // Check duplicates
    if (studentModal.mode === 'add') {
       if (isStudentDuplicate(students, { name, phone })) return alert('هذا الطالب مسجل بالفعل (الاسم أو الهاتف مكرر)')
     }

    const payload = {
      name: formData.get('name'),
      stage: formData.get('stage'),
      gender: formData.get('gender'),
      system: formData.get('system'),
      specialty: formData.get('specialty'),
      phone: formData.get('phone'),
    }

    if (!useBackend) {
      const local = { ...payload, id: studentModal.mode === 'edit' ? studentModal.data.id : Date.now() }
      setStudents((prev) => {
        if (studentModal.mode === 'edit') {
          return prev.map((item) => (item.id === local.id ? local : item))
        }
        return [...prev, local]
      })
      enqueueSync({
        type: 'student_upsert',
        mode: studentModal.mode,
        localId: local.id,
        payload: {
          ...local,
          balance: studentModal.data?.balance ?? 0,
        },
      })
      studentModalHelpers.close()
      return
    }

    try {
      const baseDraft = {
        ...payload,
        balance: studentModal.data?.balance ?? 0,
      }
      if (studentModal.mode === 'edit') {
        const updated = await apiRequest(`/students/${studentModal.data.id}`, {
          method: 'PUT',
          body: JSON.stringify(mapUiStudentToApi(baseDraft)),
        })
        const ui = mapApiStudentToUi(updated)
        setStudents((prev) => prev.map((item) => (item.id === ui.id ? ui : item)))
      } else {
        const created = await apiRequest('/students', {
          method: 'POST',
          body: JSON.stringify(mapUiStudentToApi(baseDraft)),
        })
        const ui = mapApiStudentToUi(created)
        setStudents((prev) => [...prev, ui])
      }
      studentModalHelpers.close()
    } catch (error) {
      alert(error?.message || 'فشل حفظ الطالب')
    }
  }

  const handleQuickStudentSubmit = async (event) => {
    event.preventDefault()
    if (!useBackend) {
      const payload = {
        id: Date.now(),
        ...quickStudent,
      }
      setStudents((prev) => [...prev, payload])
      enqueueSync({
        type: 'student_upsert',
        mode: 'add',
        localId: payload.id,
        payload: {
          ...payload,
          balance: 0,
        },
      })
      setSelectedStudentId(String(payload.id))
      setQuickStudent({
        name: '',
        phone: '',
        stage: 'first',
        gender: 'male',
        system: 'general',
        specialty: '',
      })
      return
    }

    try {
      const created = await apiRequest('/students', {
        method: 'POST',
        body: JSON.stringify(mapUiStudentToApi({ ...quickStudent, balance: 0 })),
      })
      const ui = mapApiStudentToUi(created)
      setStudents((prev) => [...prev, ui])
      setSelectedStudentId(String(ui.id))
    } catch (error) {
      alert(error?.message || 'فشل تسجيل الطالب')
      return
    }
    setQuickStudent({
      name: '',
      phone: '',
      stage: 'first',
      gender: 'male',
      system: 'general',
      specialty: '',
    })
  }

  const handleEmergencySubmit = async (event) => {
    event.preventDefault()
    const amountValue = Number(emergencyForm.amount)
    if (!amountValue || amountValue <= 0) return
    const staffName = emergencyForm.staffId || selectedStaffId
    setWithdrawals((prev) => [
      ...prev,
      {
        id: Date.now(),
        amount: amountValue,
        reason: emergencyForm.reason,
        staffId: staffName,
        date: new Date().toISOString(),
      },
    ])
    if (useBackend) {
      try {
        await apiRequest('/safe/emergency-withdrawals', {
          method: 'POST',
          body: JSON.stringify({
            amount: amountValue,
            reason: emergencyForm.reason || null,
            staff_name: staffName,
          }),
        })
      } catch {
        enqueueSync({
          type: 'emergency_withdrawal',
          payload: {
            amount: amountValue,
            reason: emergencyForm.reason || null,
            staffName,
          },
        })
      }
    } else {
      enqueueSync({
        type: 'emergency_withdrawal',
        payload: {
          amount: amountValue,
          reason: emergencyForm.reason || null,
          staffName,
        },
      })
    }
    setEmergencyForm({ amount: '', reason: '', staffId: '' })
  }

  const handleAdminUnlock = (event) => {
    event.preventDefault()
    if (adminPassword === 'educon_admin') {
      setAdminUnlocked(true)
      setAdminPassword('')
    }
  }

  const checkoutController = useMemo(
    () =>
      createCheckoutController({
        apiRequest,
        enqueueSync,
        isAuthError,
        handleSessionExpired,
        fetchCoreSnapshot,
        clearCart,
        formatTransactionId,
        t,
        mapUiStudentToApi,
        mapApiBookToUi,
        mapApiStudentToUi,
        alert,
        getCheckoutState: () => ({
          cartDetails,
          selectedStudent,
          quickStudent,
          useBackend,
          transactionCounter,
          selectedStaffId,
          paymentMethod,
          paidAmount,
        }),
        setters: {
          setStudents,
          setSelectedStudentId,
          setQuickStudent,
          setSalesHistory,
          setPendingReservations,
          setTransactionCounter,
          setLastTransaction,
          setWalletLog,
          setBooks,
          setUseBackend,
          setDiscount,
          setPaidAmount,
          setSearchTerm,
          setActiveView,
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      cartDetails,
      selectedStudent,
      quickStudent,
      useBackend,
      transactionCounter,
      selectedStaffId,
      paymentMethod,
      paidAmount,
    ],
  )

  const handleCompleteSale = async () => {
    await checkoutController.completeSale()
  }

  const effectiveStudent = useMemo(() => {
    if (selectedStudent) return selectedStudent
    if (quickStudent.name?.trim() && quickStudent.phone?.trim()) {
      return {
        id: 0,
        name: quickStudent.name.trim(),
        phone: quickStudent.phone.trim(),
        stage: quickStudent.stage,
        gender: quickStudent.gender,
        system: quickStudent.system,
        specialty: quickStudent.specialty || '',
      }
    }
    return null
  }, [selectedStudent, quickStudent])

  const receiptPayload = useMemo(() => {
    const hasLiveContext = cartDetails.items.length > 0 || Boolean(effectiveStudent)
    if (lastTransaction && !hasLiveContext) {
      return lastTransaction
    }
    return {
      id: formatTransactionId(transactionCounter),
      date: new Date().toISOString(),
      staffId: selectedStaffId,
      staffName: t(`staff.${selectedStaffId}`),
      student: effectiveStudent,
      items: cartDetails.items,
      subtotal: cartDetails.subtotal,
      discount: cartDetails.safeDiscount,
      total: cartDetails.total,
    }
  }, [lastTransaction, transactionCounter, selectedStaffId, effectiveStudent, cartDetails, t])

  const formatCurrencyForReceipt = (v) =>
    new Intl.NumberFormat(isRtl ? 'ar-EG' : 'en-US', {
      style: 'currency',
      currency: 'EGP',
      maximumFractionDigits: 0,
    }).format(v || 0)

  const getReceiptType = (payload) => {
    if (payload.receiptType) return payload.receiptType
    const items = payload.items || []
    const hasReservation = items.some((i) => i.type === 'reservation')
    const hasSale = items.some((i) => i.type !== 'reservation')
    const allReservation = items.length > 0 && items.every((i) => i.type === 'reservation')
    if (allReservation) return 'reservation'
    if (hasReservation && hasSale) return 'sale_reservation'
    return 'sale'
  }

  const receiptText = buildReceiptText({
    academyName: t('receipt.academy'),
    studentName: receiptPayload.student?.name,
    staffName: receiptPayload.staffName,
    items: receiptPayload.items || [],
    subtotal: receiptPayload.subtotal,
    discount: receiptPayload.discount,
    total: receiptPayload.total,
    transactionId: receiptPayload.id,
    transactionDate: new Date(receiptPayload.date).toLocaleString(locale),
    isArabic: isRtl,
    formatCurrencyFn: formatCurrencyForReceipt,
    receiptType: getReceiptType(receiptPayload),
    customFooter: adminCustomFooter,
  })

  const studentPhone = receiptPayload.student?.phone
  const whatsappPhone = formatPhoneForWhatsApp(studentPhone)

  const whatsappGroupLink = useMemo(() => {
    if (!receiptPayload.student) return null
    const systemKey = receiptPayload.student.system || 'general'
    const genderKey = receiptPayload.student.gender || 'male'
    const stageKey = receiptPayload.student.stage || 'first'
    return (
      whatsappGroupLinks?.[systemKey]?.[genderKey]?.[stageKey] ||
      whatsappGroupLinks.general.male.first
    )
  }, [receiptPayload.student, whatsappGroupLinks])

  const fullWhatsAppMessage = useMemo(() => {
    if (followsUs) return receiptText
    let msg = receiptText
    msg += `\n\n📢 تابع قناة Educon Academy في واتساب:\n${channelLink}`
    if (whatsappGroupLink) msg += `\n\n👥 انضم لمجموعتك:\n${whatsappGroupLink}`
    return msg
  }, [receiptText, followsUs, whatsappGroupLink, channelLink])

  const receiptLink = whatsappPhone
    ? `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(fullWhatsAppMessage)}`
    : null

  const archiveAndPrintReceipt = async () => {
    const payload = {
      ...receiptPayload,
      receiptType: getReceiptType(receiptPayload),
    }
    if (useBackend) {
      try {
        const archived = await archiveReceiptPayload({ apiRequest, payload })
        setReceiptArchiveItems((prev) => [archived, ...prev])
      } catch (error) {
        void error
        enqueueSync({
          type: 'receipt_archive',
          payload: {
            transactionCode: payload.id,
            receiptType: payload.receiptType || 'sale',
            staffName: payload.staffName,
            payload,
          },
        })
      }
    } else {
      setReceiptArchiveItems((prev) => [
        { id: Date.now(), payload, printedAt: new Date().toISOString() },
        ...prev,
      ])
      enqueueSync({
        type: 'receipt_archive',
        payload: {
          transactionCode: payload.id,
          receiptType: payload.receiptType || 'sale',
          staffName: payload.staffName,
          payload,
        },
      })
    }
    window.print()
  }

  const totalSales = salesHistory.reduce((sum, entry) => sum + entry.total, 0)
  const totalCost = salesHistory.reduce((sum, entry) => sum + entry.costTotal, 0)
  const totalNet = salesHistory.reduce((sum, entry) => sum + entry.netProfit, 0)
  const totalWithdrawals = withdrawals.reduce((sum, entry) => sum + entry.amount, 0)
  const safeBalance = totalSales - totalWithdrawals
  const chartMax = Math.max(totalSales, totalCost, totalNet, 1)

  const typeCounts = salesHistory.reduce(
    (acc, entry) => {
      const key = entry.receiptType || 'sale'
      acc[key] = (acc[key] || 0) + 1
      return acc
    },
    {},
  )

  const topBooksRows = books
    .map((book) => {
      const soldQty = salesHistory.reduce((sum, entry) => {
        const items = Array.isArray(entry.items) ? entry.items : []
        const fromSale = items.filter((item) => item.id === book.id && (item.type === 'sale' || item.type === 'pickup'))
        return (
          sum +
          fromSale.reduce((s, item) => s + (item.qty || 1), 0)
        )
      }, 0)
      return { book, soldQty }
    })
    .filter((row) => row.soldQty > 0)
    .sort((a, b) => b.soldQty - a.soldQty)
    .slice(0, 5)
  const noSoldBooks = books.every((book) =>
    salesHistory.every((entry) =>
      !(Array.isArray(entry.items) && entry.items.some((item) => item.id === book.id)),
    ),
  )

  const exportToExcel = () => {
    const salesSheet = salesHistory.map((entry) => ({
      Transaction: entry.id,
      Date: new Date(entry.date).toLocaleString(locale),
      Staff: entry.staffName,
      Student: entry.student?.name || '',
      PaymentMethod: paymentMethodLabels[entry.paymentMethod] || entry.paymentMethod || '',
      Subtotal: entry.subtotal,
      Discount: entry.discount,
      Total: entry.total,
      Cost: entry.costTotal,
      NetProfit: entry.netProfit,
    }))

    const withdrawalsSheet = withdrawals.map((entry) => ({
      Date: new Date(entry.date).toLocaleString(locale),
      Staff: t(`staff.${entry.staffId}`),
      Amount: entry.amount,
      Reason: entry.reason,
    }))

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(salesSheet), 'Sales')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(withdrawalsSheet), 'Withdrawals')
    XLSX.writeFile(workbook, 'educon-admin-report.xlsx')
  }

  const handleAudit = () => {
    if (!['heba', 'maryam'].includes(auditStaffId)) return
    const actual = Number(auditActualCash) || 0
    const diff = actual - safeBalance
    const snapshot = {
      id: auditLog.length + 1,
      staffId: auditStaffId,
      date: new Date().toISOString(),
      safeBalance,
      totalSales,
      totalWithdrawals,
      actualCash: actual,
      diff,
    }
    setAuditLog((prev) => [snapshot, ...prev])
    setSalesHistory([])
    setWithdrawals([])
    setPendingReservations([])
  }

  if (!authUser) {
    return <LoginPage onLogin={handleLogin} loading={authLoading} error={authError} />
  }

  return (
    <div className={`min-h-screen ${isRtl ? 'rtl' : 'ltr'} ${isDarkMode ? 'dark' : ''} bg-slate-50 dark:bg-slate-950`}>
      <style>{`
        @media print {
          html, body {
            width: 80mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print { display: none !important; }
          body * { visibility: hidden !important; }
          .receipt-print-only, .receipt-print-only * { visibility: visible !important; }
          .receipt-print-only {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 80mm !important;
            max-width: 80mm !important;
            margin: 0 !important;
            padding: 4mm !important;
            background: #fff !important;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important;
          }
          .receipt-print-only * { color: #000 !important; }
        }
        @page { size: 80mm auto; margin: 0; }
      `}</style>
      <div className={`flex min-h-screen ${isRtl ? 'flex-row-reverse' : 'flex-row'}`}>
        <aside className="no-print w-full max-w-[260px] shrink-0 bg-gradient-to-b from-brand-700 via-brand-600 to-brand-900 px-6 py-8 text-white shadow-glow">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
              <ReceiptText className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-white/70">POS</p>
              <h1 className="text-lg font-semibold leading-tight">{t('appName')}</h1>
            </div>
          </div>

          <nav className="mt-10 space-y-2">
            {availableNavItems.map((item) => {
              const Icon = item.icon
              const isActive = activeView === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveView(item.id)}
                  className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition ${
                    isActive ? 'bg-white text-brand-700 shadow-lg' : 'text-white/80 hover:bg-white/10'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span>{t(`nav.${item.id}`)}</span>
                </button>
              )
            })}
          </nav>

          <div className="mt-10 rounded-2xl bg-white/10 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.2em] text-white/60">{t('labels.staff')}</p>
            <p className="mt-1 text-xs text-white/70">
              {authUser?.full_name || authUser?.username} · {activeRole}
            </p>
            <select
              value={selectedStaffId}
              onChange={(event) => setSelectedStaffId(event.target.value)}
              className="mt-2 w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white"
            >
              {staffMembers.map((member) => (
                <option key={member.id} value={member.id} className="text-slate-900">
                  {t(`staff.${member.id}`)}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-auto space-y-2 pt-10">
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center justify-between rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-semibold"
            >
              <span className="flex items-center gap-2">
                <Lock className="h-4 w-4" />
                Logout
              </span>
            </button>
            <button
              type="button"
              onClick={() => setIsDarkMode((d) => !d)}
              className="flex w-full items-center justify-between rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-semibold"
            >
              <span className="flex items-center gap-2">
                {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                {isDarkMode ? t('labels.lightMode') : t('labels.darkMode')}
              </span>
            </button>
            <button
              type="button"
              onClick={toggleLanguage}
              className="flex w-full items-center justify-between rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-semibold"
            >
              <span className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                {isRtl ? 'English' : 'العربية'}
              </span>
              <span className="text-xs text-white/70">{isRtl ? 'EN' : 'AR'}</span>
            </button>
          </div>
        </aside>

        <main className="flex-1 px-6 py-8 lg:px-10">
          <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-brand-600">Edycon</p>
              <h2 className="text-2xl font-semibold text-slate-900">{t(`nav.${activeView}`)}</h2>
              <p className="mt-1 text-xs text-slate-400">
                {t('labels.activeStaff')}: {t(`staff.${selectedStaffId}`)}
              </p>
              <p className="mt-1 text-xs">
                {useBackend ? (
                  <span className="font-semibold text-emerald-600">
                    متصل بالسيرفر {syncQueue.length > 0 ? `· مزامنة ${syncQueue.length} عملية` : '· متزامن'}
                    {isSyncing ? ' ...' : ''}
                  </span>
                ) : (
                  <span className="font-semibold text-amber-600">
                    يعمل بدون إنترنت · محفوظ محليًا {syncQueue.length > 0 ? `(${syncQueue.length})` : ''}
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-3 rounded-2xl bg-white dark:bg-slate-800 dark:border dark:border-slate-700 px-4 py-3 shadow">
              <ScanBarcode className="h-5 w-5 text-brand-600 dark:text-brand-400" />
              <input
                ref={inputRef}
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                onKeyDown={handleScanKey}
                placeholder={t('labels.search')}
                className="w-64 border-none bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none"
              />
            </div>
          </header>

          {activeView === 'pos' && (
            <POSView
              t={t}
              locale={locale}
              openStudentModal={openStudentModal}
              studentPickerSearch={studentPickerSearch}
              setStudentPickerSearch={setStudentPickerSearch}
              selectedStudent={selectedStudent}
              filteredStudentsForPicker={filteredStudentsForPicker}
              setSelectedStudentId={setSelectedStudentId}
              handleQuickStudentSubmit={handleQuickStudentSubmit}
              quickStudent={quickStudent}
              setQuickStudent={setQuickStudent}
              studentAutocomplete={studentAutocomplete}
              stageOptions={stageOptions}
              genderOptions={genderOptions}
              systemOptions={systemOptions}
              filteredBooks={filteredBooks}
              hasPendingReservation={hasPendingReservation}
              addToCart={addToCart}
              cartDetails={cartDetails}
              updateCartQty={updateCartQty}
              updateCartType={updateCartType}
              addCartLine={addCartLine}
              updateCartDeposit={updateCartDeposit}
              paymentMethod={paymentMethod}
              setPaymentMethod={setPaymentMethod}
              discount={discount}
              setDiscount={setDiscount}
              reservationOutstandingTotal={reservationOutstandingTotal}
              paidAmount={paidAmount}
              setPaidAmount={setPaidAmount}
              handleCompleteSale={handleCompleteSale}
              receiptPayload={receiptPayload}
              receiptLink={receiptLink}
              whatsappPhone={whatsappPhone}
              followsUs={followsUs}
              setFollowsUs={setFollowsUs}
              whatsappGroupLink={whatsappGroupLink}
              channelLink={channelLink}
              archiveAndPrintReceipt={archiveAndPrintReceipt}
            />
          )}
          {activeView === 'books' && (
            <BooksView
              t={t}
              locale={locale}
              books={books}
              onAdd={() => openBookModal('add')}
              onEdit={(book) => openBookModal('edit', book)}
              onPrint={(book) => barcodeModalHelpers.open({ book })}
            />
          )}

          {activeView === 'booksInsights' && (
            <BooksInsightsView
              locale={locale}
              rows={booksInsightsRows}
              formatCurrency={formatCurrency}
            />
          )}

          {activeView === 'students' && (
            <StudentsView
              t={t}
              students={students}
              stageOptions={stageOptions}
              genderOptions={genderOptions}
              systemOptions={systemOptions}
              onAdd={() => openStudentModal('add')}
              onEdit={(student) => openStudentModal('edit', student)}
              onView={(student) => studentDetailsModalHelpers.open({ student })}
            />
          )}

          {activeView === 'pickupReservation' && (
            <ReservationsView
              variant="pickup"
              t={t}
              search={pickupSearch}
              onSearchChange={setPickupSearch}
              onOpenLegacy={() => legacyReservationModalHelpers.open()}
            >
                <PickupReservationContent
                  t={t}
                  locale={locale}
                  pickupSearch={pickupSearch}
                  students={students}
                  books={books}
                  pendingReservations={pendingReservations}
                  salesHistory={salesHistory}
                  formatCurrency={formatCurrency}
                  onComplete={({ student, reservations }) => {
                    const ids = reservations.map((r) => r.id)
                    const items = reservations.map((r) => {
                      const book = books.find((b) => b.id === r.bookId)
                      const qty = r.qty || 1
                      const pricePerUnit = book ? book.sellingPrice || 0 : 0
                      const fullPrice = pricePerUnit * qty
                      const deposit = r.deposit || 0
                      const remaining = Math.max(fullPrice - deposit, 0)
                      return {
                        id: r.id,
                        title: book?.title || '',
                        qty,
                        type: 'pickup',
                        deposit,
                        lineTotal: remaining,
                      }
                    })
                    const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0)
                    const transactionId = formatTransactionId(transactionCounter)
                    const transactionDate = new Date()
                    const pickupEntry = {
                      id: transactionId,
                      date: transactionDate.toISOString(),
                      staffId: selectedStaffId,
                      staffName: t(`staff.${selectedStaffId}`),
                      student,
                      items,
                      subtotal,
                      discount: 0,
                      total: subtotal,
                      costTotal: 0,
                      netProfit: subtotal,
                      receiptType: 'pickup',
                      paymentMethod,
                    }

                    // Deduct from Wallet if Payment Method is Wallet
                    // Note: 'paymentMethod' here is passed from prop, usually 'cash' default?
                    // We need to allow selecting payment method in Pickup View too.
                    // For now, let's assume if they have enough balance, we can deduct?
                    // Or just respect 'paymentMethod' prop which might be default 'cash'.
                    // The user said: "When I deposit book price in wallet, it must be deducted from any new operation".
                    // So if student has balance, we should probably prioritize it?
                    // Or let's just deduct if paymentMethod is wallet.
                    // But we don't have a payment selector in Pickup View yet.
                    // Let's AUTO-DEDUCT from wallet if balance > 0, regardless?
                    // No, that's dangerous.

                    // Let's add simple logic: If student has balance >= total, deduct from wallet and mark as paid by wallet.
                    if (student.balance >= subtotal) {
                       setStudents(prev => prev.map(s => 
                          s.id === student.id 
                            ? { ...s, balance: (s.balance || 0) - subtotal } 
                            : s
                       ))
                       pickupEntry.paymentMethod = 'wallet'
                       const logEntry = {
                          id: Date.now(),
                          studentId: student.id,
                          amount: -subtotal,
                          type: 'pickup_wallet',
                          date: new Date().toISOString(),
                          description: `استلام حجز ${transactionId} من المحفظة`
                        }
                        setWalletLog(prev => [logEntry, ...prev])
                    } else {
                       pickupEntry.paymentMethod = 'cash'
                    }

                    setSalesHistory((prev) => [pickupEntry, ...prev])
                    setTransactionCounter((prev) => prev + 1)
                    setLastTransaction(pickupEntry)
                    // Stock was ALREADY deducted when reservation was made. 
                    // So we DO NOT deduct again here.
                    /*
                    if (pickedBooks.length) {
                      setBooks((prev) =>
                        prev.map((book) => {
                          const picked = pickedBooks.find((r) => r.bookId === book.id)
                          if (!picked) return book
                          const nextStock = Math.max((book.stock || 0) - picked.qty, 0)
                          return { ...book, stock: nextStock }
                        }),
                      )
                    }
                    */
                    setPendingReservations((prev) => prev.filter((r) => !ids.includes(r.id)))
                    enqueueSync({
                      type: 'transaction_create',
                      payload: {
                        studentId: student.id,
                        discount: 0,
                        staffName: selectedStaffId,
                        items: reservations.map((r) => ({
                          bookId: r.bookId,
                          qty: r.qty || 1,
                          reservationId: r.id,
                        })),
                      },
                    })
                    if (student.balance >= subtotal) {
                      enqueueSync(
                        walletMutationOperation({
                          studentId: student.id,
                          student,
                          nextBalance: (student.balance || 0) - subtotal,
                          entryType: 'pickup_wallet',
                          amount: -subtotal,
                          sourceType: 'pickup',
                          sourceId: null,
                          operationId: `wallet:pickup:${transactionId}`,
                          actor: selectedStaffId,
                          description: `استلام حجز ${transactionId} من المحفظة`,
                          ledgerEnabled: isWalletLedgerEnabled,
                        }),
                      )
                    }
                    setActiveView('receipt')
                  }}
                />
            </ReservationsView>
          )}

          {activeView === 'cancelReservation' && (
            <ReservationsView
              variant="cancel"
              t={t}
              search={cancelSearch}
              onSearchChange={setCancelSearch}
            >
                <CancelReservationContent
                  t={t}
                  locale={locale}
                  cancelSearch={cancelSearch}
                  students={students}
                  books={books}
                  pendingReservations={pendingReservations}
                  salesHistory={salesHistory}
                  formatCurrency={formatCurrency}
                  onComplete={({ student, reservations, totalRefund, refundMethod }) => {
                    const ids = reservations.map((r) => r.id)
                    const toCancel = pendingReservations.filter((r) => ids.includes(r.id))
                    setPendingReservations((prev) => prev.filter((r) => !ids.includes(r.id)))
                    setCancelledReservations((prev) => [...prev, ...toCancel])

                    // Restore Stock
                    const cancelledItems = toCancel.map(r => ({ bookId: r.bookId, qty: r.qty || 1 }))
                    setBooks(prev => prev.map(book => {
                       const item = cancelledItems.find(i => i.bookId === book.id)
                       if (!item) return book
                       return { ...book, stock: (book.stock || 0) + item.qty }
                    }))

                    if (refundMethod === 'wallet') {
                       // Refund to Wallet
                       setStudents(prev => prev.map(s => 
                          s.id === student.id 
                            ? { ...s, balance: (s.balance || 0) + totalRefund } 
                            : s
                       ))
                       const logEntry = {
                          id: Date.now(),
                          studentId: student.id,
                          amount: totalRefund,
                          type: 'refund_cancel_reservation',
                          date: new Date().toISOString(),
                          description: `استرداد حجز للمحفظة`
                        }
                        setWalletLog(prev => [logEntry, ...prev])
                    } else {
                       // Refund Cash (Withdrawal)
                       setWithdrawals((prev) => [
                          ...prev,
                          {
                            id: Date.now(),
                            amount: -totalRefund,
                            reason: 'سحب حجز (كاش)',
                            staffId: selectedStaffId,
                            date: new Date().toISOString(),
                          },
                        ])
                    }
                    if (refundMethod === 'cash') {
                      for (const r of reservations) {
                        enqueueSync({
                          type: 'reservation_cancel',
                          payload: {
                            reservationId: r.id,
                            refundMethod: 'cash',
                            refundAmount: r.deposit || 0,
                            staffName: selectedStaffId,
                            studentId: student.id,
                          },
                        })
                      }
                    } else {
                      for (const r of reservations) {
                        enqueueSync({
                          type: 'reservation_cancel',
                          payload: {
                            reservationId: r.id,
                            refundMethod: 'none',
                            refundAmount: 0,
                            staffName: selectedStaffId,
                            studentId: student.id,
                          },
                        })
                      }
                      enqueueSync(
                        walletMutationOperation({
                          studentId: student.id,
                          student,
                          nextBalance: (student.balance || 0) + totalRefund,
                          entryType: 'refund_cancel_reservation',
                          amount: totalRefund,
                          sourceType: 'reservation_cancel',
                          sourceId: null,
                          operationId: `wallet:cancel:${transactionId}`,
                          actor: selectedStaffId,
                          description: `استرداد حجز للمحفظة`,
                          ledgerEnabled: isWalletLedgerEnabled,
                        }),
                      )
                    }

                    const items = reservations.map((r) => {
                      const book = books.find((b) => b.id === r.bookId)
                      return {
                        id: r.id,
                        title: book?.title || '',
                        qty: r.qty || 1,
                        type: 'cancel',
                        lineTotal: r.deposit || 0,
                      }
                    })
                    const transactionId = formatTransactionId(transactionCounter)
                    const transactionDate = new Date()
                    const cancelEntry = {
                      id: transactionId,
                      date: transactionDate.toISOString(),
                      staffId: selectedStaffId,
                      staffName: t(`staff.${selectedStaffId}`),
                      student,
                      items,
                      subtotal: totalRefund,
                      discount: 0,
                      total: totalRefund,
                      costTotal: 0,
                      netProfit: -totalRefund,
                      receiptType: 'cancel',
                      paymentMethod,
                    }
                    setLastTransaction(cancelEntry)
                    setActiveView('receipt')
                  }}
                />
            </ReservationsView>
          )}

          {activeView === 'returns' && (
            <ReturnsView>
                <ReturnSaleContent
                  t={t}
                  locale={locale}
                  salesHistory={salesHistory}
                  formatCurrency={formatCurrency}
                  selectedStaffId={selectedStaffId}
                  paymentMethod={paymentMethod}
                  onReturnComplete={(entry, affectedBooks, isWalletRefund) => {
                    setSalesHistory((prev) => [entry, ...prev])
                    setTransactionCounter((prev) => prev + 1)
                    setLastTransaction(entry)
                    if (affectedBooks.length) {
                      setBooks((prev) =>
                        prev.map((book) => {
                          const returned = affectedBooks.find((r) => r.bookId === book.id)
                          if (!returned) return book
                          const nextStock = (book.stock || 0) + returned.qty
                          return { ...book, stock: nextStock }
                        }),
                      )
                    }

                    if (isWalletRefund && entry.student?.id) {
                       setStudents(prev => prev.map(s =>
                          s.id === entry.student.id
                            ? { ...s, balance: (s.balance || 0) + Math.abs(entry.total) }
                            : s
                       ))
                       const logEntry = {
                          id: Date.now(),
                          studentId: entry.student.id,
                          amount: Math.abs(entry.total),
                          type: 'refund_return_sale',
                          date: new Date().toISOString(),
                          description: `استرداد فاتورة ${entry.originalTransactionId} للمحفظة`
                        }
                        setWalletLog(prev => [logEntry, ...prev])
                        enqueueSync(
                          walletMutationOperation({
                            studentId: entry.student.id,
                            student: entry.student,
                            nextBalance: (entry.student.balance || 0) + Math.abs(entry.total),
                            entryType: 'refund_return_sale',
                            amount: Math.abs(entry.total),
                            sourceType: 'return',
                            sourceId: null,
                            operationId: `wallet:return:${entry.originalTransactionId || entry.id}`,
                            actor: selectedStaffId,
                            description: `استرداد فاتورة ${entry.originalTransactionId} للمحفظة`,
                            ledgerEnabled: isWalletLedgerEnabled,
                          }),
                        )
                    }

                    setActiveView('receipt')
                  }}
                />
            </ReturnsView>
          )}

          {activeView === 'receipt' && (
            <div className="max-w-3xl space-y-4">
              <ThermalReceipt
                t={t}
                locale={locale}
                receipt={receiptPayload}
                receiptLink={receiptLink}
                hasPhone={Boolean(whatsappPhone)}
                followsUs={followsUs}
                onFollowsUsChange={setFollowsUs}
                whatsappGroupLink={whatsappGroupLink}
                channelLink={channelLink}
                onPrint={archiveAndPrintReceipt}
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    clearCart()
                    setDiscount(0)
                    setSelectedStudentId('')
                    setQuickStudent({
                      name: '',
                      phone: '',
                      stage: 'first',
                      gender: 'male',
                      system: 'general',
                      specialty: '',
                    })
                    setLastTransaction(null)
                    setActiveView('pos')
                  }}
                  className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold"
                >
                  عملية جديدة
                </button>
              </div>
            </div>
          )}

          {activeView === 'receiptArchive' && (
            <ReceiptArchiveView
              locale={locale}
              items={receiptArchiveItems}
              onRefresh={async () => {
                if (!useBackend) return
                try {
                  const data = await refreshReceiptArchiveItems(apiRequest)
                  setReceiptArchiveItems(data)
                } catch {
                  setReceiptArchiveItems([])
                }
              }}
              onOpenReceipt={(payload) => {
                setLastTransaction(payload)
                setActiveView('receipt')
              }}
            />
          )}

          {activeView === 'accounting' && (
            <AccountingView
              locale={locale}
              books={books}
              report={financeReport}
              supplies={supplies}
              form={supplyForm}
              onFormChange={setSupplyForm}
              onRefresh={async () => {
                if (!useBackend) return
                try {
                  const { finance, supplies: suppliesList } = await refreshAccountingSnapshot(apiRequest)
                  setFinanceReport(finance)
                  setSupplies(suppliesList)
                } catch {
                  setFinanceReport(null)
                  setSupplies([])
                }
              }}
              onCreateSupply={async () => {
                if (!useBackend) return
                const bookId = Number(supplyForm.bookId)
                const quantity = Number(supplyForm.qty)
                const unitCost = Number(supplyForm.unitCost)
                const paid = supplyForm.paid === '' ? 0 : Number(supplyForm.paid)
                if (!bookId || quantity <= 0 || Number.isNaN(quantity) || Number.isNaN(unitCost)) return
                try {
                  await createSupplyRecord({
                    apiRequest,
                    bookId,
                    quantity,
                    unitCost,
                    paidAmount: paid,
                    supplierName: supplyForm.supplier || null,
                    staffName: selectedStaffId,
                  })
                  setSupplyForm({ bookId: '', qty: '1', unitCost: '', paid: '', supplier: '' })
                  const [{ uiBooks }, { finance, supplies: suppliesList }] = await Promise.all([
                    fetchCoreSnapshot({
                      apiRequest,
                      mapApiBookToUi,
                      mapApiStudentToUi,
                    }),
                    refreshAccountingSnapshot(apiRequest),
                  ])
                  setBooks(uiBooks)
                  setFinanceReport(finance)
                  setSupplies(suppliesList)
                } catch (error) {
                  alert(error?.message || 'فشل تسجيل التوريد')
                }
              }}
            />
          )}

          {activeView === 'emergency' && (
            <EmergencyView
              t={t}
              locale={locale}
              staffMembers={staffMembers}
              form={emergencyForm}
              onFormChange={setEmergencyForm}
              withdrawals={withdrawals}
              formatCurrency={formatCurrency}
              defaultStaffId={selectedStaffId}
              onSubmit={handleEmergencySubmit}
            />
          )}

          {activeView === 'inventory' && (
            <InventoryAuditView
              t={t}
              locale={locale}
              safeBalance={safeBalance}
              totalSales={totalSales}
              totalWithdrawals={totalWithdrawals}
              auditActualCash={auditActualCash}
              onActualCashChange={setAuditActualCash}
              auditStaffId={auditStaffId}
              onAuditStaffChange={setAuditStaffId}
              auditStaffMembers={auditStaffMembers}
              onAudit={handleAudit}
              auditLog={auditLog}
              formatCurrency={formatCurrency}
            />
          )}

          {activeView === 'admin' && (
            <AdminView
              t={t}
              locale={locale}
              customFooter={adminCustomFooter}
              onCustomFooterChange={setAdminCustomFooter}
              onExport={exportToExcel}
              adminUnlocked={adminUnlocked}
              adminPassword={adminPassword}
              onPasswordChange={setAdminPassword}
              onUnlock={handleAdminUnlock}
              onLock={() => setAdminUnlocked(false)}
              totalSales={totalSales}
              totalCost={totalCost}
              totalNet={totalNet}
              chartMax={chartMax}
              salesHistory={salesHistory}
              formatCurrency={formatCurrency}
            />
          )}

          {activeView === 'reports' && (
            <ReportsView
              t={t}
              locale={locale}
              salesHistory={salesHistory}
              totalSales={totalSales}
              totalWithdrawals={totalWithdrawals}
              safeBalance={safeBalance}
              typeCounts={typeCounts}
              topBooksRows={topBooksRows}
              noSoldBooks={noSoldBooks}
              formatCurrency={formatCurrency}
            />
          )}
        </main>
      </div>

      {bookModal.open && (
        <Modal onClose={() => bookModalHelpers.close()}>
          <form onSubmit={saveBook} className="space-y-4">
            <ModalHeader
              title={bookModal.mode === 'edit' ? t('actions.edit') : t('actions.add')}
              onClose={() => bookModalHelpers.close()}
            />
            <InputField
              name="title"
              label={t('fields.name')}
              defaultValue={bookModal.data?.title}
              required
            />
            <InputField
              name="author"
              label={t('fields.author')}
              defaultValue={bookModal.data?.author}
              required
            />
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                name="isArriving"
                defaultChecked={bookModal.data?.isArriving}
                className="h-4 w-4 rounded border-slate-300"
              />
              {t('labels.arrivingSoon')}
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <InputField
                name="estimatedSellingPrice"
                label="سعر البيع التقريبي"
                type="number"
                defaultValue={bookModal.data?.estimatedSellingPrice ?? ''}
              />
              <InputField
                name="estimatedCostPrice"
                label="سعر التكلفة التقريبي"
                type="number"
                defaultValue={bookModal.data?.estimatedCostPrice ?? ''}
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <InputField
                name="sellingPrice"
                label={t('labels.sellingPrice')}
                type="number"
                defaultValue={bookModal.data?.sellingPrice}
              />
              <InputField
                name="costPrice"
                label={t('labels.costPrice')}
                type="number"
                defaultValue={bookModal.data?.costPrice}
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <InputField
                name="stock"
                label={t('labels.stock')}
                type="number"
                defaultValue={bookModal.data?.stock}
              />
              <InputField
                name="barcode"
                label={t('labels.barcode')}
                defaultValue={bookModal.data?.barcode}
              />
            </div>
            <ModalActions t={t} />
          </form>
        </Modal>
      )}

      {barcodeModal.open && (
        <Modal onClose={() => barcodeModalHelpers.close()}>
          <div className="space-y-4">
            <ModalHeader
              title={t('labels.barcodePreview')}
              onClose={() => barcodeModalHelpers.close()}
            />
            <div className="flex items-center justify-center">
              <div className="w-64 rounded-2xl border border-slate-200 bg-white p-4 text-center">
                <p className="text-sm font-semibold text-slate-900">
                  {barcodeModal.book?.title}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {barcodeModal.book?.barcode}
                </p>
                <div className="mt-4 h-10 rounded bg-slate-200" />
                <p className="mt-2 text-xs text-slate-400">{t('labels.labelPreview')}</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold"
              >
                <Printer className="h-4 w-4" />
                {t('actions.print')}
              </button>
              <button
                type="button"
                onClick={() => barcodeModalHelpers.close()}
                className="rounded-2xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
              >
                {t('actions.close')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {studentModal.open && (
        <Modal onClose={() => studentModalHelpers.close()}>
          <form onSubmit={saveStudent} className="space-y-4">
            <ModalHeader
              title={studentModal.mode === 'edit' ? t('actions.edit') : t('actions.add')}
              onClose={() => studentModalHelpers.close()}
            />
            <InputField
              name="name"
              label={t('fields.name')}
              defaultValue={studentModal.data?.name}
              required
            />
            <div className="grid gap-3 md:grid-cols-2">
              <SelectField
                label={t('fields.stage')}
                name="stage"
                defaultValue={studentModal.data?.stage || 'first'}
                options={stageOptions}
              />
              <SelectField
                label={t('fields.gender')}
                name="gender"
                defaultValue={studentModal.data?.gender || 'male'}
                options={genderOptions}
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <SelectField
                label={t('fields.system')}
                name="system"
                defaultValue={studentModal.data?.system || 'general'}
                options={systemOptions}
              />
              <InputField
                name="specialty"
                label={t('fields.specialty')}
                defaultValue={studentModal.data?.specialty}
              />
            </div>
            <InputField
              name="phone"
              label={t('fields.phone')}
              defaultValue={studentModal.data?.phone}
              required
            />
            <ModalActions t={t} />
          </form>
        </Modal>
      )}

      {studentDetailsModal.open && studentDetailsModal.student && (
        <StudentDetailsModal
          t={t}
          locale={locale}
          student={studentDetailsModal.student}
          salesHistory={salesHistory}
          pendingReservations={pendingReservations}
          books={books}
          walletLog={walletLog}
          formatCurrency={formatCurrency}
          onClose={() => studentDetailsModalHelpers.close()}
          onPickup={({ student, reservations }) => {
            // Re-use logic from PickupReservationContent via a wrapper or direct call
            // Ideally we should extract the pickup logic to a shared function "handlePickup"
            // For now, let's just close modal and switch to pickup view with search pre-filled?
            // No, better to execute it here.
            // Let's Copy-Paste the logic from PickupReservationContent's onComplete for now, 
            // but since we don't have access to setSalesHistory etc here easily without passing them,
            // we might want to refactor.
            // Actually, we can pass a "handlePickup" function from App to StudentDetailsModal.
            
            // Wait, passing "onPickup" prop is what we did.
            // So we need to define the handler in App.
            
            // Reuse the logic:
            const ids = reservations.map((r) => r.id)
            const items = reservations.map((r) => {
              const book = books.find((b) => b.id === r.bookId)
              const qty = r.qty || 1
              const pricePerUnit = book ? book.sellingPrice || 0 : 0
              const fullPrice = pricePerUnit * qty
              const deposit = r.deposit || 0
              const remaining = Math.max(fullPrice - deposit, 0)
              return {
                id: r.id,
                title: book?.title || '',
                qty,
                type: 'pickup',
                deposit,
                lineTotal: remaining,
              }
            })
            const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0)
            const transactionId = formatTransactionId(transactionCounter)
            const transactionDate = new Date()
            const pickupEntry = {
              id: transactionId,
              date: transactionDate.toISOString(),
              staffId: selectedStaffId,
              staffName: t(`staff.${selectedStaffId}`),
              student,
              items,
              subtotal,
              discount: 0,
              total: subtotal,
              costTotal: 0,
              netProfit: subtotal,
              receiptType: 'pickup',
              paymentMethod: 'cash', // Default to cash in modal for now
            }
            // Mirror ReservationsView: allow paying the pickup from the wallet
            // when the student has sufficient balance. This closes the offline
            // persistence gap for the student-details modal.
            if (student.balance >= subtotal) {
              setStudents((prev) => prev.map((s) =>
                s.id === student.id
                  ? { ...s, balance: (s.balance || 0) - subtotal }
                  : s,
              ))
              pickupEntry.paymentMethod = 'wallet'
              const logEntry = {
                id: Date.now(),
                studentId: student.id,
                amount: -subtotal,
                type: 'pickup_wallet',
                date: new Date().toISOString(),
                description: `استلام حجز ${transactionId} من المحفظة`,
              }
              setWalletLog((prev) => [logEntry, ...prev])
              enqueueSync(
                walletMutationOperation({
                  studentId: student.id,
                  student,
                  nextBalance: (student.balance || 0) - subtotal,
                  entryType: 'pickup_wallet',
                  amount: -subtotal,
                  sourceType: 'pickup',
                  sourceId: null,
                  operationId: `wallet:pickup:${transactionId}`,
                  actor: selectedStaffId,
                  description: `استلام حجز ${transactionId} من المحفظة`,
                  ledgerEnabled: isWalletLedgerEnabled,
                }),
              )
            }
            setSalesHistory((prev) => [pickupEntry, ...prev])
            setTransactionCounter((prev) => prev + 1)
            setLastTransaction(pickupEntry)
            // Stock ALREADY deducted on reservation. Do NOT deduct again.
            /*
            if (pickedBooks.length) {
              setBooks((prev) =>
                prev.map((book) => {
                  const picked = pickedBooks.find((r) => r.bookId === book.id)
                  if (!picked) return book
                  const nextStock = Math.max((book.stock || 0) - picked.qty, 0)
                  return { ...book, stock: nextStock }
                }),
              )
            }
            */
            setPendingReservations((prev) => prev.filter((r) => !ids.includes(r.id)))
            studentDetailsModalHelpers.close()
            setActiveView('receipt')
          }}
        />
      )}

      <LegacyReservationModal
        open={legacyReservationModal.open}
        onClose={() => legacyReservationModalHelpers.close()}
        books={books}
        students={students}
        setStudents={setStudents}
        setPendingReservations={setPendingReservations}
      />
    </div>
  )
}

function ManagementTable({ title, actionLabel, onAdd, columns, rows, onEdit }) {
  return (
    <div className="rounded-3xl bg-white p-6 shadow">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">{title}</h3>
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-2 rounded-2xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
        >
          <Plus className="h-4 w-4" />
          {actionLabel}
        </button>
      </div>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-slate-400">
              {columns.map((col) => (
                <th key={col} className="pb-3">
                  {col}
                </th>
              ))}
              <th className="pb-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="text-slate-700">
                {row.map((cell, index) => (
                  <td key={`${rowIndex}-${index}`} className="py-3">
                    {cell}
                  </td>
                ))}
                <td className="py-3">
                  <button
                    type="button"
                    onClick={() => onEdit(rowIndex)}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-brand-600"
                  >
                    <Pencil className="h-4 w-4" />
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}


function StudentDetailsModal({ t, locale, student, salesHistory, pendingReservations, books, onClose, onPickup, formatCurrency, walletLog }) {
  const [activeTab, setActiveTab] = useState('history')

  const studentSales = useMemo(() => {
    return salesHistory.filter(s => s.student?.id === student.id)
  }, [salesHistory, student.id])

  const studentReservations = useMemo(() => {
    return pendingReservations.filter(r => r.studentId === student.id)
  }, [pendingReservations, student.id])

  const studentWalletLog = useMemo(() => {
    return (walletLog || []).filter(l => l.studentId === student.id).sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [walletLog, student.id])

  // Calculate Balance (Debt/Credit)
  const balance = student.balance || 0

  return (
    <Modal onClose={onClose}>
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-xl font-bold text-slate-900">{student.name}</h3>
            <p className="text-sm text-slate-500">{student.phone || 'No Phone'}</p>
          </div>
          <div className="text-left">
            <p className="text-xs text-slate-500">الرصيد الحالي (المحفظة)</p>
            <p className={`text-lg font-bold ${balance < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              {formatCurrency(locale, balance)}
            </p>
          </div>
        </div>

        <div className="flex gap-2 rounded-xl bg-slate-100 p-1">
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
              activeTab === 'history' ? 'bg-white text-brand-700 shadow' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            سجل المعاملات
          </button>
          <button
            onClick={() => setActiveTab('reservations')}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
              activeTab === 'reservations' ? 'bg-white text-brand-700 shadow' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            الحجوزات ({studentReservations.length})
          </button>
          <button
            onClick={() => setActiveTab('wallet')}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
              activeTab === 'wallet' ? 'bg-white text-brand-700 shadow' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            سجل المحفظة
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {activeTab === 'history' && (
            <div className="space-y-3">
              {studentSales.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">لا يوجد معاملات سابقة.</p>
              ) : (
                studentSales.map(sale => (
                  <div key={sale.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-900">
                        {receiptTypeLabels[sale.receiptType] || sale.receiptType}
                      </span>
                      <span className="text-xs text-slate-500">
                        {new Date(sale.date).toLocaleDateString(locale)}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-slate-600">
                      {sale.items?.map(item => (
                        <div key={item.id} className="flex justify-between">
                          <span>{item.title} × {item.qty}</span>
                          <span>{formatCurrency(locale, item.lineTotal)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-sm font-semibold">
                      <span>الإجمالي</span>
                      <span>{formatCurrency(locale, sale.total)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'wallet' && (
             <div className="space-y-3">
              {studentWalletLog.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">لا يوجد حركات في المحفظة.</p>
              ) : (
                studentWalletLog.map(log => (
                  <div key={log.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <div className="flex items-center justify-between">
                       <span className={`font-semibold ${log.amount > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                         {log.amount > 0 ? '+' : ''}{formatCurrency(locale, log.amount)}
                       </span>
                       <span className="text-xs text-slate-500">
                        {new Date(log.date).toLocaleDateString(locale)}
                       </span>
                    </div>
                    <p className="text-xs text-slate-600">{log.description}</p>
                  </div>
                ))
              )}
             </div>
          )}

          {activeTab === 'reservations' && (
            <div className="space-y-3">
              {studentReservations.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">لا يوجد حجوزات معلقة.</p>
              ) : (
                <PickupReservationContent
                  t={t}
                  locale={locale}
                  pickupSearch={student.name} // Pass name to force match
                  students={[student]} // Pass only this student
                  books={books}
                  pendingReservations={pendingReservations} // Pass all, filtered internally or by search
                  salesHistory={salesHistory}
                  formatCurrency={formatCurrency}
                  selectedStaffId=""
                  onComplete={onPickup}
                />
              )}
            </div>
          )}
        </div>
        
        <div className="flex justify-end pt-4">
           <button
             type="button"
             onClick={onClose}
             className="rounded-2xl border border-slate-200 px-6 py-2 text-sm font-semibold"
           >
             إغلاق
           </button>
        </div>
      </div>
    </Modal>
  )
}

export default App
