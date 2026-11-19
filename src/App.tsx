import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { check } from '@tauri-apps/plugin-updater'
import {
  Activity,
  Bell,
  Boxes,
  ChartNoAxesCombined,
  ChevronDown,
  CircleHelp,
  ClipboardList,
  CreditCard,
  Globe2,
  LayoutDashboard,
  Menu,
  Minus,
  Moon,
  Package,
  Plus,
  Printer,
  Search,
  Settings,
  ShoppingCart,
  Sun,
  Users,
  X,
} from 'lucide-react'
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
type SaleCartLine = { productId: number; quantity: number }
type SaleReceipt = {
  invoiceNumber: string
  totalMinor: number
  customerName: string | null
  soldAt: string
  items: Array<{
    productName: string
    quantity: number
    unitPriceMinor: number
    lineTotalMinor: number
  }>
}
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
  const [pharmacyLogo, setPharmacyLogo] = useState('')
  const [productSalePrice, setProductSalePrice] = useState('')
  const [productPrices, setProductPrices] = useState<Record<number, string>>({})
  const [batchNumber, setBatchNumber] = useState('')
  const [batchExpiry, setBatchExpiry] = useState('')
  const [batchUnits, setBatchUnits] = useState('')
  const [batchProductId, setBatchProductId] = useState('')
  const [saleCustomerId, setSaleCustomerId] = useState('')
  const [saleCart, setSaleCart] = useState<SaleCartLine[]>([])
  const [saleSearch, setSaleSearch] = useState('')
  const [saleReceipt, setSaleReceipt] = useState<SaleReceipt | null>(null)
  const [globalSearch, setGlobalSearch] = useState('')
  const [productBarcode, setProductBarcode] = useState('')
  const [reorderLevel, setReorderLevel] = useState('0')
  const [sales, setSales] = useState<SaleSummary[]>([])
  const [availableUpdate, setAvailableUpdate] = useState<{
    version: string
    body?: string
  } | null>(null)
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'downloading' | 'error'>('idle')
  const [updateError, setUpdateError] = useState('')
  const isArabic = i18n.resolvedLanguage !== 'en'
  const formatMoney = (minor: number) => new Intl.NumberFormat(
    isArabic ? 'ar-SA' : 'en-US',
    { style: 'currency', currency: 'SAR' },
  ).format(minor / 100)
  const formatCompactAmount = (minor: number) => new Intl.NumberFormat(
    isArabic ? 'ar' : 'en',
    { notation: 'compact', maximumFractionDigits: 1 },
  ).format(minor / 100)
  const dailySales = dashboard?.dailySales ?? []
  const chartMax = Math.max(...dailySales.map((day) => day.totalMinor), 0)

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
      setUpdateStatus('idle')
    } catch (error) {
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
  }, [activePage])

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
      const keys = ['pharmacy_name', 'pharmacy_address', 'pharmacy_phone', 'pharmacy_tax_number', 'pharmacy_logo']
      const values = await Promise.all(keys.map((key) => invoke<string>('get_setting', { key })))
      setPharmacyName(values[0])
      setPharmacyAddress(values[1])
      setPharmacyPhone(values[2])
      setPharmacyTaxNumber(values[3])
      setPharmacyLogo(values[4])
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
    try {
      await invoke('set_settings', {
        settings: {
          pharmacy_name: pharmacyName,
          pharmacy_address: pharmacyAddress,
          pharmacy_phone: pharmacyPhone,
          pharmacy_tax_number: pharmacyTaxNumber,
          pharmacy_logo: pharmacyLogo,
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
    setInventoryError('')
    try {
      const createdSale = await invoke<{ invoiceNumber: string; totalMinor: number }>('create_sale', {
        customerId: saleCustomerId ? Number(saleCustomerId) : null,
        items: saleCart.map(({ productId, quantity }) => ({ productId, quantity })),
        status: 'paid',
      })
      setSaleReceipt({
        ...createdSale,
        customerName: customers.find((customer) => customer.id === Number(saleCustomerId))?.name ?? null,
        soldAt: new Date().toISOString(),
        items: saleCart.flatMap(({ productId, quantity }) => {
          const product = products.find((entry) => entry.id === productId)
          return product ? [{
            productName: isArabic ? product.nameAr : product.nameEn,
            quantity,
            unitPriceMinor: product.salePriceMinor,
            lineTotalMinor: quantity * product.salePriceMinor,
          }] : []
        }),
      })
      setSaleCart([])
      setSaleCustomerId('')
      await refreshDashboard()
      await refreshProducts()
      await refreshSales()
    } catch (error) {
      setInventoryError(error instanceof Error ? error.message : String(error))
    }
  }

  function addToSaleCart(productId: number) {
    setSaleReceipt(null)
    setSaleCart((current) => {
      const existing = current.find((line) => line.productId === productId)
      const product = products.find((entry) => entry.id === productId)
      if (!product || !product.salePriceMinor || !product.availableUnits) return current
      if (existing) {
        if (existing.quantity >= product.availableUnits) return current
        return current.map((line) => line.productId === productId
          ? { ...line, quantity: line.quantity + 1 }
          : line)
      }
      return [...current, { productId, quantity: 1 }]
    })
  }

  function changeSaleQuantity(productId: number, change: number) {
    setSaleReceipt(null)
    setSaleCart((current) => current.flatMap((line) => {
      if (line.productId !== productId) return [line]
      const quantity = line.quantity + change
      const product = products.find((entry) => entry.id === productId)
      return quantity <= 0 ? [] : product && quantity <= product.availableUnits
        ? [{ ...line, quantity }]
        : [line]
    }))
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

  const activeTitle = t(`nav.${activePage}`)

  return (
    <div
      className="app-shell"
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
                  <strong>{formatMoney(dashboard?.dailySales.reduce((sum, day) => sum + day.totalMinor, 0) ?? 0)}</strong>
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
                          <td className="amount-cell">{formatMoney(sale.totalMinor)}</td>
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
            <section className="panel inventory-products">
              <label className="product-search">
                <Search size={17} />
                <input
                  value={globalSearch}
                  onChange={(event) => setGlobalSearch(event.target.value)}
                  placeholder={t('searchProducts')}
                  aria-label={t('searchProducts')}
                />
              </label>
              <div className="table-scroll">
                <table>
                  <thead><tr><th>{t('product')}</th><th>{t('sku')}</th><th>{t('baseUnit')}</th><th>{t('availableUnits')}</th><th>{t('reorderLevel')}</th></tr></thead>
                  <tbody>
                    {products
                      .filter((product) => {
                        const query = globalSearch.trim().toLocaleLowerCase()
                        return !query || [product.nameAr, product.nameEn, product.sku, product.barcode ?? '']
                          .some((value) => value.toLocaleLowerCase().includes(query))
                      })
                      .map((product) => (
                        <tr key={product.id}>
                          <td><strong>{isArabic ? product.nameAr : product.nameEn}</strong><small>{isArabic ? product.nameEn : product.nameAr}</small></td>
                          <td>{product.sku}</td>
                          <td>{product.baseUnit}</td>
                          <td><span className={product.availableUnits <= product.reorderLevelUnits ? 'stock-low' : 'stock-ok'}>{product.availableUnits}</span></td>
                          <td>{product.reorderLevelUnits}</td>
                        </tr>
                      ))}
                    {products.length === 0 && <tr><td colSpan={5} className="inventory-empty">{t('noProducts')}</td></tr>}
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
            <div className="inventory-grid">
              <form className="panel inventory-form" onSubmit={createCustomer}>
                <div className="panel-heading"><h3>{t('addCustomer')}</h3></div>
                <label><span>{t('customerName')}</span><input value={customerName} onChange={(e) => setCustomerName(e.target.value)} required /></label>
                <label><span>{t('phone')}</span><input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} /></label>
                <button className="primary-button" type="submit">{t('saveCustomer')}</button>
              </form>
              <section className="panel inventory-products">
                <div className="table-scroll">
                  <table>
                    <thead><tr><th>{t('customerName')}</th><th>{t('phone')}</th></tr></thead>
                    <tbody>
                      {customers.map((customer) => <tr key={customer.id}><td>{customer.name}</td><td>{customer.phone || '-'}</td></tr>)}
                      {customers.length === 0 && <tr><td colSpan={2} className="inventory-empty">{t('noCustomers')}</td></tr>}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </section>
        ) : activePage === 'purchases' ? (
          <section className="page-content inventory-page">
            <div className="page-heading"><div><h2>{t('purchasesHeading')}</h2><p>{t('purchasesDescription')}</p></div></div>
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
                <div className="table-scroll"><table><thead><tr><th>{t('purchaseReference')}</th><th>{t('supplierName')}</th><th>{t('amount')}</th><th>{t('status')}</th></tr></thead>
                  <tbody>{purchases.map((purchase) => (
                    <tr key={purchase.id}><td>{purchase.referenceNumber}</td><td>{purchase.supplierName}</td><td>{formatMoney(purchase.totalMinor)}</td><td>{t(purchase.status)}</td></tr>
                  ))}
                  {purchases.length === 0 && <tr><td colSpan={4} className="inventory-empty">{t('noPurchases')}</td></tr>}</tbody>
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
              <label className="logo-upload">
                <span>{t('pharmacyLogo')}</span>
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => handleLogoUpload(event.target.files?.[0])} />
                {pharmacyLogo && <img className="logo-preview" src={pharmacyLogo} alt={t('pharmacyLogo')} />}
              </label>
              {pharmacyLogo && <button className="text-button" type="button" onClick={() => setPharmacyLogo('')}>{t('removeLogo')}</button>}
              <button className="primary-button" type="submit">{t('saveSettings')}</button>
            </form>
          </section>
        ) : activePage === 'sales' || activePage === 'reports' ? (
          <section className="page-content inventory-page">
            <div className="page-heading"><div><h2>{activeTitle}</h2><p>{t('operationalDataDescription')}</p></div></div>
            {activePage === 'reports' && (
              <div className="stats-grid report-stats">
                <article className="stat-card"><p>{t('paidSalesTotal')}</p><strong className="stat-value">{formatMoney(sales.filter((sale) => sale.status === 'paid').reduce((sum, sale) => sum + sale.totalMinor, 0))}</strong></article>
                <article className="stat-card"><p>{t('invoiceCount')}</p><strong className="stat-value">{sales.length}</strong></article>
                <article className="stat-card"><p>{t('productsInStock')}</p><strong className="stat-value">{dashboard?.stockUnits ?? '—'}</strong></article>
              </div>
            )}
            {activePage === 'sales' && (
              <>
                <div className="pos-layout">
                  <section className="panel pos-catalog">
                    <div className="panel-heading"><div><h3>{t('posProducts')}</h3><p>{t('posProductsDescription')}</p></div></div>
                    <label className="product-search">
                      <Search size={16} />
                      <input aria-label={t('searchProducts')} value={saleSearch} onChange={(event) => setSaleSearch(event.target.value)} placeholder={t('searchProducts')} />
                    </label>
                    <div className="pos-product-grid">
                      {products.filter((product) => {
                        const query = saleSearch.trim().toLocaleLowerCase()
                        return !query || [product.nameAr, product.nameEn, product.sku, product.barcode ?? '']
                          .some((value) => value.toLocaleLowerCase().includes(query))
                      }).map((product) => (
                        <button
                          className="pos-product-card"
                          type="button"
                          key={product.id}
                          onClick={() => addToSaleCart(product.id)}
                          disabled={product.availableUnits === 0 || product.salePriceMinor <= 0}
                        >
                          <strong>{isArabic ? product.nameAr : product.nameEn}</strong>
                          <span>{product.sku} · {product.availableUnits} {t('availableUnits')}</span>
                          <b>{formatMoney(product.salePriceMinor)}</b>
                          {product.salePriceMinor <= 0 && <small>{t('setProductPrice')}</small>}
                        </button>
                      ))}
                      {products.length === 0 && <p className="inventory-empty">{t('noProducts')}</p>}
                    </div>
                  </section>
                  <form className="panel pos-cart" onSubmit={createSale}>
                    <div className="panel-heading"><div><h3>{t('currentSale')}</h3><p>{t('invoiceAutoGenerated')}</p></div></div>
                    <label><span>{t('customer')}</span><select value={saleCustomerId} onChange={(event) => setSaleCustomerId(event.target.value)}><option value="">-</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
                    <div className="pos-cart-items">
                      {saleCart.map(({ productId, quantity }) => {
                        const product = products.find((entry) => entry.id === productId)
                        if (!product) return null
                        return (
                          <div className="pos-cart-line" key={productId}>
                            <div className="pos-cart-product">
                              <strong>{isArabic ? product.nameAr : product.nameEn}</strong>
                              <span>{formatMoney(product.salePriceMinor)} · {formatMoney(product.salePriceMinor * quantity)}</span>
                            </div>
                            <div className="quantity-control">
                              <button type="button" aria-label={t('decreaseQuantity')} onClick={() => changeSaleQuantity(productId, -1)}><Minus size={14} /></button>
                              <span>{quantity}</span>
                              <button type="button" aria-label={t('increaseQuantity')} onClick={() => changeSaleQuantity(productId, 1)} disabled={quantity >= product.availableUnits}><Plus size={14} /></button>
                            </div>
                          </div>
                        )
                      })}
                      {saleCart.length === 0 && <p className="inventory-empty">{t('emptySaleCart')}</p>}
                    </div>
                    <div className="pos-total">
                      <span>{t('total')}</span>
                      <strong>{formatMoney(saleCart.reduce((total, line) => {
                        const product = products.find((entry) => entry.id === line.productId)
                        return total + line.quantity * (product?.salePriceMinor ?? 0)
                      }, 0))}</strong>
                    </div>
                    <button className="primary-button" type="submit" disabled={saleCart.length === 0}>{t('saveSale')}</button>
                  </form>
                </div>
                {saleReceipt && (
                  <section className="panel receipt-panel">
                    <div className="receipt-actions">
                      <h3>{t('saleSaved')}</h3>
                      <button className="primary-button" type="button" onClick={() => window.print()}><Printer size={16} />{t('printInvoice')}</button>
                    </div>
                    <div className="print-receipt" dir={isArabic ? 'rtl' : 'ltr'}>
                      {pharmacyLogo && <img className="receipt-logo" src={pharmacyLogo} alt={t('pharmacyLogo')} />}
                      <h2>{pharmacyName || t('pharmacyName')}</h2>
                      {pharmacyAddress && <p>{pharmacyAddress}</p>}
                      {pharmacyPhone && <p>{t('phone')}: {pharmacyPhone}</p>}
                      {pharmacyTaxNumber && <p>{t('pharmacyTaxNumber')}: {pharmacyTaxNumber}</p>}
                      <hr />
                      <p><strong>{t('invoice')}:</strong> {saleReceipt.invoiceNumber}</p>
                      <p><strong>{t('date')}:</strong> {new Date(saleReceipt.soldAt).toLocaleString(isArabic ? 'ar' : 'en')}</p>
                      <p><strong>{t('customer')}:</strong> {saleReceipt.customerName ?? t('cashCustomer')}</p>
                      <div className="table-scroll"><table>
                        <thead><tr><th>{t('product')}</th><th>{t('quantityUnits')}</th><th>{t('unitPrice')}</th><th>{t('amount')}</th></tr></thead>
                        <tbody>{saleReceipt.items.map((item, index) => (
                          <tr key={`${item.productName}-${index}`}><td>{item.productName}</td><td>{item.quantity}</td><td>{formatMoney(item.unitPriceMinor)}</td><td>{formatMoney(item.lineTotalMinor)}</td></tr>
                        ))}</tbody>
                      </table></div>
                      <h3>{t('total')}: {formatMoney(saleReceipt.totalMinor)}</h3>
                    </div>
                  </section>
                )}
              </>
            )}
            <section className="panel inventory-products">
              <div className="table-scroll"><table><thead><tr><th>{t('invoice')}</th><th>{t('customer')}</th><th>{t('date')}</th><th>{t('amount')}</th><th>{t('status')}</th></tr></thead>
                <tbody>{sales.map((sale) => (
                  <tr key={sale.id}><td>{sale.invoiceNumber}</td><td>{sale.customerName ?? t('cashCustomer')}</td><td>{new Date(sale.soldAt).toLocaleString(isArabic ? 'ar' : 'en')}</td><td>{formatMoney(sale.totalMinor)}</td><td>{t(sale.status)}</td></tr>
                ))}
                {sales.length === 0 && <tr><td colSpan={5} className="inventory-empty">{t('noTransactions')}</td></tr>}</tbody>
              </table></div>
            </section>
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
