import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { toPng } from 'html-to-image'
import {
  Activity,
  Bell,
  Boxes,
  ChartNoAxesCombined,
  ChevronDown,
  CircleHelp,
  ClipboardList,
  CreditCard,
  DollarSign,
  Eye,
  Globe2,
  Landmark,
  LayoutDashboard,
  Menu,
  Moon,
  Package,
  Plus,
  Printer,
  Search,
  Settings,
  ShoppingCart,
  ScanLine,
  Sun,
  Trash2,
  Users,
  UserRoundPlus,
  X,
} from 'lucide-react'
import Barcode from 'react-barcode'
import { QRCodeSVG } from 'qrcode.react'
import { useTranslation } from 'react-i18next'
import './App.css'

type Theme = 'light' | 'dark'
type ProductSummary = {
  id: number
  sku: string
  barcode: string | null
  nameAr: string
  nameEn: string
  baseUnit: string
  reorderLevelUnits: number
  salePriceMinor: number
  availableUnits: number
  nearestExpiryDate: string | null
}
type BatchBalance = {
  batchId: number
  batchNumber: string
  expiryDate: string
  availableUnits: number
  isExpired: boolean
}
type SaleSummary = {
  id: number
  invoiceNumber: string
  customerName: string | null
  soldAt: string
  totalMinor: number
  status: string
  currencyCode: string
  exchangeRateScaled: number
  paymentMethod: string | null
}
type DashboardSummary = {
  todaySalesMinor: number
  todayOrders: number
  stockUnits: number
  lowStockCount: number
  recentSales: SaleSummary[]
  dailySales: { date: string; totalMinor: number }[]
}
type CustomerSummary = { id: number; name: string; phone: string | null }
type PurchaseSummary = {
  id: number
  referenceNumber: string
  supplierName: string
  totalMinor: number
  status: string
  purchasedAt: string
}
type CurrencySummary = {
  code: string
  name: string
  symbol: string
  minorUnitExponent: number
}
type SaleCartLine = { productId: number; quantity: number; discountBasisPoints: number }
type SaleReceipt = {
  id: number
  invoiceNumber: string
  subtotalMinor: number
  discountMinor: number
  taxMinor: number
  totalMinor: number
  customerName: string | null
  soldAt: string
  currencyCode: string
  exchangeRateScaled: number
  taxRateBasisPoints: number
  items: Array<{
    productNameAr: string
    productNameEn: string
    quantity: number
    unitPriceMinor: number
    discountMinor: number
    lineTotalMinor: number
  }>
  payments: Array<{ method: string; amountMinor: number; currencyCode: string }>
}
type PrinterConfig = {
  id: number | null
  name: string
  connectionType: 'usb' | 'network'
  vendorId: number | null
  productId: number | null
  host: string | null
  port: number | null
  paperWidth: '80mm' | '58mm'
  dpi: 203 | 300
  copies: number
  autoCut: boolean
  autoPrint: boolean
  printLogo: boolean
  fontSize: number
  isDefault: boolean
}
type UsbPrinter = { vendorId: number; productId: number; name: string }
type NetworkPrinter = { name: string; host: string; port: number }
type PrintJob = {
  id: number
  saleId: number | null
  invoiceNumber: string | null
  printerId: number | null
  printerName: string | null
  jobType: 'sale' | 'test'
  status: 'queued' | 'printing' | 'printed' | 'failed'
  attemptCount: number
  lastError: string | null
  createdAt: string
}
type PaymentMethod = 'cash' | 'card' | 'bank_transfer' | 'mixed'
type NavigationKey =
  | 'dashboard'
  | 'sales'
  | 'products'
  | 'inventory'
  | 'purchases'
  | 'customers'
  | 'reports'
  | 'settings'

const navigation: { key: NavigationKey; icon: typeof LayoutDashboard }[] = [
  { key: 'dashboard', icon: LayoutDashboard },
  { key: 'sales', icon: ShoppingCart },
  { key: 'products', icon: Package },
  { key: 'inventory', icon: Boxes },
  { key: 'purchases', icon: ClipboardList },
  { key: 'customers', icon: Users },
  { key: 'reports', icon: ChartNoAxesCombined },
  { key: 'settings', icon: Settings },
]

const emptyPrinter: PrinterConfig = {
  id: null,
  name: '',
  connectionType: 'usb',
  vendorId: null,
  productId: null,
  host: null,
  port: 9100,
  paperWidth: '80mm',
  dpi: 203,
  copies: 1,
  autoCut: true,
  autoPrint: false,
  printLogo: true,
  fontSize: 12,
  isDefault: false,
}

function daysUntilExpiry(dateValue: string): number {
  const [year, month, day] = dateValue.split('-').map(Number)
  if (!year || !month || !day) return Number.POSITIVE_INFINITY
  const expiry = new Date(year, month - 1, day)
  if (expiry.getFullYear() !== year || expiry.getMonth() !== month - 1 || expiry.getDate() !== day) {
    return Number.POSITIVE_INFINITY
  }
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((expiry.getTime() - today.getTime()) / 86_400_000)
}

function readTheme(): Theme {
  return localStorage.getItem('pharmacy-theme') === 'dark' ? 'dark' : 'light'
}

function App() {
  const { t, i18n } = useTranslation()
  const [theme, setTheme] = useState<Theme>(readTheme)
  const [activePage, setActivePage] = useState<NavigationKey>('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [products, setProducts] = useState<ProductSummary[]>([])
  const [batchBalanceResult, setBatchBalanceResult] = useState<{
    productId: string
    balances: BatchBalance[]
  } | null>(null)
  const [inventoryError, setInventoryError] = useState('')
  const [inventoryLoading, setInventoryLoading] = useState(false)
  const [productNameAr, setProductNameAr] = useState('')
  const [productNameEn, setProductNameEn] = useState('')
  const [productSku, setProductSku] = useState('')
  const [baseUnit, setBaseUnit] = useState('')
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null)
  const [customers, setCustomers] = useState<CustomerSummary[]>([])
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [purchases, setPurchases] = useState<PurchaseSummary[]>([])
  const [purchaseSearch, setPurchaseSearch] = useState('')
  const [purchaseStatusFilter, setPurchaseStatusFilter] = useState<'all' | 'received'>('all')
  const [customerSearch, setCustomerSearch] = useState('')
  const [reportSearch, setReportSearch] = useState('')
  const [reportPeriod, setReportPeriod] = useState<'7d' | '30d' | 'all'>('7d')
  const [purchaseReference, setPurchaseReference] = useState('')
  const [supplierName, setSupplierName] = useState('')
  const [purchaseTotal, setPurchaseTotal] = useState('')
  const [purchaseProductId, setPurchaseProductId] = useState('')
  const [purchaseBatchNumber, setPurchaseBatchNumber] = useState('')
  const [purchaseExpiry, setPurchaseExpiry] = useState('')
  const [purchaseQuantity, setPurchaseQuantity] = useState('')
  const [pharmacyName, setPharmacyName] = useState('')
  const [pharmacyAddress, setPharmacyAddress] = useState('')
  const [pharmacyPhone, setPharmacyPhone] = useState('')
  const [pharmacyTaxNumber, setPharmacyTaxNumber] = useState('')
  const [pharmacyTaxRate, setPharmacyTaxRate] = useState('0')
  const [pharmacyLogo, setPharmacyLogo] = useState('')
  const [productSalePrice, setProductSalePrice] = useState('')
  const [productPrices, setProductPrices] = useState<Record<number, string>>({})
  const [productReorderLevels, setProductReorderLevels] = useState<Record<number, string>>({})
  const [batchNumber, setBatchNumber] = useState('')
  const [batchExpiry, setBatchExpiry] = useState('')
  const [batchUnits, setBatchUnits] = useState('')
  const [batchProductId, setBatchProductId] = useState('')
  const [saleCustomerId, setSaleCustomerId] = useState('')
  const [saleCart, setSaleCart] = useState<SaleCartLine[]>([])
  const [saleSearch, setSaleSearch] = useState('')
  const [saleBarcode, setSaleBarcode] = useState('')
  const [currencies, setCurrencies] = useState<CurrencySummary[]>([])
  const [saleCurrencyCode, setSaleCurrencyCode] = useState('SAR')

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [paymentAmounts, setPaymentAmounts] = useState<Record<'cash' | 'card' | 'bank_transfer', string>>({
    cash: '',
    card: '',
    bank_transfer: '',
  })
  const [saleSubmitting, setSaleSubmitting] = useState(false)
  const [saleStartedAt, setSaleStartedAt] = useState(() => new Date())
  const [quickCustomerOpen, setQuickCustomerOpen] = useState(false)
  const [quickCustomerName, setQuickCustomerName] = useState('')
  const [quickCustomerPhone, setQuickCustomerPhone] = useState('')
  const [clearInvoiceOpen, setClearInvoiceOpen] = useState(false)
  const [removeProductId, setRemoveProductId] = useState<number | null>(null)
  const [selectedSaleProductId, setSelectedSaleProductId] = useState<number | null>(null)
  const [receiptWidth, setReceiptWidth] = useState<'a4' | '80mm' | '58mm'>('a4')
  const [saleReceipt, setSaleReceipt] = useState<SaleReceipt | null>(null)
  const [printers, setPrinters] = useState<PrinterConfig[]>([])
  const [printerForm, setPrinterForm] = useState<PrinterConfig>(emptyPrinter)
  const [usbPrinters, setUsbPrinters] = useState<UsbPrinter[]>([])
  const [networkPrinters, setNetworkPrinters] = useState<NetworkPrinter[]>([])
  const [printJobs, setPrintJobs] = useState<PrintJob[]>([])
  const [receiptPrinterId, setReceiptPrinterId] = useState<number | null>(null)
  const [printNotice, setPrintNotice] = useState('')
  const [printerBusy, setPrinterBusy] = useState(false)
  const [autoPrintSaleId, setAutoPrintSaleId] = useState<number | null>(null)
  const [retryPrintJobId, setRetryPrintJobId] = useState<number | null>(null)
  const [globalSearch, setGlobalSearch] = useState('')
  const [productCatalogFilter, setProductCatalogFilter] = useState<'all' | 'low' | 'expiring'>('all')
  const [productBarcode, setProductBarcode] = useState('')
  const [reorderLevel, setReorderLevel] = useState('0')
  const [sales, setSales] = useState<SaleSummary[]>([])
  const saleSearchRef = useRef<HTMLInputElement>(null)
  const saleBarcodeRef = useRef<HTMLInputElement>(null)
  const saleCustomerRef = useRef<HTMLSelectElement>(null)
  const paymentSectionRef = useRef<HTMLDivElement>(null)
  const saleFormRef = useRef<HTMLFormElement>(null)
  const quickCustomerInputRef = useRef<HTMLInputElement>(null)
  const receiptRef = useRef<HTMLDivElement>(null)
  const testReceiptRef = useRef<HTMLDivElement>(null)
  const autoPrintHandledRef = useRef<number | null>(null)
  const retryPrintStartedRef = useRef<number | null>(null)
  const sendReceiptRef = useRef<((saleId: number, printer: PrinterConfig, retryJobId?: number) => Promise<void>) | null>(null)
  const [printerTestTime] = useState(() => new Date())
  const taxRateBasisPoints = Math.max(0, Math.min(10000, Math.round((Number(pharmacyTaxRate) || 0) * 100)))
  const [availableUpdate, setAvailableUpdate] = useState<{
    version: string
    body?: string
  } | null>(null)
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'downloading' | 'error'>('idle')
  const [updateError, setUpdateError] = useState('')
  const [updateChecked, setUpdateChecked] = useState(false)
  const isArabic = i18n.resolvedLanguage !== 'en'
  const formatCurrencyMinor = (minor: number, currencyCode: string) => new Intl.NumberFormat(
    isArabic ? 'ar-SA' : 'en-US',
    { style: 'currency', currency: currencyCode },
  ).format(minor / (10 ** (currencies.find((currency) => currency.code === currencyCode)?.minorUnitExponent ?? 2)))
  const formatMoney = (baseMinor: number) => formatCurrencyMinor(convertInvoiceMinor(baseMinor, saleCurrencyCode, 1_000_000_000), saleCurrencyCode)
  const convertInvoiceMinor = (baseMinor: number, currencyCode: string, rateScaled?: number) => {
    const exponent = currencies.find((currency) => currency.code === currencyCode)?.minorUnitExponent ?? 2
    const rate = rateScaled === undefined ? 1 : rateScaled / 1_000_000_000
    if (!Number.isFinite(rate) || rate <= 0) return 0
    return Math.round(baseMinor / 100 / rate * (10 ** exponent))
  }
  const formatInvoiceMoney = (baseMinor: number, currencyCode = saleCurrencyCode, rateScaled?: number) => formatCurrencyMinor(convertInvoiceMinor(baseMinor, currencyCode, rateScaled ?? 1_000_000_000), currencyCode)
  const formatCompactAmount = (minor: number) => new Intl.NumberFormat(
    isArabic ? 'ar' : 'en',
    { notation: 'compact', maximumFractionDigits: 1 },
  ).format(minor / 100)
  const expiringProducts = products
    .filter((product) => {
      if (!product.nearestExpiryDate || product.availableUnits <= 0) return false
      const days = daysUntilExpiry(product.nearestExpiryDate)
      return days >= 0 && days <= 90
    })
    .sort((left, right) => (left.nearestExpiryDate ?? '').localeCompare(right.nearestExpiryDate ?? ''))
  const lowStockProducts = products
    .filter((product) => product.availableUnits <= product.reorderLevelUnits)
    .sort((left, right) => left.availableUnits - right.availableUnits)

  const catalogProducts = products.filter((product) => {
    const query = globalSearch.trim().toLocaleLowerCase()
    const matchesSearch = !query || [product.nameAr, product.nameEn, product.sku, product.barcode ?? '']
      .some((value) => value.toLocaleLowerCase().includes(query))
    if (!matchesSearch) return false
    if (productCatalogFilter === 'low') return product.availableUnits <= product.reorderLevelUnits
    if (productCatalogFilter === 'expiring') {
      if (!product.nearestExpiryDate || product.availableUnits <= 0) return false
      const days = daysUntilExpiry(product.nearestExpiryDate)
      return days >= 0 && days <= 90
    }
    return true
  })
  const dailySales = dashboard?.dailySales ?? []
  const chartMax = Math.max(...dailySales.map((day) => day.totalMinor), 0)
  const invoiceCurrencyExponent = currencies.find((currency) => currency.code === saleCurrencyCode)?.minorUnitExponent ?? 2
  const exchangeRateScaled = 1_000_000_000
  const invoiceAmounts = saleCart.reduce((totals, line) => {
    const product = products.find((entry) => entry.id === line.productId)
    if (!product) return totals
    const lineSubtotal = line.quantity * product.salePriceMinor
    const lineDiscount = Math.round(lineSubtotal * line.discountBasisPoints / 10000)
    totals.subtotal += lineSubtotal
    totals.discount += lineDiscount
    return totals
  }, { subtotal: 0, discount: 0 })
  const taxableSubtotalMinor = invoiceAmounts.subtotal - invoiceAmounts.discount
  const invoiceTaxMinor = Math.round(taxableSubtotalMinor * taxRateBasisPoints / 10000)
  const invoiceTotalBaseMinor = taxableSubtotalMinor + invoiceTaxMinor
  const invoiceTotalMinor = Math.round(invoiceTotalBaseMinor / 100 * (10 ** invoiceCurrencyExponent))
  const paymentMethods: Array<Exclude<PaymentMethod, 'mixed'>> = ['cash', 'card', 'bank_transfer']
  const paymentTotalMinor = paymentMethod === 'mixed'
    ? paymentMethods.reduce((sum, method) => sum + Math.round((Number(paymentAmounts[method]) || 0) * (10 ** invoiceCurrencyExponent)), 0)
    : Math.round(
      (Number(paymentAmounts[paymentMethod] || (invoiceTotalMinor / (10 ** invoiceCurrencyExponent)).toFixed(invoiceCurrencyExponent)) || 0)
      * (10 ** invoiceCurrencyExponent),
    )
  const remainingMinor = Math.max(0, invoiceTotalMinor - paymentTotalMinor)
  const changeMinor = Math.max(0, paymentTotalMinor - invoiceTotalMinor)
  const receiptInvoiceTotalMinor = saleReceipt
    ? convertInvoiceMinor(saleReceipt.totalMinor, saleReceipt.currencyCode, saleReceipt.exchangeRateScaled)
    : 0
  const receiptPaidMinor = saleReceipt?.payments.reduce((sum, payment) => sum + payment.amountMinor, 0) ?? 0
  const receiptChangeMinor = Math.max(0, receiptPaidMinor - receiptInvoiceTotalMinor)
  const defaultPrinter = printers.find((printer) => printer.isDefault) ?? null
  const receiptPrinter = printers.find((printer) => printer.id === receiptPrinterId) ?? defaultPrinter
  const receiptPaperWidth = receiptWidth === 'a4' ? receiptPrinter?.paperWidth ?? '80mm' : receiptWidth
  const receiptDpi = receiptPrinter?.dpi ?? 203
  const receiptDots = receiptPaperWidth === '80mm'
    ? receiptDpi === 203 ? 576 : 850
    : receiptDpi === 203 ? 384 : 567
  const receiptPreviewWidth = receiptWidth === 'a4' ? undefined : `${receiptDots / 2}px`

  useEffect(() => {
    document.documentElement.lang = isArabic ? 'ar' : 'en'
    document.documentElement.dir = isArabic ? 'rtl' : 'ltr'
  }, [isArabic])

  useEffect(() => {
    if (!isTauri()) return
    void checkForUpdate()
    void refreshSetting()
  }, [])

  async function checkForUpdate() {
    setUpdateStatus('checking')
    setUpdateError('')
    try {
      const update = await check()
      setAvailableUpdate(update ? { version: update.version, body: update.body } : null)
      setUpdateChecked(true)
      setUpdateStatus('idle')
    } catch (error) {
      setUpdateChecked(true)
      setUpdateStatus('error')
      setUpdateError(error instanceof Error ? error.message : String(error))
    }
  }

  async function installUpdate() {
    setUpdateStatus('downloading')
    setUpdateError('')
    try {
      const update = await check()
      if (!update) {
        setAvailableUpdate(null)
        setUpdateStatus('idle')
        return
      }
      await update.downloadAndInstall()
      await relaunch()
    } catch (error) {
      setUpdateStatus('error')
      setUpdateError(error instanceof Error ? error.message : String(error))
    }
  }

  useEffect(() => {
    if (activePage === 'products' || activePage === 'inventory' || activePage === 'sales' || activePage === 'purchases') {
      void refreshProducts()
    }
    if (activePage === 'sales' || activePage === 'reports') {
      void refreshDashboard()
      void refreshCustomers()
      void refreshSales()
    }
    if (activePage === 'sales' || activePage === 'settings') void refreshPrinters()
    if (activePage === 'sales') void refreshPrintJobs()
  }, [activePage])

  useEffect(() => {
    let active = true
    void invoke<CurrencySummary[]>('list_currencies')
      .then((result) => {
        if (active) setCurrencies(result)
      })
      .catch((error: unknown) => {
        if (active) setInventoryError(error instanceof Error ? error.message : String(error))
      })
    return () => {
      active = false
    }
  }, [activePage])

  useEffect(() => {
    if (activePage !== 'sales') return
    const handleSaleShortcut = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setClearInvoiceOpen(false)
        setRemoveProductId(null)
        setQuickCustomerOpen(false)
        return
      }
      if (event.key === 'F2') {
        event.preventDefault()
        saleSearchRef.current?.focus()
      } else if (event.key === 'F3') {
        event.preventDefault()
        saleCustomerRef.current?.focus()
      } else if (event.key === 'F4') {
        event.preventDefault()
        paymentSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        paymentSectionRef.current?.querySelector<HTMLInputElement>('[data-payment-field]')?.focus()
      } else if (event.key === 'F8') {
        event.preventDefault()
        saleFormRef.current?.requestSubmit()
      } else if (event.key === 'Delete' && selectedSaleProductId !== null) {
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
        event.preventDefault()
        setRemoveProductId(selectedSaleProductId)
      }
    }
    window.addEventListener('keydown', handleSaleShortcut)
    return () => window.removeEventListener('keydown', handleSaleShortcut)
  }, [activePage, selectedSaleProductId])

  useEffect(() => {
    if (activePage === 'dashboard') void refreshDashboard()
    if (activePage === 'customers') void refreshCustomers()
    if (activePage === 'purchases') void refreshPurchases()
    if (activePage === 'settings') void refreshSetting()
  }, [activePage])

  useEffect(() => {
    let active = true
    if (!batchProductId) return
    void invoke<BatchBalance[]>('get_batch_balances', {
      productId: Number(batchProductId),
    }).then((result) => {
      if (active) setBatchBalanceResult({ productId: batchProductId, balances: result })
    }).catch((error: unknown) => {
      if (active) setInventoryError(error instanceof Error ? error.message : String(error))
    })
    return () => {
      active = false
    }
  }, [batchProductId])

  useEffect(() => {
    sendReceiptRef.current = sendReceiptToPrinter
  })

  useEffect(() => {
    if (autoPrintSaleId === null || saleReceipt?.id !== autoPrintSaleId || !defaultPrinter) return
    if (autoPrintHandledRef.current === autoPrintSaleId) return
    const print = sendReceiptRef.current
    if (!print) return
    autoPrintHandledRef.current = autoPrintSaleId
    void print(autoPrintSaleId, defaultPrinter)
  }, [autoPrintSaleId, saleReceipt, defaultPrinter])

  useEffect(() => {
    if (retryPrintJobId === null || !saleReceipt) return
    if (retryPrintStartedRef.current === retryPrintJobId) return
    const job = printJobs.find((entry) => entry.id === retryPrintJobId)
    const printer = printers.find((entry) => entry.id === job?.printerId)
    if (!job || !printer || job.saleId !== saleReceipt.id) return
    const print = sendReceiptRef.current
    if (!print) return
    retryPrintStartedRef.current = retryPrintJobId
    void print(saleReceipt.id, printer, retryPrintJobId)
  }, [retryPrintJobId, saleReceipt, printJobs, printers])

  async function refreshDashboard() {
    try {
      setDashboard(await invoke<DashboardSummary>('get_dashboard'))
    } catch (error) {
      setInventoryError(error instanceof Error ? error.message : String(error))
    }
  }

  async function refreshCustomers() {
    try {
      setCustomers(await invoke<CustomerSummary[]>('list_customers'))
    } catch (error) {
      setInventoryError(error instanceof Error ? error.message : String(error))
    }
  }

  async function refreshPurchases() {
    try {
      setPurchases(await invoke<PurchaseSummary[]>('list_purchases'))
    } catch (error) {
      setInventoryError(error instanceof Error ? error.message : String(error))
    }
  }

  async function refreshSales() {
    try {
      setSales(await invoke<SaleSummary[]>('list_sales'))
    } catch (error) {
      setInventoryError(error instanceof Error ? error.message : String(error))
    }
  }

  async function refreshPrinters() {
    try {
      const result = await invoke<PrinterConfig[]>('list_printers')
      setPrinters(result)
      setPrinterForm((current) => result.find((printer) => printer.id === current.id) ?? current)
      const defaultDevice = result.find((printer) => printer.isDefault)
      if (defaultDevice) {
        setReceiptPrinterId((current) => current ?? defaultDevice.id)
        setReceiptWidth((current) => current === 'a4' ? defaultDevice.paperWidth : current)
      }
    } catch (error) {
      setInventoryError(error instanceof Error ? error.message : String(error))
    }
  }

  async function refreshPrintJobs() {
    try {
      setPrintJobs(await invoke<PrintJob[]>('list_print_jobs'))
    } catch (error) {
      setInventoryError(error instanceof Error ? error.message : String(error))
    }
  }

  async function captureReceiptImage(element: HTMLDivElement, printer: PrinterConfig) {
    await document.fonts?.ready
    await Promise.all(Array.from(element.querySelectorAll('img')).map((image) => image.decode()))
    const paperDots = printer.paperWidth === '80mm'
      ? printer.dpi === 203 ? 576 : 850
      : printer.dpi === 203 ? 384 : 567
    const cssWidth = paperDots / 2
    const oldWidth = element.style.width
    const oldMaxWidth = element.style.maxWidth
    const oldPadding = element.style.padding
    const oldFontSize = element.style.getPropertyValue('--receipt-font-size')
    element.style.width = `${cssWidth}px`
    element.style.maxWidth = `${cssWidth}px`
    element.style.padding = '8px'
    element.style.setProperty('--receipt-font-size', `${printer.fontSize}px`)
    try {
      const image = await toPng(element, {
        backgroundColor: '#ffffff',
        cacheBust: true,
        pixelRatio: 2,
      })
      const base64 = image.slice(image.indexOf(',') + 1)
      if (!base64) throw new Error(t('receiptRasterFailed'))
      return base64
    } finally {
      element.style.width = oldWidth
      element.style.maxWidth = oldMaxWidth
      element.style.padding = oldPadding
      if (oldFontSize) element.style.setProperty('--receipt-font-size', oldFontSize)
      else element.style.removeProperty('--receipt-font-size')
    }
  }

  async function sendReceiptToPrinter(
    saleId: number,
    printer: PrinterConfig,
    retryJobId?: number,
  ) {
    if (!isTauri()) {
      setPrintNotice(t('nativePrinterUnavailable'))
      return
    }
    const receiptElement = receiptRef.current
    if (!receiptElement) {
      setPrintNotice(t('receiptRasterFailed'))
      return
    }
    setPrinterBusy(true)
    setPrintNotice('')
    try {
      const pngBase64 = await captureReceiptImage(receiptElement, printer)
      const job = retryJobId
        ? await invoke<PrintJob>('retry_print_job', { jobId: retryJobId, pngBase64 })
        : await invoke<PrintJob>('print_sale_receipt', {
          saleId,
          printerId: printer.id,
          pngBase64,
        })
      setPrintNotice(job.status === 'printed' ? t('printSucceeded') : job.lastError || t('printFailed'))
      await refreshPrintJobs()
    } catch (error) {
      setPrintNotice(error instanceof Error ? error.message : String(error))
    } finally {
      setPrinterBusy(false)
    }
  }

  async function printInvoice() {
    if (receiptWidth === 'a4') {
      window.print()
      return
    }
    if (!saleReceipt || !receiptPrinter) {
      setPrintNotice(t('defaultPrinterRequired'))
      return
    }
    if (receiptWidth !== receiptPrinter.paperWidth) {
      setPrintNotice(t('printerPaperWidthMismatch'))
      return
    }
    await sendReceiptToPrinter(saleReceipt.id, receiptPrinter)
  }

  async function testPrint() {
    if (!isTauri()) {
      setPrintNotice(t('nativePrinterUnavailable'))
      return
    }
    if (!printerForm.id || !testReceiptRef.current) {
      setPrintNotice(t('savePrinterBeforeTest'))
      return
    }
    setPrinterBusy(true)
    setPrintNotice('')
    try {
      const pngBase64 = await captureReceiptImage(testReceiptRef.current, printerForm)
      const job = await invoke<PrintJob>('print_test_page', {
        printerId: printerForm.id,
        pngBase64,
      })
      setPrintNotice(job.status === 'printed' ? t('printSucceeded') : job.lastError || t('printFailed'))
      await refreshPrintJobs()
    } catch (error) {
      setPrintNotice(error instanceof Error ? error.message : String(error))
    } finally {
      setPrinterBusy(false)
    }
  }

  async function discoverUsbPrinters() {
    setPrinterBusy(true)
    setPrintNotice('')
    try {
      const devices = await invoke<UsbPrinter[]>('discover_usb_printers')
      setUsbPrinters(devices)
      if (devices.length === 0) setPrintNotice(t('noUsbPrinters'))
    } catch (error) {
      setPrintNotice(error instanceof Error ? error.message : String(error))
    } finally {
      setPrinterBusy(false)
    }
  }

  async function discoverNetworkPrinters() {
    setPrinterBusy(true)
    setPrintNotice('')
    try {
      const devices = await invoke<NetworkPrinter[]>('discover_network_printers')
      setNetworkPrinters(devices)
      if (devices.length === 0) setPrintNotice(t('noNetworkPrinters'))
    } catch (error) {
      setPrintNotice(error instanceof Error ? error.message : String(error))
    } finally {
      setPrinterBusy(false)
    }
  }

  async function savePrinterSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setInventoryError('')
    setPrintNotice('')
    setPrinterBusy(true)
    try {
      const id = await invoke<number>('save_printer', {
        printer: {
          ...printerForm,
          host: printerForm.connectionType === 'network' ? printerForm.host : null,
          port: printerForm.connectionType === 'network' ? printerForm.port : null,
          vendorId: printerForm.connectionType === 'usb' ? printerForm.vendorId : null,
          productId: printerForm.connectionType === 'usb' ? printerForm.productId : null,
        },
      })
      const saved = { ...printerForm, id }
      setPrinterForm(saved)
      setReceiptPrinterId(id)
      setReceiptWidth(saved.paperWidth)
      setPrintNotice(t('printerSaved'))
      await refreshPrinters()
    } catch (error) {
      setInventoryError(error instanceof Error ? error.message : String(error))
    } finally {
      setPrinterBusy(false)
    }
  }

  async function deletePrinter() {
    if (!printerForm.id) return
    setPrinterBusy(true)
    setPrintNotice('')
    try {
      await invoke('remove_printer', { printerId: printerForm.id })
      setPrinterForm(emptyPrinter)
      setReceiptPrinterId(null)
      setPrintNotice(t('printerRemoved'))
      await refreshPrinters()
    } catch (error) {
      setInventoryError(error instanceof Error ? error.message : String(error))
    } finally {
      setPrinterBusy(false)
    }
  }

  async function retryPrintJob(job: PrintJob) {
    if (!job.saleId) {
      setPrintNotice(t('testJobCannotRetry'))
      return
    }
    const printer = printers.find((device) => device.id === job.printerId)
    if (!printer) {
      setPrintNotice(t('printerConfigMissing'))
      return
    }
    setReceiptPrinterId(printer.id)
    setReceiptWidth(printer.paperWidth)
    retryPrintStartedRef.current = null
    setPrintNotice('')
    try {
      const receipt = await invoke<SaleReceipt>('get_sale', { saleId: job.saleId })
      setSaleReceipt(receipt)
      setRetryPrintJobId(job.id)
    } catch (error) {
      setPrintNotice(error instanceof Error ? error.message : String(error))
    }
  }

  async function refreshBatchBalances() {
    if (!batchProductId) return
    try {
      const balances = await invoke<BatchBalance[]>('get_batch_balances', {
        productId: Number(batchProductId),
      })
      setBatchBalanceResult({ productId: batchProductId, balances })
    } catch (error) {
      setInventoryError(error instanceof Error ? error.message : String(error))
    }
  }

  async function refreshSetting() {
    try {
      const keys = ['pharmacy_name', 'pharmacy_address', 'pharmacy_phone', 'pharmacy_tax_number', 'pharmacy_logo', 'tax_rate_basis_points', 'default_currency_code']
      const values = await Promise.all(keys.map((key) => invoke<string>('get_setting', { key })))
      setPharmacyName(values[0])
      setPharmacyAddress(values[1])
      setPharmacyPhone(values[2])
      setPharmacyTaxNumber(values[3])
      setPharmacyLogo(values[4])
      setPharmacyTaxRate(values[5] ? (Number(values[5]) / 100).toString() : '0')
      setSaleCurrencyCode(values[6] || 'SAR')
    } catch (error) {
      setInventoryError(error instanceof Error ? error.message : String(error))
    }
  }

  const createPurchase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setInventoryError('')
    try {
      await invoke<number>('create_purchase', {
        referenceNumber: purchaseReference,
        supplierName,
        productId: Number(purchaseProductId),
        batchNumber: purchaseBatchNumber,
        expiryDate: purchaseExpiry,
        quantity: Number(purchaseQuantity),
        unitCostMinor: Math.round(Number(purchaseTotal) * 100),
      })
      setPurchaseReference('')
      setSupplierName('')
      setPurchaseTotal('')
      setPurchaseProductId('')
      setPurchaseBatchNumber('')
      setPurchaseExpiry('')
      setPurchaseQuantity('')
      await refreshPurchases()
      await refreshDashboard()
      await refreshProducts()
    } catch (error) {
      setInventoryError(error instanceof Error ? error.message : String(error))
    }
  }

  const saveSetting = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setInventoryError('')
    const taxRate = Number(pharmacyTaxRate)
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
      setInventoryError(t('taxRate'))
      return
    }
    if (!currencies.some((currency) => currency.code === saleCurrencyCode)) {
      setInventoryError(t('defaultCurrency'))
      return
    }
    try {
      await invoke('set_settings', {
        settings: {
          pharmacy_name: pharmacyName,
          pharmacy_address: pharmacyAddress,
          pharmacy_phone: pharmacyPhone,
          pharmacy_tax_number: pharmacyTaxNumber,
          pharmacy_logo: pharmacyLogo,
          tax_rate_basis_points: String(Math.round(taxRate * 100)),
          default_currency_code: saleCurrencyCode,
        },
      })
    } catch (error) {
      setInventoryError(error instanceof Error ? error.message : String(error))
    }
  }

  const receiveBatch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setInventoryError('')
    try {
      await invoke<number>('receive_batch', {
        productId: Number(batchProductId),
        batchNumber,
        expiryDate: batchExpiry,
        units: Number(batchUnits),
        sourceId: `purchase-${purchaseReference || 'manual'}`,
      })
      setBatchNumber('')
      setBatchExpiry('')
      setBatchUnits('')
      await refreshProducts()
      await refreshBatchBalances()
      await refreshDashboard()
    } catch (error) {
      setInventoryError(error instanceof Error ? error.message : String(error))
    }
  }

  const createSale = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (saleSubmitting) return
    setInventoryError('')
    if (!saleCart.length) return
    if (paymentTotalMinor < invoiceTotalMinor || invoiceTotalMinor <= 0) {
      setInventoryError(t('paymentRequired'))
      return
    }
    const payments = (paymentMethod === 'mixed'
      ? paymentMethods.map((method) => ({ method, value: paymentAmounts[method] }))
      : [{
        method: paymentMethod,
        value: paymentAmounts[paymentMethod] || (invoiceTotalMinor / (10 ** invoiceCurrencyExponent)).toFixed(invoiceCurrencyExponent),
      }])
      .filter(({ value }) => Number(value) > 0)
      .map(({ method, value }) => ({
        method,
        amountMinor: Math.round(Number(value) * (10 ** invoiceCurrencyExponent)),
        currencyCode: saleCurrencyCode,
      }))
    if (!payments.length || payments.some((payment) => !Number.isSafeInteger(payment.amountMinor) || payment.amountMinor <= 0)) {
      setInventoryError(t('paymentRequired'))
      return
    }

    setSaleSubmitting(true)
    let createdSale: { id: number }
    try {
      createdSale = await invoke<{ id: number }>('create_sale', {
        customerId: saleCustomerId ? Number(saleCustomerId) : null,
        items: saleCart.map(({ productId, quantity, discountBasisPoints }) => ({
          productId,
          quantity,
          discountBasisPoints,
        })),
        status: 'paid',
        payments,
        currencyCode: saleCurrencyCode,
        exchangeRateScaled,
      })
    } catch (error) {
      setInventoryError(error instanceof Error ? error.message : String(error))
      setSaleSubmitting(false)
      return
    }
    setSaleReceipt(null)
    setSaleCart([])
    setPaymentAmounts({ cash: '', card: '', bank_transfer: '' })
    setPaymentMethod('cash')
    setSaleCustomerId('')
    setQuickCustomerOpen(false)
    setSaleSearch('')
    setSaleBarcode('')
    setSelectedSaleProductId(null)
    setSaleStartedAt(new Date())
    setSaleSubmitting(false)
    await Promise.all([
      refreshDashboard(),
      refreshProducts(),
      refreshSales(),
    ])
    let configuredPrinter = defaultPrinter
    try {
      const currentPrinters = await invoke<PrinterConfig[]>('list_printers')
      setPrinters(currentPrinters)
      configuredPrinter = currentPrinters.find((printer) => printer.isDefault) ?? null
    } catch (error) {
      setPrintNotice(error instanceof Error ? error.message : String(error))
    }
    try {
      const receipt = await invoke<SaleReceipt>('get_sale', { saleId: createdSale.id })
      setSaleReceipt(receipt)
      if (configuredPrinter?.autoPrint) {
        setReceiptPrinterId(configuredPrinter.id)
        setReceiptWidth(configuredPrinter.paperWidth)
        setAutoPrintSaleId(receipt.id)
      }
    } catch {
      setInventoryError(t('invoiceSavedPrintFailed'))
    }
  }

  async function createQuickCustomer() {
    setInventoryError('')
    if (!quickCustomerName.trim()) {
      setInventoryError(t('customerNameRequired'))
      return
    }
    try {
      const customerId = await invoke<number>('create_customer', {
        name: quickCustomerName,
        phone: quickCustomerPhone || null,
      })
      await refreshCustomers()
      setSaleCustomerId(String(customerId))
      setQuickCustomerName('')
      setQuickCustomerPhone('')
      setQuickCustomerOpen(false)
    } catch (error) {
      setInventoryError(error instanceof Error ? error.message : String(error))
    }
  }

  async function showSaleDetails(saleId: number) {
    setInventoryError('')
    try {
      setRetryPrintJobId(null)
      setAutoPrintSaleId(null)
      setSaleReceipt(await invoke<SaleReceipt>('get_sale', { saleId }))
      if (defaultPrinter) {
        setReceiptPrinterId(defaultPrinter.id)
        setReceiptWidth(defaultPrinter.paperWidth)
      }
    } catch (error) {
      setInventoryError(error instanceof Error ? error.message : String(error))
    }
  }

  function addScannedBarcode(value: string) {
    const barcode = value.trim()
    if (!barcode) return
    const product = products.find((entry) => entry.barcode === barcode)
    if (!product) {
      setInventoryError(t('noSearchResults'))
      return
    }
    addToSaleCart(product.id)
    setSaleBarcode('')
  }

  function removeSaleItem(productId: number) {
    setSaleCart((current) => current.filter((line) => line.productId !== productId))
    setRemoveProductId(null)
    if (selectedSaleProductId === productId) setSelectedSaleProductId(null)
  }

  function clearSaleInvoice() {
    setSaleCart([])
    setSaleCustomerId('')
    setPaymentAmounts({ cash: '', card: '', bank_transfer: '' })
    setPaymentMethod('cash')
    setSaleReceipt(null)
    setQuickCustomerOpen(false)
    setSaleSearch('')
    setSaleBarcode('')
    setSelectedSaleProductId(null)
    setSaleStartedAt(new Date())
    setClearInvoiceOpen(false)
  }

  function addToSaleCart(productId: number) {
    setSaleReceipt(null)
    const product = products.find((entry) => entry.id === productId)
    if (!product) return
    if (!product.availableUnits) {
      setInventoryError(t('noStockAvailable'))
      return
    }
    if (!product.salePriceMinor) {
      setInventoryError(t('setProductPrice'))
      return
    }
    const existing = saleCart.find((line) => line.productId === productId)
    if (existing && existing.quantity >= product.availableUnits) {
      setInventoryError(t('noStockAvailable'))
      return
    }
    setSaleCart((current) => existing
      ? current.map((line) => line.productId === productId ? { ...line, quantity: line.quantity + 1 } : line)
      : [...current, { productId, quantity: 1, discountBasisPoints: 0 }])
  }

  async function saveProductPrice(productId: number) {
    setInventoryError('')
    try {
      await invoke('update_product_sale_price', {
        productId,
        salePriceMinor: Math.round(Number(productPrices[productId]) * 100),
      })
      await refreshProducts()
    } catch (error) {
      setInventoryError(error instanceof Error ? error.message : String(error))
    }
  }

  async function saveProductReorderLevel(productId: number) {
    const value = Number(productReorderLevels[productId])
    if (!Number.isSafeInteger(value) || value < 0) {
      setInventoryError(t('invalidReorderLevel'))
      return
    }
    setInventoryError('')
    try {
      await invoke('update_product_reorder_level', { productId, reorderLevelUnits: value })
      await refreshProducts()
    } catch (error) {
      setInventoryError(error instanceof Error ? error.message : String(error))
    }
  }

  function handleLogoUpload(file?: File) {
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setInventoryError(t('logoFileTypeError'))
      return
    }
    if (file.size > 1024 * 1024) {
      setInventoryError(t('logoFileSizeError'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') setPharmacyLogo(reader.result)
    }
    reader.onerror = () => setInventoryError(t('logoReadError'))
    reader.readAsDataURL(file)
  }

  const createCustomer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setInventoryError('')
    try {
      await invoke<number>('create_customer', { name: customerName, phone: customerPhone || null })
      setCustomerName('')
      setCustomerPhone('')
      await refreshCustomers()
    } catch (error) {
      setInventoryError(error instanceof Error ? error.message : String(error))
    }
  }

  async function refreshProducts() {
    setInventoryLoading(true)
    setInventoryError('')
    try {
      const result = await invoke<ProductSummary[]>('list_products')
      setProducts(result)
      setProductPrices(Object.fromEntries(
        result.map((product) => [product.id, (product.salePriceMinor / 100).toFixed(2)]),
      ))
      setProductReorderLevels(Object.fromEntries(
        result.map((product) => [product.id, String(product.reorderLevelUnits)]),
      ))
    } catch (error) {
      setInventoryError(error instanceof Error ? error.message : String(error))
    } finally {
      setInventoryLoading(false)
    }
  }

  const createProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setInventoryError('')
    try {
      await invoke<number>('create_product', {
        sku: productSku,
        barcode: productBarcode || null,
        nameAr: productNameAr,
        nameEn: productNameEn,
        baseUnit,
        reorderLevelUnits: Number(reorderLevel),
        salePriceMinor: Math.round(Number(productSalePrice) * 100),
      })
      setProductSku('')
      setProductNameAr('')
      setProductNameEn('')
      setBaseUnit('')
      setProductBarcode('')
      setReorderLevel('0')
      setProductSalePrice('')
      await refreshProducts()
    } catch (error) {
      setInventoryError(error instanceof Error ? error.message : String(error))
    }
  }

  const changeTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light'
    localStorage.setItem('pharmacy-theme', nextTheme)
    setTheme(nextTheme)
  }

  const changeLanguage = async () => {
    await i18n.changeLanguage(isArabic ? 'en' : 'ar')
    localStorage.setItem('pharmacy-language', isArabic ? 'en' : 'ar')
  }

  const filteredCustomers = customers.filter((customer) => {
    const query = customerSearch.trim().toLocaleLowerCase()
    return !query || [customer.name, customer.phone ?? ''].some((value) => value.toLocaleLowerCase().includes(query))
  })
  const filteredPurchases = purchases.filter((purchase) => {
    if (purchaseStatusFilter === 'received' && purchase.status !== 'received') return false
    const query = purchaseSearch.trim().toLocaleLowerCase()
    return !query || [purchase.referenceNumber, purchase.supplierName, purchase.status].some((value) => value.toLocaleLowerCase().includes(query))
  })
  const receivedPurchaseCount = purchases.filter((purchase) => purchase.status === 'received').length
  const reportStartDate = new Date()
  reportStartDate.setHours(0, 0, 0, 0)
  if (reportPeriod === '7d') reportStartDate.setDate(reportStartDate.getDate() - 6)
  if (reportPeriod === '30d') reportStartDate.setDate(reportStartDate.getDate() - 29)
  const filteredReportSales = sales.filter((sale) => {
    if (sale.currencyCode !== saleCurrencyCode) return false
    if (reportPeriod !== 'all' && new Date(sale.soldAt).getTime() < reportStartDate.getTime()) return false
    const query = reportSearch.trim().toLocaleLowerCase()
    return !query || [sale.invoiceNumber, sale.customerName ?? ''].some((value) => value.toLocaleLowerCase().includes(query))
  })
  const paidReportSales = filteredReportSales.filter((sale) => sale.status === 'paid')
  const paidReportTotal = paidReportSales.reduce((sum, sale) => sum + sale.totalMinor, 0)
  const averageReportSale = paidReportSales.length ? Math.round(paidReportTotal / paidReportSales.length) : 0
  const activeTitle = t(`nav.${activePage}`)

  return (
    <div
      className="app-shell luxury-theme"
      data-theme={theme}
      dir={isArabic ? 'rtl' : 'ltr'}
    >
      {(availableUpdate || updateError) && (
        <div className="update-banner" role="status">
          <div>
            <strong>{updateError ? t('updateFailed') : t('updateAvailable', { version: availableUpdate?.version })}</strong>
            {updateError ? <span>{updateError}</span> : availableUpdate?.body && <span>{availableUpdate.body}</span>}
          </div>
          {availableUpdate && (
            <button
              className="primary-button"
              type="button"
              onClick={() => void installUpdate()}
              disabled={updateStatus === 'downloading'}
            >
              {updateStatus === 'downloading' ? t('updating') : t('updateNow')}
            </button>
          )}
          {!availableUpdate && (
            <button className="text-button" type="button" onClick={() => void checkForUpdate()}>
              {t('retry')}
            </button>
          )}
        </div>
      )}
      {sidebarOpen && (
        <button
          className="sidebar-backdrop"
          type="button"
          aria-label={t('closeMenu')}
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside className={`sidebar ${sidebarOpen ? 'is-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            {pharmacyLogo
              ? <img src={pharmacyLogo} alt="" />
              : <Activity size={21} strokeWidth={2.5} />}
          </div>
          <div className="brand-copy">
            <strong>{t('brand')}</strong>
            <span>{t('brandCaption')}</span>
          </div>
          <button
            className="icon-button sidebar-close"
            type="button"
            aria-label={t('closeMenu')}
            onClick={() => setSidebarOpen(false)}
          >
            <X size={19} />
          </button>
        </div>

        <div className="branch-select">
          <div className="branch-avatar">د</div>
          <div className="branch-copy">
            <span>{t('currentBranch')}</span>
            <strong>{pharmacyName || t('branchName')}</strong>
          </div>
          <ChevronDown size={16} className="muted-icon" />
        </div>

        <p className="nav-heading">{t('mainMenu')}</p>
        <nav className="main-nav" aria-label={t('mainMenu')}>
          {navigation.map(({ key, icon: Icon }) => (
            <button
              key={key}
              className={`nav-item ${activePage === key ? 'is-active' : ''}`}
              type="button"
              aria-current={activePage === key ? 'page' : undefined}
              onClick={() => {
                setActivePage(key)
                setSidebarOpen(false)
              }}
            >
              <Icon size={19} strokeWidth={1.8} />
              <span>{t(`nav.${key}`)}</span>
              {key === 'inventory' && (dashboard?.lowStockCount ?? 0) > 0 && (
                <span className="nav-badge" aria-hidden="true">{dashboard?.lowStockCount}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-spacer" />
        <div className="help-card">
          <div className="help-icon"><CircleHelp size={19} /></div>
          <strong>{t('localDataTitle')}</strong>
          <p>{t('localDataDescription')}</p>
        </div>
        <div className="profile">
          <div className="profile-avatar">م</div>
          <div className="profile-info">
            <strong>{t('adminRole')}</strong>
            <span>{t('localSession')}</span>
          </div>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="topbar-title">
            <button
              className="icon-button mobile-menu"
              type="button"
              aria-label={t('openMenu')}
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={21} />
            </button>
            <div>
              <h1>{activeTitle}</h1>
              <p>{t('welcomeBack', { name: t('userName') })}</p>
            </div>
          </div>
          <div className="topbar-actions">
            <label className="search-box">
              <Search size={17} />
              <input
                aria-label={t('search')}
                placeholder={t('search')}
                value={globalSearch}
                onChange={(event) => setGlobalSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && globalSearch.trim()) setActivePage('products')
                }}
              />
              <kbd>⌘ K</kbd>
            </label>
            <button
              className="icon-button language-button"
              type="button"
              aria-label={t('switchLanguage')}
              onClick={changeLanguage}
            >
              <Globe2 size={18} />
              <span>{isArabic ? 'EN' : 'عربي'}</span>
            </button>
            <button
              className="icon-button"
              type="button"
              aria-label={t('toggleTheme')}
              onClick={changeTheme}
            >
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <button
              className="icon-button notification-button"
              type="button"
              aria-label={t('notifications')}
              onClick={() => setActivePage('inventory')}
            >
              <Bell size={18} />
              {(dashboard?.lowStockCount ?? 0) > 0 && <span className="notification-dot" />}
            </button>
          </div>
        </header>
        {inventoryError && (
          <div className="page-content page-error" role="alert">
            <span>{inventoryError}</span>
            <button type="button" className="text-button" onClick={() => setInventoryError('')}>{t('dismiss')}</button>
          </div>
        )}

        {activePage === 'dashboard' ? (
          <section className="page-content">
            <div className="page-heading">
              <div>
                <h2>{t('dashboardHeading')}</h2>
                <p>{t('dashboardDescription')}</p>
              </div>
              <button className="primary-button" type="button" onClick={() => setActivePage('sales')}>
                <Plus size={18} />
                {t('newSale')}
              </button>
            </div>

            <div className="stats-grid">
              <article className="stat-card">
                <div className="stat-top">
                  <span className="stat-icon mint"><CreditCard size={19} /></span>
                  <span className="stat-change">{t('liveData')}</span>
                </div>
                <p>{t('todaySales')}</p>
                <strong className="stat-value">{dashboard ? formatMoney(dashboard.todaySalesMinor) : '—'}</strong>
                <span className="stat-note">{t('recordedToday')}</span>
              </article>
              <article className="stat-card">
                <div className="stat-top">
                  <span className="stat-icon blue"><ShoppingCart size={19} /></span>
                  <span className="stat-change">{t('liveData')}</span>
                </div>
                <p>{t('ordersToday')}</p>
                <strong className="stat-value">{dashboard?.todayOrders ?? '—'}</strong>
                <span className="stat-note">{t('recordedToday')}</span>
              </article>
              <article className="stat-card">
                <div className="stat-top">
                  <span className="stat-icon amber"><Package size={19} /></span>
                  <span className="stat-change">{t('liveData')}</span>
                </div>
                <p>{t('productsInStock')}</p>
                <strong className="stat-value">{dashboard?.stockUnits ?? '—'}</strong>
                <span className="stat-note">{t('availableBaseUnits')}</span>
              </article>
              <article className="stat-card">
                <div className="stat-top">
                  <span className="stat-icon rose"><Bell size={19} /></span>
                  <span className="stat-alert">{t('needsAttention')}</span>
                </div>
                <p>{t('lowStockProducts')}</p>
                <strong className="stat-value">{dashboard?.lowStockCount ?? '—'}</strong>
                <span className="stat-note">{t('lowStockNote')}</span>
              </article>
            </div>

            <div className="dashboard-grid">
              <section className="panel sales-panel">
                <div className="panel-heading">
                  <div>
                    <h3>{t('salesOverview')}</h3>
                    <p>{t('salesOverviewDescription')}</p>
                  </div>
                </div>
                <div className="chart-summary">
                  <strong>{formatMoney((dashboard?.dailySales ?? []).reduce((sum, day) => sum + day.totalMinor, 0))}</strong>
                  <span className="chart-legend"><i /> {t('sales')}</span>
                </div>
                <div className="chart" role="img" aria-label={t('salesChart')}>
                  <div className="chart-grid">
                    <span>{formatCompactAmount(chartMax)}</span>
                    <span>{formatCompactAmount(Math.round(chartMax * 0.75))}</span>
                    <span>{formatCompactAmount(Math.round(chartMax * 0.5))}</span>
                    <span>{formatCompactAmount(Math.round(chartMax * 0.25))}</span>
                    <span>{formatCompactAmount(0)}</span>
                  </div>
                  <div className="chart-bars" aria-hidden="true">
                    {dailySales.map((day, index, days) => {
                      const height = chartMax > 0 && day.totalMinor > 0
                        ? Math.max(4, (day.totalMinor / chartMax) * 100)
                        : 0
                      return (
                      <div className="bar-column" key={index}>
                        <span className={`${index === days.length - 1 ? 'bar is-highlighted' : 'bar'} ${height === 0 ? 'is-empty' : ''}`} style={{ height: `${height}%` }} title={formatMoney(day.totalMinor)} />
                        <small>{new Date(`${day.date}T12:00:00`).toLocaleDateString(isArabic ? 'ar' : 'en', { weekday: 'short' })}</small>
                      </div>
                      )
                    })}
                  </div>
                </div>
              </section>

              <section className="panel quick-panel">
                <div className="panel-heading">
                  <div>
                    <h3>{t('quickActions')}</h3>
                    <p>{t('quickActionsDescription')}</p>
                  </div>
                </div>
                <div className="quick-actions">
                  {[
                    { icon: ShoppingCart, label: t('newSale'), color: 'mint', page: 'sales' as NavigationKey },
                    { icon: Plus, label: t('addProduct'), color: 'blue', page: 'inventory' as NavigationKey },
                    { icon: ClipboardList, label: t('newPurchase'), color: 'amber', page: 'purchases' as NavigationKey },
                    { icon: Users, label: t('addCustomer'), color: 'violet', page: 'customers' as NavigationKey },
                  ].map(({ icon: Icon, label, color, page }) => (
                    <button className="quick-action" type="button" key={label} onClick={() => setActivePage(page)}>
                      <span className={`quick-icon ${color}`}><Icon size={18} /></span>
                      <span>{label}</span>
                      <ChevronDown className="quick-chevron" size={15} />
                    </button>
                  ))}
                </div>
              </section>

              <section className="panel recent-panel">
                <div className="panel-heading">
                  <div>
                    <h3>{t('recentTransactions')}</h3>
                    <p>{t('recentTransactionsDescription')}</p>
                  </div>
                  <button className="text-button" type="button" onClick={() => setActivePage('sales')}>{t('viewAll')}</button>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>{t('invoice')}</th>
                        <th>{t('customer')}</th>
                        <th>{t('date')}</th>
                        <th>{t('amount')}</th>
                        <th>{t('status')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(dashboard?.recentSales ?? []).map((sale) => (
                        <tr key={sale.id}>
                          <td><span className="invoice-number">#{sale.invoiceNumber}</span></td>
                          <td><span className="customer-cell"><i className="customer-avatar ca-one">{(sale.customerName ?? t('cashCustomer')).charAt(0)}</i>{sale.customerName ?? t('cashCustomer')}</span></td>
                          <td>{new Date(sale.soldAt).toLocaleString(isArabic ? 'ar' : 'en')}</td>
                          <td className="amount-cell">{formatInvoiceMoney(sale.totalMinor, sale.currencyCode, sale.exchangeRateScaled)}</td>
                          <td><span className={`status-pill ${sale.status}`}>{t(sale.status)}</span></td>
                        </tr>
                      ))}
                      {dashboard?.recentSales.length === 0 && (
                        <tr><td colSpan={5} className="inventory-empty">{t('noTransactions')}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </section>
        ) : activePage === 'products' ? (
          <section className="page-content inventory-page">
            <div className="page-heading">
              <div>
                <h2>{t('productsHeading')}</h2>
                <p>{t('productsDescription')}</p>
              </div>
              <button className="primary-button" type="button" onClick={() => setActivePage('inventory')}>
                <Plus size={18} />
                {t('addProduct')}
              </button>
            </div>

            <div className="stats-grid report-stats catalog-stats">
              <article className="stat-card">
                <div className="stat-top"><span className="stat-icon mint"><Package size={19} /></span></div>
                <p>{t('catalogTotalProducts')}</p>
                <strong className="stat-value">{products.length}</strong>
                <span className="stat-note">{t('catalogRegisteredProducts')}</span>
              </article>
              <article className="stat-card">
                <div className="stat-top"><span className="stat-icon blue"><Boxes size={19} /></span></div>
                <p>{t('availableUnits')}</p>
                <strong className="stat-value">{products.reduce((sum, product) => sum + product.availableUnits, 0)}</strong>
                <span className="stat-note">{t('availableBaseUnits')}</span>
              </article>
              <article className="stat-card">
                <div className="stat-top"><span className="stat-icon rose"><Bell size={19} /></span></div>
                <p>{t('lowStockProducts')}</p>
                <strong className="stat-value">{lowStockProducts.length}</strong>
                <span className="stat-note">{t('lowStockNote')}</span>
              </article>
              <article className="stat-card">
                <div className="stat-top"><span className="stat-icon amber"><Activity size={19} /></span></div>
                <p>{t('expiringSoonHeading')}</p>
                <strong className="stat-value">{expiringProducts.length}</strong>
                <span className="stat-note">{t('catalogExpiryWindow')}</span>
              </article>
            </div>

            <section className="panel inventory-products catalog-panel">
              <div className="catalog-toolbar">
                <label className="product-search">
                  <Search size={17} />
                  <input
                    value={globalSearch}
                    onChange={(event) => setGlobalSearch(event.target.value)}
                    placeholder={t('searchProducts')}
                    aria-label={t('searchProducts')}
                  />
                </label>
                <div className="catalog-filters" role="group" aria-label={t('catalogFilters')}>
                  <button type="button" className={productCatalogFilter === 'all' ? 'catalog-filter is-active' : 'catalog-filter'} aria-pressed={productCatalogFilter === 'all'} onClick={() => setProductCatalogFilter('all')}>
                    {t('catalogAll')}
                    <span>{products.length}</span>
                  </button>
                  <button type="button" className={productCatalogFilter === 'low' ? 'catalog-filter is-active' : 'catalog-filter'} aria-pressed={productCatalogFilter === 'low'} onClick={() => setProductCatalogFilter('low')}>
                    {t('catalogLowStock')}
                    <span>{lowStockProducts.length}</span>
                  </button>
                  <button type="button" className={productCatalogFilter === 'expiring' ? 'catalog-filter is-active' : 'catalog-filter'} aria-pressed={productCatalogFilter === 'expiring'} onClick={() => setProductCatalogFilter('expiring')}>
                    {t('catalogExpiring')}
                    <span>{expiringProducts.length}</span>
                  </button>
                </div>
                <span className="catalog-result-count">{t('catalogShowing', { count: catalogProducts.length })}</span>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{t('product')}</th>
                      <th>{t('sku')}</th>
                      <th>{t('barcode')}</th>
                      <th>{t('baseUnit')}</th>
                      <th>{t('availableUnits')}</th>
                      <th>{t('reorderLevel')}</th>
                      <th>{t('nearestExpiry')}</th>
                      <th>{t('status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catalogProducts.map((product) => {
                      const isLow = product.availableUnits <= product.reorderLevelUnits
                      const expiryDays = product.nearestExpiryDate ? daysUntilExpiry(product.nearestExpiryDate) : Number.POSITIVE_INFINITY
                      return (
                        <tr key={product.id}>
                          <td><strong>{isArabic ? product.nameAr : product.nameEn}</strong><small>{isArabic ? product.nameEn : product.nameAr}</small></td>
                          <td><span className="catalog-code">{product.sku}</span></td>
                          <td>{product.barcode || '—'}</td>
                          <td>{product.baseUnit}</td>
                          <td><strong className={isLow ? 'stock-low' : 'stock-ok'}>{product.availableUnits}</strong></td>
                          <td>{product.reorderLevelUnits}</td>
                          <td>{product.nearestExpiryDate || '—'}</td>
                          <td><span className={isLow ? 'catalog-status is-low' : expiryDays <= 90 ? 'catalog-status is-expiring' : 'catalog-status is-ok'}>{isLow ? t('catalogLowStock') : expiryDays <= 90 && expiryDays >= 0 ? t('catalogExpiring') : t('catalogInStock')}</span></td>
                        </tr>
                      )
                    })}
                    {catalogProducts.length === 0 && (
                      <tr><td colSpan={8} className="inventory-empty">{products.length === 0 ? t('noProducts') : t('catalogNoMatches')}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </section>
        ) : activePage === 'inventory' ? (
          <section className="page-content inventory-page">
            <div className="page-heading">
              <div>
                <h2>{t('inventoryHeading')}</h2>
                <p>{t('inventoryDescription')}</p>
              </div>
              <button
                className="primary-button"
                type="button"
                onClick={() => void refreshProducts()}
                disabled={inventoryLoading}
              >
                {inventoryLoading ? t('loading') : t('refresh')}
              </button>
            </div>

            {expiringProducts.length > 0 && (
              <section className="panel expiry-alert-panel" aria-live="polite">
                <div className="panel-heading">
                  <div>
                    <h3>{t('expiringSoonHeading')}</h3>
                    <p>{t('expiringSoonDescription')}</p>
                  </div>
                  <span className="inventory-count expiry-count">{expiringProducts.length}</span>
                </div>
                <div className="expiry-alert-list">
                  {expiringProducts.map((product) => {
                    const days = daysUntilExpiry(product.nearestExpiryDate ?? '')
                    return (
                      <div className="expiry-alert-item" key={product.id}>
                        <div className="expiry-product-name">
                          <strong>{isArabic ? product.nameAr : product.nameEn}</strong>
                          <small>{product.sku}</small>
                        </div>
                        <span className="expiry-date">{product.nearestExpiryDate}</span>
                        <span className="expiry-days">{t('daysRemaining', { count: days })}</span>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {lowStockProducts.length > 0 && (
              <section className="panel low-stock-alert-panel" aria-live="polite">
                <div className="panel-heading">
                  <div>
                    <h3>{t('lowStockHeading')}</h3>
                    <p>{t('lowStockDescription')}</p>
                  </div>
                  <span className="inventory-count low-stock-count">{lowStockProducts.length}</span>
                </div>
                <div className="low-stock-alert-list">
                  {lowStockProducts.map((product) => (
                    <div className="low-stock-alert-item" key={product.id}>
                      <div className="expiry-product-name">
                        <strong>{isArabic ? product.nameAr : product.nameEn}</strong>
                        <small>{product.sku}</small>
                      </div>
                      <span className="low-stock-quantity">{t('stockQuantitySummary', {
                        available: product.availableUnits,
                        reorder: product.reorderLevelUnits,
                      })}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <div className="inventory-grid">
              <form className="panel inventory-form" onSubmit={createProduct}>
                <div className="panel-heading">
                  <div>
                    <h3>{t('addProduct')}</h3>
                    <p>{t('addProductDescription')}</p>
                  </div>
                </div>
                <label>
                  <span>{t('sku')}</span>
                  <input value={productSku} onChange={(event) => setProductSku(event.target.value)} required />
                </label>
                <label>
                  <span>{t('productNameAr')}</span>
                  <input value={productNameAr} onChange={(event) => setProductNameAr(event.target.value)} required />
                </label>
                <label>
                  <span>{t('productNameEn')}</span>
                  <input value={productNameEn} onChange={(event) => setProductNameEn(event.target.value)} required />
                </label>
                <label>
                  <span>{t('baseUnit')}</span>
                  <input value={baseUnit} onChange={(event) => setBaseUnit(event.target.value)} required />
                </label>
                <label>
                  <span>{t('barcodeOptional')}</span>
                  <input value={productBarcode} onChange={(event) => setProductBarcode(event.target.value)} />
                </label>
                <label>
                  <span>{t('reorderLevel')}</span>
                  <input type="number" min="0" step="1" value={reorderLevel} onChange={(event) => setReorderLevel(event.target.value)} required />
                </label>
                <label>
                  <span>{t('unitPrice')}</span>
                  <input type="number" min="0.01" step="0.01" value={productSalePrice} onChange={(event) => setProductSalePrice(event.target.value)} required />
                </label>
                <button className="primary-button" type="submit">{t('saveProduct')}</button>
              </form>

              <form className="panel inventory-form" onSubmit={receiveBatch}>
                <div className="panel-heading"><h3>{t('receiveBatch')}</h3></div>
                <label><span>{t('product')}</span><select value={batchProductId} onChange={(e) => setBatchProductId(e.target.value)} required><option value="">--</option>{products.map((product) => <option key={product.id} value={product.id}>{isArabic ? product.nameAr : product.nameEn}</option>)}</select></label>
                <label><span>{t('batchNumber')}</span><input value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} required /></label>
                <label><span>{t('expiryDate')}</span><input type="date" value={batchExpiry} onChange={(e) => setBatchExpiry(e.target.value)} required /></label>
                <label><span>{t('quantityUnits')}</span><input type="number" min="1" value={batchUnits} onChange={(e) => setBatchUnits(e.target.value)} required /></label>
                <button className="primary-button" type="submit">{t('saveBatch')}</button>
              </form>

              <section className="panel inventory-products">
                <div className="panel-heading">
                  <div>
                    <h3>{t('productList')}</h3>
                    <p>{t('productListDescription')}</p>
                  </div>
                  <span className="inventory-count">{products.length}</span>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>{t('product')}</th>
                        <th>{t('sku')}</th>
                        <th>{t('baseUnit')}</th>
                        <th>{t('unitPrice')}</th>
                        <th>{t('availableUnits')}</th>
                        <th>{t('reorderLevel')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((product) => (
                        <tr key={product.id}>
                          <td>
                            <strong>{isArabic ? product.nameAr : product.nameEn}</strong>
                            <small>{isArabic ? product.nameEn : product.nameAr}</small>
                          </td>
                          <td>{product.sku}</td>
                          <td>{product.baseUnit}</td>
                          <td>
                            <div className="product-price-editor">
                              <input
                                aria-label={`${t('unitPrice')} ${isArabic ? product.nameAr : product.nameEn}`}
                                type="number"
                                min="0"
                                step="0.01"
                                value={productPrices[product.id] ?? '0.00'}
                                onChange={(event) => setProductPrices((current) => ({
                                  ...current,
                                  [product.id]: event.target.value,
                                }))}
                              />
                              <button className="text-button" type="button" onClick={() => void saveProductPrice(product.id)}>{t('savePrice')}</button>
                            </div>
                          </td>
                          <td><span className={product.availableUnits <= product.reorderLevelUnits ? 'stock-low' : 'stock-ok'}>{product.availableUnits}</span></td>
                          <td>
                            <div className="product-reorder-editor">
                              <input
                                aria-label={`${t('reorderLevel')} ${isArabic ? product.nameAr : product.nameEn}`}
                                type="number"
                                min="0"
                                step="1"
                                value={productReorderLevels[product.id] ?? String(product.reorderLevelUnits)}
                                onChange={(event) => setProductReorderLevels((current) => ({ ...current, [product.id]: event.target.value }))}
                              />
                              <button className="text-button" type="button" onClick={() => void saveProductReorderLevel(product.id)}>{t('saveReorderLevel')}</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {products.length === 0 && !inventoryLoading && (
                        <tr>
                          <td colSpan={5} className="inventory-empty">{t('noProducts')}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="panel inventory-products batch-ledger">
                <div className="panel-heading">
                  <div>
                    <h3>{t('batchLedger')}</h3>
                    <p>{t('batchLedgerDescription')}</p>
                  </div>
                </div>
                {!batchProductId ? (
                  <p className="inventory-empty">{t('selectBatchProduct')}</p>
                ) : (
                  <div className="table-scroll">
                    <table>
                      <thead><tr><th>{t('batchNumber')}</th><th>{t('expiryDate')}</th><th>{t('availableUnits')}</th><th>{t('status')}</th></tr></thead>
                      <tbody>
                        {(batchBalanceResult?.productId === batchProductId ? batchBalanceResult.balances : []).map((batch) => {
                          const expired = batch.isExpired
                          return (
                            <tr key={batch.batchId}>
                              <td>{batch.batchNumber}</td>
                              <td>{batch.expiryDate}</td>
                              <td>{batch.availableUnits}</td>
                              <td><span className={expired ? 'stock-low' : 'stock-ok'}>{expired ? t('expired') : t('valid')}</span></td>
                            </tr>
                          )
                        })}
                        {(batchBalanceResult?.productId === batchProductId ? batchBalanceResult.balances : []).length === 0 && <tr><td colSpan={4} className="inventory-empty">{t('noBatchBalances')}</td></tr>}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          </section>
        ) : activePage === 'customers' ? (
          <section className="page-content inventory-page">
            <div className="page-heading">
              <div>
                <h2>{t('customersHeading')}</h2>
                <p>{t('customersDescription')}</p>
              </div>
            </div>
            <div className="stats-grid report-stats">
              <article className="stat-card"><p>{t('totalCustomers')}</p><strong className="stat-value">{customers.length}</strong></article>
              <article className="stat-card"><p>{t('matchingCustomers')}</p><strong className="stat-value">{filteredCustomers.length}</strong></article>
            </div>
            <div className="inventory-grid">
              <form className="panel inventory-form" onSubmit={createCustomer}>
                <div className="panel-heading"><h3>{t('addCustomer')}</h3></div>
                <label><span>{t('customerName')}</span><input value={customerName} onChange={(e) => setCustomerName(e.target.value)} required /></label>
                <label><span>{t('phone')}</span><input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} /></label>
                <button className="primary-button" type="submit">{t('saveCustomer')}</button>
              </form>
              <section className="panel inventory-products">
                <div className="panel-heading">
                  <div><h3>{t('customerDirectory')}</h3><p>{t('customerDirectoryDescription')}</p></div>
                  <span className="inventory-count">{filteredCustomers.length}</span>
                </div>
                <label className="product-search">
                  <Search size={17} />
                  <input value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} placeholder={t('searchCustomers')} aria-label={t('searchCustomers')} />
                </label>
                <div className="table-scroll">
                  <table>
                    <thead><tr><th>{t('customerName')}</th><th>{t('phone')}</th></tr></thead>
                    <tbody>
                      {filteredCustomers.map((customer) => <tr key={customer.id}><td><strong>{customer.name}</strong></td><td>{customer.phone || '—'}</td></tr>)}
                      {filteredCustomers.length === 0 && <tr><td colSpan={2} className="inventory-empty">{customerSearch ? t('noMatchingCustomers') : t('noCustomers')}</td></tr>}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </section>
        ) : activePage === 'purchases' ? (
          <section className="page-content inventory-page">
            <div className="page-heading"><div><h2>{t('purchasesHeading')}</h2><p>{t('purchasesDescription')}</p></div></div>
            <div className="stats-grid report-stats">
              <article className="stat-card"><p>{t('purchaseRecords')}</p><strong className="stat-value">{purchases.length}</strong></article>
              <article className="stat-card"><p>{t('filteredPurchases')}</p><strong className="stat-value">{filteredPurchases.length}</strong></article>
              <article className="stat-card"><p>{t('purchaseValue')}</p><strong className="stat-value">{formatMoney(purchases.reduce((sum, purchase) => sum + purchase.totalMinor, 0))}</strong></article>
              <article className="stat-card"><p>{t('receivedPurchases')}</p><strong className="stat-value">{receivedPurchaseCount}</strong></article>
            </div>
            <div className="inventory-grid">
              <form className="panel inventory-form" onSubmit={createPurchase}>
                <label><span>{t('purchaseReference')}</span><input value={purchaseReference} onChange={(e) => setPurchaseReference(e.target.value)} required /></label>
                <label><span>{t('supplierName')}</span><input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} required /></label>
                <label><span>{t('product')}</span><select value={purchaseProductId} onChange={(e) => setPurchaseProductId(e.target.value)} required><option value="">--</option>{products.map((product) => <option key={product.id} value={product.id}>{isArabic ? product.nameAr : product.nameEn}</option>)}</select></label>
                <label><span>{t('batchNumber')}</span><input value={purchaseBatchNumber} onChange={(e) => setPurchaseBatchNumber(e.target.value)} required /></label>
                <label><span>{t('expiryDate')}</span><input type="date" value={purchaseExpiry} onChange={(e) => setPurchaseExpiry(e.target.value)} required /></label>
                <label><span>{t('quantityUnits')}</span><input type="number" min="1" step="1" value={purchaseQuantity} onChange={(e) => setPurchaseQuantity(e.target.value)} required /></label>
                <label><span>{t('unitCost')}</span><input type="number" min="0" step="0.01" value={purchaseTotal} onChange={(e) => setPurchaseTotal(e.target.value)} required /></label>
                <button className="primary-button" type="submit">{t('savePurchaseAndStock')}</button>
              </form>
              <section className="panel inventory-products">
                <div className="panel-heading">
                  <div><h3>{t('purchaseHistory')}</h3><p>{t('purchaseHistoryDescription')}</p></div>
                  <span className="inventory-count">{filteredPurchases.length}</span>
                </div>
                <div className="catalog-toolbar">
                  <label className="product-search">
                    <Search size={17} />
                    <input value={purchaseSearch} onChange={(event) => setPurchaseSearch(event.target.value)} placeholder={t('searchPurchases')} aria-label={t('searchPurchases')} />
                  </label>
                  <div className="catalog-filters" role="group" aria-label={t('purchaseStatusFilter')}>
                    <button type="button" className={purchaseStatusFilter === 'all' ? 'catalog-filter is-active' : 'catalog-filter'} aria-pressed={purchaseStatusFilter === 'all'} onClick={() => setPurchaseStatusFilter('all')}>
                      {t('allPurchases')} <span>{purchases.length}</span>
                    </button>
                    <button type="button" className={purchaseStatusFilter === 'received' ? 'catalog-filter is-active' : 'catalog-filter'} aria-pressed={purchaseStatusFilter === 'received'} onClick={() => setPurchaseStatusFilter('received')}>
                      {t('receivedOnly')} <span>{receivedPurchaseCount}</span>
                    </button>
                  </div>
                </div>
                <div className="table-scroll"><table><thead><tr><th>{t('purchaseReference')}</th><th>{t('supplierName')}</th><th>{t('amount')}</th><th>{t('status')}</th></tr></thead>
                  <tbody>{filteredPurchases.map((purchase) => (
                    <tr key={purchase.id}><td><strong>{purchase.referenceNumber}</strong></td><td>{purchase.supplierName}</td><td>{formatMoney(purchase.totalMinor)}</td><td><span className={`status-pill ${purchase.status}`}>{t(purchase.status)}</span></td></tr>
                  ))}
                  {filteredPurchases.length === 0 && <tr><td colSpan={4} className="inventory-empty">{purchaseSearch ? t('noMatchingPurchases') : t('noPurchases')}</td></tr>}</tbody>
                </table></div>
              </section>
            </div>
          </section>
        ) : activePage === 'settings' ? (
          <section className="page-content inventory-page">
            <div className="page-heading"><div><h2>{t('settingsHeading')}</h2><p>{t('settingsDescription')}</p></div></div>
            <form className="panel inventory-form pharmacy-settings-form" onSubmit={saveSetting}>
              <label><span>{t('pharmacyName')}</span><input value={pharmacyName} onChange={(e) => setPharmacyName(e.target.value)} required /></label>
              <label><span>{t('pharmacyAddress')}</span><input value={pharmacyAddress} onChange={(e) => setPharmacyAddress(e.target.value)} /></label>
              <label><span>{t('phone')}</span><input type="tel" value={pharmacyPhone} onChange={(e) => setPharmacyPhone(e.target.value)} /></label>
              <label><span>{t('pharmacyTaxNumber')}</span><input value={pharmacyTaxNumber} onChange={(e) => setPharmacyTaxNumber(e.target.value)} /></label>
              <label>
                <span>{t('taxRate')}</span>
                <input type="number" min="0" max="100" step="0.01" value={pharmacyTaxRate} onChange={(event) => setPharmacyTaxRate(event.target.value)} />
              </label>
              <div className="global-currency-settings">
                <label>
                  <span>{t('defaultCurrency')}</span>
                  <select
                    value={saleCurrencyCode}
                    onChange={(event) => {
                      setSaleCurrencyCode(event.target.value)
                    }}
                  >
                    {currencies.map((currency) => (
                      <option key={currency.code} value={currency.code}>
                        {currency.code} · {new Intl.DisplayNames([isArabic ? 'ar' : 'en'], { type: 'currency' }).of(currency.code) ?? currency.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="logo-upload">
                <span>{t('pharmacyLogo')}</span>
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => handleLogoUpload(event.target.files?.[0])} />
                {pharmacyLogo && <img className="logo-preview" src={pharmacyLogo} alt={t('pharmacyLogo')} />}
              </label>
              {pharmacyLogo && <button className="text-button" type="button" onClick={() => setPharmacyLogo('')}>{t('removeLogo')}</button>}
              <button className="primary-button" type="submit">{t('saveSettings')}</button>
            </form>
            {isTauri() && (
              <section className="panel updater-settings-panel">
                <div className="panel-heading">
                  <div><h3>{t('appUpdates')}</h3><p>{t('updateCheckDescription')}</p></div>
                  <button className="primary-button" type="button" onClick={() => void checkForUpdate()} disabled={updateStatus === 'checking' || updateStatus === 'downloading'}>
                    {updateStatus === 'checking' ? t('checkingUpdates') : t('checkForUpdates')}
                  </button>
                </div>
                {updateStatus === 'checking' && <p role="status">{t('checkingUpdates')}</p>}
                {updateError && <p className="stock-warning" role="alert">{updateError}</p>}
                {!updateError && availableUpdate && <p role="status">{t('updateAvailable', { version: availableUpdate.version })}</p>}
                {!updateError && !availableUpdate && updateChecked && updateStatus === 'idle' && <p role="status">{t('upToDate')}</p>}
              </section>
            )}
            <section className="panel printer-settings-panel">
              <div className="panel-heading">
                <div><h3>{t('thermalPrinterSettings')}</h3><p>{t('thermalPrinterDescription')}</p></div>
                <div className="printer-toolbar">
                  <select
                    aria-label={t('savedPrinters')}
                    value={printerForm.id ?? ''}
                    onChange={(event) => {
                      const selected = printers.find((printer) => printer.id === Number(event.target.value))
                      setPrinterForm(selected ?? emptyPrinter)
                      if (selected) {
                        setReceiptPrinterId(selected.id)
                        setReceiptWidth(selected.paperWidth)
                      }
                    }}
                  >
                    <option value="">{t('newPrinter')}</option>
                    {printers.map((printer) => <option key={printer.id ?? printer.name} value={printer.id ?? ''}>{printer.name}{printer.isDefault ? ` · ${t('defaultPrinter')}` : ''}</option>)}
                  </select>
                  <button className="text-button" type="button" onClick={() => setPrinterForm(emptyPrinter)}>{t('newPrinter')}</button>
                </div>
              </div>
              <div className="printer-discovery-row">
                <div className="printer-discovery-actions">
                  <button className="text-button" type="button" onClick={() => void discoverUsbPrinters()} disabled={printerBusy}>
                    <Search size={15} />{t('discoverUsbPrinters')}
                  </button>
                  <button className="text-button" type="button" onClick={() => void discoverNetworkPrinters()} disabled={printerBusy}>
                    <Search size={15} />{t('discoverNetworkPrinters')}
                  </button>
                </div>
                <span>{t('usbDiscoveryNote')}</span>
              </div>
              {usbPrinters.length > 0 && (
                <div className="usb-device-list">
                  {usbPrinters.map((device) => (
                    <button
                      className="text-button"
                      key={`${device.vendorId}-${device.productId}`}
                      type="button"
                      onClick={() => setPrinterForm((current) => ({
                        ...current,
                        name: current.name || device.name,
                        connectionType: 'usb',
                        vendorId: device.vendorId,
                        productId: device.productId,
                      }))}
                    >
                      {device.name} <small>{device.vendorId.toString(16).padStart(4, '0')}:{device.productId.toString(16).padStart(4, '0')}</small>
                    </button>
                  ))}
                </div>
              )}
              {networkPrinters.length > 0 && (
                <div className="usb-device-list">
                  {networkPrinters.map((device) => (
                    <button
                      className="text-button"
                      key={`${device.host}-${device.port}`}
                      type="button"
                      onClick={() => setPrinterForm((current) => ({
                        ...current,
                        name: current.name || device.name,
                        connectionType: 'network',
                        host: device.host,
                        port: device.port,
                      }))}
                    >
                      {device.name} <small>{device.host}:{device.port}</small>
                    </button>
                  ))}
                </div>
              )}
              <form className="printer-config-form" onSubmit={(event) => void savePrinterSettings(event)}>
                <label><span>{t('printerName')}</span><input value={printerForm.name} onChange={(event) => setPrinterForm((current) => ({ ...current, name: event.target.value }))} maxLength={100} required /></label>
                <label><span>{t('connectionType')}</span>
                  <select value={printerForm.connectionType} onChange={(event) => setPrinterForm((current) => ({ ...current, connectionType: event.target.value as PrinterConfig['connectionType'] }))}>
                    <option value="usb">{t('usb')}</option><option value="network">{t('ethernet')}</option>
                  </select>
                </label>
                {printerForm.connectionType === 'usb' ? (
                  <>
                    <label><span>{t('usbVendorId')}</span><input type="number" min="0" max="65535" value={printerForm.vendorId ?? ''} onChange={(event) => setPrinterForm((current) => ({ ...current, vendorId: event.target.value === '' ? null : Number(event.target.value) }))} required /></label>
                    <label><span>{t('usbProductId')}</span><input type="number" min="0" max="65535" value={printerForm.productId ?? ''} onChange={(event) => setPrinterForm((current) => ({ ...current, productId: event.target.value === '' ? null : Number(event.target.value) }))} required /></label>
                  </>
                ) : (
                  <>
                    <label><span>{t('printerIp')}</span><input value={printerForm.host ?? ''} onChange={(event) => setPrinterForm((current) => ({ ...current, host: event.target.value || null }))} placeholder="192.168.1.100" required /></label>
                    <label><span>{t('printerPort')}</span><input type="number" min="1" max="65535" value={printerForm.port ?? 9100} onChange={(event) => setPrinterForm((current) => ({ ...current, port: Number(event.target.value) || null }))} required /></label>
                  </>
                )}
                <label><span>{t('paperWidth')}</span>
                  <select value={printerForm.paperWidth} onChange={(event) => setPrinterForm((current) => ({ ...current, paperWidth: event.target.value as PrinterConfig['paperWidth'] }))}>
                    <option value="80mm">{t('paper80mm')}</option><option value="58mm">{t('paper58mm')}</option>
                  </select>
                </label>
                <label><span>{t('printResolution')}</span>
                  <select value={printerForm.dpi} onChange={(event) => setPrinterForm((current) => ({ ...current, dpi: Number(event.target.value) as PrinterConfig['dpi'] }))}>
                    <option value={203}>203 DPI</option><option value={300}>300 DPI</option>
                  </select>
                </label>
                <label><span>{t('printCopies')}</span><input type="number" min="1" max="5" value={printerForm.copies} onChange={(event) => setPrinterForm((current) => ({ ...current, copies: Number(event.target.value) || 1 }))} /></label>
                <label><span>{t('receiptFontSize')}</span><input type="number" min="8" max="32" value={printerForm.fontSize} onChange={(event) => setPrinterForm((current) => ({ ...current, fontSize: Number(event.target.value) || 12 }))} /></label>
                <label className="printer-checkbox"><input type="checkbox" checked={printerForm.autoCut} onChange={(event) => setPrinterForm((current) => ({ ...current, autoCut: event.target.checked }))} /><span>{t('autoCutPaper')}</span></label>
                <label className="printer-checkbox"><input type="checkbox" checked={printerForm.autoPrint} onChange={(event) => setPrinterForm((current) => ({ ...current, autoPrint: event.target.checked }))} /><span>{t('autoPrint')}</span></label>
                <label className="printer-checkbox"><input type="checkbox" checked={printerForm.printLogo} onChange={(event) => setPrinterForm((current) => ({ ...current, printLogo: event.target.checked }))} /><span>{t('printPharmacyLogo')}</span></label>
                <label className="printer-checkbox"><input type="checkbox" checked={printerForm.isDefault} onChange={(event) => setPrinterForm((current) => ({ ...current, isDefault: event.target.checked }))} /><span>{t('setAsDefaultPrinter')}</span></label>
                <div className="printer-form-actions">
                  <button className="primary-button" type="submit" disabled={printerBusy}>{t('savePrinter')}</button>
                  <button className="text-button" type="button" onClick={() => void testPrint()} disabled={printerBusy || !printerForm.id}>{t('testPrint')}</button>
                  {printerForm.id && <button className="danger-button" type="button" onClick={() => void deletePrinter()} disabled={printerBusy}>{t('removePrinter')}</button>}
                </div>
              </form>
              {printNotice && <p className="printer-notice" role="status">{printNotice}</p>}
            </section>
            <div className="thermal-test-source" aria-hidden="true">
              <div ref={testReceiptRef} className={`print-receipt receipt-${printerForm.paperWidth}`} dir={isArabic ? 'rtl' : 'ltr'}>
                <header className="receipt-header">
                  {printerForm.printLogo && pharmacyLogo && <img className="receipt-logo" src={pharmacyLogo} alt="" />}
                  <div className="receipt-pharmacy"><h2>{pharmacyName || t('pharmacyName')}</h2>{pharmacyAddress && <p>{pharmacyAddress}</p>}{pharmacyPhone && <p>{pharmacyPhone}</p>}</div>
                </header>
                <h3 className="printer-test-title">{t('testPrint')}</h3>
                <p>{t('printerArabicSample')}</p>
                <p>{printerTestTime.toLocaleString(isArabic ? 'ar' : 'en')}</p>
                <div className="receipt-code-preview"><Barcode value="TEST-12345" height={32} width={1} fontSize={10} displayValue /></div>
                <div className="receipt-code-preview"><QRCodeSVG value="Dawai thermal printer test" size={76} /></div>
                <footer className="receipt-footer">{t('printerTestFooter')}</footer>
              </div>
            </div>
          </section>
        ) : activePage === 'sales' || activePage === 'reports' ? (
          <section className="page-content inventory-page">
            <div className="page-heading"><div><h2>{activeTitle}</h2><p>{t('operationalDataDescription')}</p></div></div>
            {activePage === 'reports' && (
              <>
                <div className="report-toolbar">
                  <label className="report-period-control">
                    <span>{t('reportPeriod')}</span>
                    <select aria-label={t('reportPeriod')} value={reportPeriod} onChange={(event) => setReportPeriod(event.target.value as '7d' | '30d' | 'all')}>
                      <option value="7d">{t('last7Days')}</option>
                      <option value="30d">{t('last30Days')}</option>
                      <option value="all">{t('allDates')}</option>
                    </select>
                  </label>
                  <label className="product-search report-search">
                    <Search size={17} />
                    <input aria-label={t('searchInvoices')} value={reportSearch} onChange={(event) => setReportSearch(event.target.value)} placeholder={t('searchInvoices')} />
                  </label>
                  <span className="report-currency-note">{t('reportCurrencyNote', { currency: saleCurrencyCode })}</span>
                </div>
                <div className="stats-grid report-stats">
                  <article className="stat-card"><p>{t('paidSalesTotal')}</p><strong className="stat-value">{formatMoney(paidReportTotal)}</strong><span className="stat-note">{t('selectedPeriod')}</span></article>
                  <article className="stat-card"><p>{t('invoiceCount')}</p><strong className="stat-value">{filteredReportSales.length}</strong><span className="stat-note">{t('matchingInvoices')}</span></article>
                  <article className="stat-card"><p>{t('averageInvoiceValue')}</p><strong className="stat-value">{formatMoney(averageReportSale)}</strong><span className="stat-note">{t('paidInvoicesOnly')}</span></article>
                  <article className="stat-card"><p>{t('unpaidInvoices')}</p><strong className="stat-value">{filteredReportSales.filter((sale) => sale.status !== 'paid').length}</strong><span className="stat-note">{t('reviewRequired')}</span></article>
                </div>
              </>
            )}
            {activePage === 'sales' && (
              <>
                <div className="pos-layout">
                  <section className="panel pos-catalog">
                    <div className="panel-heading">
                      <div><h3>{t('posProducts')}</h3><p>{t('posProductsDescription')}</p></div>
                      <span className="inventory-count">{products.length}</span>
                    </div>
                    <label className="product-search sale-search">
                      <Search size={18} />
                      <input
                        ref={saleSearchRef}
                        aria-label={t('searchProducts')}
                        value={saleSearch}
                        onChange={(event) => setSaleSearch(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter') return
                          event.preventDefault()
                          const query = saleSearch.trim().toLocaleLowerCase()
                          const exact = products.find((product) =>
                            product.barcode?.toLocaleLowerCase() === query
                            || product.sku.toLocaleLowerCase() === query)
                          const matches = products.filter((product) =>
                            [product.nameAr, product.nameEn, product.sku, product.barcode ?? '']
                              .some((value) => value.toLocaleLowerCase().includes(query)))
                          const selectedProduct = exact ?? (matches.length === 1 ? matches[0] : undefined)
                          if (selectedProduct) {
                            addToSaleCart(selectedProduct.id)
                            setSaleSearch('')
                          }
                        }}
                        placeholder={t('searchProducts')}
                      />
                      <kbd>F2</kbd>
                    </label>
                    <label className="product-search barcode-search">
                      <ScanLine size={18} />
                      <input
                        ref={saleBarcodeRef}
                        aria-label={t('scanBarcode')}
                        value={saleBarcode}
                        onChange={(event) => setSaleBarcode(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            addScannedBarcode(saleBarcode)
                          }
                        }}
                        placeholder={t('scanBarcode')}
                      />
                    </label>
                    <div className="pos-product-table table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>{t('product')}</th>
                            <th>{t('barcode')}</th>
                            <th>{t('unitPrice')}</th>
                            <th>{t('availableUnits')}</th>
                            <th>{t('nearestExpiry')}</th>
                            <th>{t('addToInvoice')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {products.filter((product) => {
                            const query = saleSearch.trim().toLocaleLowerCase()
                            return !query || [product.nameAr, product.nameEn, product.sku, product.barcode ?? '']
                              .some((value) => value.toLocaleLowerCase().includes(query))
                          }).map((product) => (
                            <tr key={product.id}>
                              <td>
                                <strong>{isArabic ? product.nameAr : product.nameEn}</strong>
                                <small>{product.sku}</small>
                              </td>
                              <td>{product.barcode || '—'}</td>
                              <td>{formatInvoiceMoney(product.salePriceMinor)}</td>
                              <td>
                                <span className={product.availableUnits <= product.reorderLevelUnits ? 'stock-low' : 'stock-ok'}>
                                  {product.availableUnits}
                                </span>
                                {product.availableUnits <= product.reorderLevelUnits && <small className="stock-warning">{t('stockLow')}</small>}
                              </td>
                              <td>{product.nearestExpiryDate || '—'}</td>
                              <td>
                                <button
                                  className="icon-button pos-add-button"
                                  type="button"
                                  aria-label={`${t('addToInvoice')} ${isArabic ? product.nameAr : product.nameEn}`}
                                  onClick={() => addToSaleCart(product.id)}
                                  disabled={product.availableUnits === 0 || product.salePriceMinor <= 0}
                                >
                                  <Plus size={17} />
                                </button>
                              </td>
                            </tr>
                          ))}
                          {products.length === 0 && !inventoryLoading && (
                            <tr><td colSpan={6} className="inventory-empty">{t('noProducts')}</td></tr>
                          )}
                          {products.length > 0 && !products.some((product) => {
                            const query = saleSearch.trim().toLocaleLowerCase()
                            return !query || [product.nameAr, product.nameEn, product.sku, product.barcode ?? '']
                              .some((value) => value.toLocaleLowerCase().includes(query))
                          }) && (
                            <tr><td colSpan={6} className="inventory-empty">{t('noSearchResults')}</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>
                  <form ref={saleFormRef} className="panel pos-cart" onSubmit={createSale}>
                    <div className="panel-heading pos-invoice-heading">
                      <div><h3>{t('currentSale')}</h3><p>{t('invoiceNumberPending')}</p></div>
                      <button className="text-button clear-invoice-button" type="button" onClick={() => setClearInvoiceOpen(true)} disabled={!saleCart.length}>
                        <Trash2 size={16} />{t('clearInvoice')}
                      </button>
                    </div>
                    <div className="invoice-meta">
                      <div><span>{t('invoice')}</span><strong>—</strong></div>
                      <div><span>{t('invoiceTime')}</span><strong>{saleStartedAt.toLocaleString(isArabic ? 'ar' : 'en')}</strong></div>
                    </div>
                    <div className="customer-picker">
                      <label>
                        <span>{t('customer')}</span>
                        <select ref={saleCustomerRef} value={saleCustomerId} onChange={(event) => setSaleCustomerId(event.target.value)}>
                          <option value="">{t('cashCustomer')}</option>
                          {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                        </select>
                      </label>
                      <button className="icon-button" type="button" aria-label={t('addCustomerInline')} onClick={() => {
                        setQuickCustomerOpen(true)
                        window.setTimeout(() => quickCustomerInputRef.current?.focus(), 0)
                      }}>
                        <UserRoundPlus size={18} />
                      </button>
                    </div>
                    {quickCustomerOpen && (
                      <div className="quick-customer-form">
                        <label><span>{t('customerName')}</span><input ref={quickCustomerInputRef} value={quickCustomerName} onChange={(event) => setQuickCustomerName(event.target.value)} required /></label>
                        <label><span>{t('phone')}</span><input type="tel" value={quickCustomerPhone} onChange={(event) => setQuickCustomerPhone(event.target.value)} /></label>
                        <div className="quick-customer-actions">
                          <button className="text-button" type="button" onClick={() => setQuickCustomerOpen(false)}>{t('cancel')}</button>
                          <button className="primary-button" type="button" onClick={() => void createQuickCustomer()}>{t('addCustomerInline')}</button>
                        </div>
                      </div>
                    )}
                    <div className="pos-cart-items table-scroll">
                      <table className="invoice-items-table">
                        <thead>
                          <tr><th>{t('product')}</th><th>{t('quantityUnits')}</th><th>{t('unitPrice')}</th><th>{t('lineDiscount')}</th><th>{t('amount')}</th><th aria-label={t('removeItem')} /></tr>
                        </thead>
                        <tbody>
                          {saleCart.map((line) => {
                            const product = products.find((entry) => entry.id === line.productId)
                            if (!product) return null
                            const lineSubtotal = line.quantity * product.salePriceMinor
                            const lineDiscount = Math.round(lineSubtotal * line.discountBasisPoints / 10000)
                            const lineTotal = lineSubtotal - lineDiscount
                            return (
                              <tr
                                key={line.productId}
                                className={selectedSaleProductId === line.productId ? 'is-selected' : ''}
                                onClick={() => setSelectedSaleProductId(line.productId)}
                                onFocus={() => setSelectedSaleProductId(line.productId)}
                              >
                                <td><strong>{isArabic ? product.nameAr : product.nameEn}</strong><small>{product.sku}</small></td>
                                <td>
                                  <input
                                    className="quantity-input"
                                    aria-label={`${t('quantityUnits')} ${isArabic ? product.nameAr : product.nameEn}`}
                                    type="number"
                                    min="1"
                                    max={product.availableUnits}
                                    step="1"
                                    value={line.quantity}
                                    onChange={(event) => {
                                      const quantity = event.target.value === ''
                                        ? 0
                                        : Math.min(product.availableUnits, Math.max(0, Number(event.target.value) || 0))
                                      setSaleCart((current) => current.map((entry) => entry.productId === line.productId ? { ...entry, quantity } : entry))
                                    }}
                                    onBlur={() => {
                                      if (line.quantity < 1) setSaleCart((current) => current.map((entry) => entry.productId === line.productId ? { ...entry, quantity: 1 } : entry))
                                    }}
                                  />
                                </td>
                                <td>{formatInvoiceMoney(product.salePriceMinor)}</td>
                                <td>
                                  <input
                                    className="discount-input"
                                    aria-label={`${t('lineDiscount')} ${isArabic ? product.nameAr : product.nameEn}`}
                                    type="number"
                                    min="0"
                                    max="99.99"
                                    step="0.01"
                                    value={(line.discountBasisPoints / 100).toString()}
                                    onChange={(event) => {
                                      const discountBasisPoints = Math.max(0, Math.min(9999, Math.round((Number(event.target.value) || 0) * 100)))
                                      setSaleCart((current) => current.map((entry) => entry.productId === line.productId
                                        ? { ...entry, discountBasisPoints }
                                        : entry))
                                    }}
                                  />
                                </td>
                                <td><strong>{formatInvoiceMoney(lineTotal)}</strong></td>
                                <td>
                                  <button className="icon-button remove-item-button" type="button" aria-label={`${t('removeItem')} ${isArabic ? product.nameAr : product.nameEn}`} onClick={() => setRemoveProductId(product.id)}>
                                    <X size={15} />
                                  </button>
                                </td>
                              </tr>
                            )
                          })}
                          {saleCart.length === 0 && <tr><td colSpan={6} className="inventory-empty">{t('emptySaleCart')}</td></tr>}
                        </tbody>
                      </table>
                    </div>
                    <div className="invoice-summary">
                      <div><span>{t('itemCount')}</span><strong>{saleCart.length}</strong></div>
                      <div><span>{t('totalQuantity')}</span><strong>{saleCart.reduce((sum, line) => sum + line.quantity, 0)}</strong></div>
                      <div><span>{t('subtotal')}</span><strong>{formatInvoiceMoney(invoiceAmounts.subtotal)}</strong></div>
                      <div><span>{t('discounts')}</span><strong>{formatInvoiceMoney(invoiceAmounts.discount)}</strong></div>
                      <div><span>{t('vat')} ({(taxRateBasisPoints / 100).toFixed(2)}%)</span><strong>{formatInvoiceMoney(invoiceTaxMinor)}</strong></div>
                      <div className="invoice-grand-total"><span>{t('netTotal')}</span><strong>{formatCurrencyMinor(invoiceTotalMinor, saleCurrencyCode)}</strong></div>
                    </div>
                    <section className="payment-section" ref={paymentSectionRef} tabIndex={-1}>
                      <div className="payment-heading"><h4>{t('paymentMethods')}</h4><kbd>F4</kbd></div>
                      <div className="currency-settings">
                        <div className="active-currency-display">
                          <span>{t('currency')}</span>
                          <strong>{saleCurrencyCode} · {new Intl.DisplayNames([isArabic ? 'ar' : 'en'], { type: 'currency' }).of(saleCurrencyCode) ?? saleCurrencyCode}</strong>
                          <small>{t('currencyManagedInSettings')}</small>
                        </div>
                      </div>
                      <div className="payment-methods">
                        {(['cash', 'card', 'bank_transfer', 'mixed'] as PaymentMethod[]).map((method) => {
                          const Icon = method === 'cash' ? DollarSign : method === 'card' ? CreditCard : method === 'bank_transfer' ? Landmark : ScanLine
                          return (
                            <button
                              className={`payment-method ${paymentMethod === method ? 'is-active' : ''}`}
                              type="button"
                              key={method}
                              aria-pressed={paymentMethod === method}
                              onClick={() => setPaymentMethod(method)}
                            >
                              <Icon size={17} /><span>{t(method === 'bank_transfer' ? 'bankTransfer' : method === 'mixed' ? 'mixedPayment' : method)}</span>
                            </button>
                          )
                        })}
                      </div>
                      {paymentMethod === 'mixed' ? (
                        <div className="mixed-payment-fields">
                          {paymentMethods.map((method) => (
                            <label key={method}>
                              <span>{t(method === 'bank_transfer' ? 'bankTransfer' : method)}</span>
                              <input data-payment-field type="number" min="0" step="any" value={paymentAmounts[method]} onChange={(event) => setPaymentAmounts((current) => ({ ...current, [method]: event.target.value }))} />
                            </label>
                          ))}
                        </div>
                      ) : (
                        <label className="payment-amount-field">
                          <span>{t('paidAmount')}</span>
                          <input
                            type="number"
                            data-payment-field
                            min="0"
                            step="any"
                            value={paymentAmounts[paymentMethod]}
                            placeholder={(invoiceTotalMinor / (10 ** invoiceCurrencyExponent)).toFixed(invoiceCurrencyExponent)}
                            onChange={(event) => setPaymentAmounts((current) => ({ ...current, [paymentMethod]: event.target.value }))}
                          />
                        </label>
                      )}
                      <div className="payment-balance">
                        <div><span>{t('remainingAmount')}</span><strong>{formatCurrencyMinor(remainingMinor, saleCurrencyCode)}</strong></div>
                        <div><span>{t('changeDue')}</span><strong>{formatCurrencyMinor(changeMinor, saleCurrencyCode)}</strong></div>
                      </div>
                    </section>
                    <button className="primary-button complete-sale-button" type="submit" disabled={saleSubmitting || !saleCart.length || saleCart.some((line) => line.quantity < 1) || paymentTotalMinor < invoiceTotalMinor}>
                      {saleSubmitting ? t('loading') : t('completeSale')}<span>F8</span>
                    </button>
                  </form>
                </div>
                {saleReceipt && (
                  <section className="panel receipt-panel">
                    <div className="receipt-actions">
                      <h3>{t('saleSaved')}: {saleReceipt.invoiceNumber}</h3>
                      <label><span>{t('printWidth')}</span><select value={receiptWidth} disabled={printerBusy} onChange={(event) => setReceiptWidth(event.target.value as typeof receiptWidth)}>
                        <option value="a4">{t('paperA4')}</option><option value="80mm">{t('paper80mm')}</option><option value="58mm">{t('paper58mm')}</option>
                      </select></label>
                      <button className="primary-button" type="button" onClick={() => void printInvoice()} disabled={printerBusy}><Printer size={16} />{t('printInvoice')}</button>
                    </div>
                    <div
                      ref={receiptRef}
                      className={`print-receipt receipt-${receiptWidth}`}
                      dir={isArabic ? 'rtl' : 'ltr'}
                      style={{
                        width: receiptPreviewWidth,
                        maxWidth: receiptPreviewWidth,
                        padding: receiptWidth === 'a4' ? undefined : '8px',
                        fontSize: `${receiptPrinter?.fontSize ?? 12}px`,
                      }}
                    >
                      <header className="receipt-header">
                        {(receiptWidth === 'a4' || receiptPrinter?.printLogo) && pharmacyLogo && <img className="receipt-logo" src={pharmacyLogo} alt={t('pharmacyLogo')} />}
                        <div className="receipt-pharmacy">
                          <h2>{pharmacyName || t('pharmacyName')}</h2>
                          {pharmacyAddress && <p>{pharmacyAddress}</p>}
                          {pharmacyPhone && <p>{t('phone')}: {pharmacyPhone}</p>}
                          {pharmacyTaxNumber && <p>{t('pharmacyTaxNumber')}: {pharmacyTaxNumber}</p>}
                        </div>
                      </header>
                      <div className="receipt-meta">
                        <div><span>{t('invoice')}</span><strong>{saleReceipt.invoiceNumber}</strong></div>
                        <div><span>{t('date')}</span><strong>{new Date(saleReceipt.soldAt).toLocaleString(isArabic ? 'ar' : 'en')}</strong></div>
                        <div><span>{t('customer')}</span><strong>{saleReceipt.customerName ?? t('cashCustomer')}</strong></div>
                        <div><span>{t('paymentMethod')}</span><strong>{saleReceipt.payments.map((payment) => t(payment.method === 'bank_transfer' ? 'bankTransfer' : payment.method)).join(' · ')}</strong></div>
                      </div>
                      <div className="table-scroll receipt-items-scroll"><table className="receipt-items">
                        <thead><tr><th>{t('product')}</th><th>{t('discounts')}</th><th>{t('amount')}</th></tr></thead>
                        <tbody>{saleReceipt.items.map((item, index) => (
                          <tr key={`${item.productNameAr}-${index}`}>
                            <td>
                              <strong>{isArabic ? item.productNameAr : item.productNameEn}</strong>
                              <small>{item.quantity} × {formatInvoiceMoney(item.unitPriceMinor, saleReceipt.currencyCode, saleReceipt.exchangeRateScaled)}</small>
                            </td>
                            <td>{formatInvoiceMoney(item.discountMinor, saleReceipt.currencyCode, saleReceipt.exchangeRateScaled)}</td>
                            <td><strong>{formatInvoiceMoney(item.lineTotalMinor, saleReceipt.currencyCode, saleReceipt.exchangeRateScaled)}</strong></td>
                          </tr>
                        ))}</tbody>
                      </table></div>
                      <div className="receipt-totals">
                        <p>{t('subtotal')}: {formatInvoiceMoney(saleReceipt.subtotalMinor, saleReceipt.currencyCode, saleReceipt.exchangeRateScaled)}</p>
                        <p>{t('discounts')}: {formatInvoiceMoney(saleReceipt.discountMinor, saleReceipt.currencyCode, saleReceipt.exchangeRateScaled)}</p>
                        <p>{t('vat')} ({(saleReceipt.taxRateBasisPoints / 100).toFixed(2)}%): {formatInvoiceMoney(saleReceipt.taxMinor, saleReceipt.currencyCode, saleReceipt.exchangeRateScaled)}</p>
                        <h3>{t('total')}: {formatInvoiceMoney(saleReceipt.totalMinor, saleReceipt.currencyCode, saleReceipt.exchangeRateScaled)}</h3>
                        <p>{t('paidAmount')}: {formatCurrencyMinor(receiptPaidMinor, saleReceipt.currencyCode)}</p>
                        {receiptChangeMinor > 0 && <p>{t('changeDue')}: {formatCurrencyMinor(receiptChangeMinor, saleReceipt.currencyCode)}</p>}
                      </div>
                      <div className="receipt-code-row">
                        <div className="receipt-code-preview"><Barcode value={saleReceipt.invoiceNumber} height={36} width={1} fontSize={9} displayValue /></div>
                        <div className="receipt-code-preview"><QRCodeSVG value={saleReceipt.invoiceNumber} size={72} /></div>
                      </div>
                      <footer className="receipt-footer">{isArabic ? 'شكرًا لزيارتكم' : 'Thank you for your visit'}</footer>
                    </div>
                    {printNotice && <p className="printer-notice" role="status">{printNotice}</p>}
                  </section>
                )}
                {clearInvoiceOpen && (
                  <div className="pos-modal-backdrop" role="presentation" onMouseDown={(event) => {
                    if (event.target === event.currentTarget) setClearInvoiceOpen(false)
                  }}>
                    <div className="pos-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="clear-invoice-title">
                      <h3 id="clear-invoice-title">{t('clearInvoice')}</h3>
                      <p>{t('confirmClearInvoice')}</p>
                      <div><button className="text-button" type="button" onClick={() => setClearInvoiceOpen(false)}>{t('cancel')}</button><button className="danger-button" type="button" onClick={clearSaleInvoice}>{t('confirm')}</button></div>
                    </div>
                  </div>
                )}
                {removeProductId !== null && (
                  <div className="pos-modal-backdrop" role="presentation" onMouseDown={(event) => {
                    if (event.target === event.currentTarget) setRemoveProductId(null)
                  }}>
                    <div className="pos-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="remove-item-title">
                      <h3 id="remove-item-title">{t('removeItem')}</h3>
                      <p>{t('confirmRemoveItem')}</p>
                      <div><button className="text-button" type="button" onClick={() => setRemoveProductId(null)}>{t('cancel')}</button><button className="danger-button" type="button" onClick={() => removeSaleItem(removeProductId)}>{t('confirm')}</button></div>
                    </div>
                  </div>
                )}
              </>
            )}
            <section className="panel inventory-products">
              <div className="panel-heading"><h3>{t('invoiceHistory')}</h3></div>
              <div className="table-scroll"><table><thead><tr><th>{t('invoice')}</th><th>{t('customer')}</th><th>{t('date')}</th><th>{t('amount')}</th><th>{t('paymentMethod')}</th><th>{t('status')}</th><th>{t('viewDetails')}</th></tr></thead>
                <tbody>{(activePage === 'reports' ? filteredReportSales : sales).map((sale) => (
                  <tr key={sale.id}>
                    <td>{sale.invoiceNumber}</td><td>{sale.customerName ?? t('cashCustomer')}</td>
                    <td>{new Date(sale.soldAt).toLocaleString(isArabic ? 'ar' : 'en')}</td>
                    <td>{formatInvoiceMoney(sale.totalMinor, sale.currencyCode, sale.exchangeRateScaled)}</td>
                    <td>{sale.paymentMethod ? t(sale.paymentMethod === 'bank_transfer' ? 'bankTransfer' : sale.paymentMethod === 'mixed' ? 'mixedPayment' : sale.paymentMethod) : '—'}</td>
                    <td>{t(sale.status)}</td>
                    <td><button className="icon-button" type="button" aria-label={`${t('viewDetails')} ${sale.invoiceNumber}`} onClick={() => void showSaleDetails(sale.id)}><Eye size={16} /></button></td>
                  </tr>
                ))}
                {(activePage === 'reports' ? filteredReportSales.length : sales.length) === 0 && <tr><td colSpan={7} className="inventory-empty">{activePage === 'reports' && reportSearch ? t('noReportResults') : t('noTransactions')}</td></tr>}</tbody>
              </table></div>
            </section>
            {activePage === 'sales' && (
              <section className="panel print-history-panel">
                <div className="panel-heading"><div><h3>{t('printHistory')}</h3><p>{t('printHistoryDescription')}</p></div></div>
                <div className="table-scroll"><table><thead><tr><th>{t('invoice')}</th><th>{t('printerName')}</th><th>{t('date')}</th><th>{t('status')}</th><th>{t('printAttempts')}</th><th>{t('reprint')}</th></tr></thead>
                  <tbody>{printJobs.map((job) => (
                    <tr key={job.id}>
                      <td>{job.invoiceNumber ?? t('testPrint')}</td>
                      <td>{job.printerName ?? '—'}</td>
                      <td>{new Date(job.createdAt).toLocaleString(isArabic ? 'ar' : 'en')}</td>
                      <td><span className={`print-status print-status-${job.status}`}>{t(job.status)}</span>{job.lastError && <small className="print-error-detail">{job.lastError}</small>}</td>
                      <td>{job.attemptCount}</td>
                      <td>{job.saleId !== null && <button className="text-button" type="button" onClick={() => void retryPrintJob(job)} disabled={printerBusy}>{t('reprint')}</button>}</td>
                    </tr>
                  ))}
                  {printJobs.length === 0 && <tr><td colSpan={6} className="inventory-empty">{t('noPrintJobs')}</td></tr>}</tbody>
                </table></div>
                {printNotice && !saleReceipt && <p className="printer-notice" role="status">{printNotice}</p>}
              </section>
            )}
          </section>
        ) : (
          <section className="page-content section-placeholder" aria-live="polite">
            <div className="placeholder-card"><h2>{activeTitle}</h2><p>{t('pageUnavailable')}</p></div>
          </section>
        )}
      </main>
    </div>
  )
}

export default App
