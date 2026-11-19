import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { check } from '@tauri-apps/plugin-updater'
import {
  Activity,
  ArrowDownLeft,
  ArrowUpLeft,
  Bell,
  Boxes,
  ChartNoAxesCombined,
  ChevronDown,
  CircleHelp,
  ClipboardList,
  CreditCard,
  Globe2,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Package,
  Plus,
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
  availableUnits: number
}
type DashboardSummary = {
  todaySalesMinor: number
  todayOrders: number
  productCount: number
  lowStockCount: number
  recentSales: {
    id: number
    invoiceNumber: string
    customerName: string
    soldAt: string
    totalMinor: number
    status: string
  }[]
  dailySalesMinor: number[]
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
  const [pharmacyName, setPharmacyName] = useState('')
  const [batchNumber, setBatchNumber] = useState('')
  const [batchExpiry, setBatchExpiry] = useState('')
  const [batchUnits, setBatchUnits] = useState('')
  const [batchProductId, setBatchProductId] = useState('')
  const [saleInvoice, setSaleInvoice] = useState('')
  const [saleProductId, setSaleProductId] = useState('')
  const [saleCustomerId, setSaleCustomerId] = useState('')
  const [saleQuantity, setSaleQuantity] = useState('')
  const [salePrice, setSalePrice] = useState('')
  const [availableUpdate, setAvailableUpdate] = useState<{
    version: string
    body?: string
  } | null>(null)
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'downloading' | 'error'>('idle')
  const [updateError, setUpdateError] = useState('')
  const isArabic = i18n.resolvedLanguage !== 'en'

  useEffect(() => {
    document.documentElement.lang = isArabic ? 'ar' : 'en'
    document.documentElement.dir = isArabic ? 'rtl' : 'ltr'
  }, [isArabic])

  useEffect(() => {
    void checkForUpdate()
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
    if (activePage === 'inventory' || activePage === 'sales' || activePage === 'purchases') {
      void refreshProducts()
    }
    if (activePage === 'sales' || activePage === 'reports') {
      void refreshDashboard()
      void refreshCustomers()
    }
  }, [activePage])

  useEffect(() => {
    if (activePage === 'dashboard') void refreshDashboard()
    if (activePage === 'customers') void refreshCustomers()
    if (activePage === 'purchases') void refreshPurchases()
    if (activePage === 'settings') void refreshSetting()
  }, [activePage])

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

  async function refreshSetting() {
    try {
      setPharmacyName(await invoke<string>('get_setting', { key: 'pharmacy_name' }))
    } catch (error) {
      setInventoryError(error instanceof Error ? error.message : String(error))
    }
  }

  const createPurchase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      await invoke<number>('create_purchase', {
        referenceNumber: purchaseReference,
        supplierName,
        totalMinor: Math.round(Number(purchaseTotal) * 100),
      })
      setPurchaseReference('')
      setSupplierName('')
      setPurchaseTotal('')
      await refreshPurchases()
      await refreshDashboard()
    } catch (error) {
      setInventoryError(error instanceof Error ? error.message : String(error))
    }
  }

  const saveSetting = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      await invoke('set_setting', { key: 'pharmacy_name', value: pharmacyName })
    } catch (error) {
      setInventoryError(error instanceof Error ? error.message : String(error))
    }
  }

  const receiveBatch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
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
      await refreshDashboard()
    } catch (error) {
      setInventoryError(error instanceof Error ? error.message : String(error))
    }
  }

  const createSale = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      await invoke<number>('create_sale', {
        invoiceNumber: saleInvoice,
        customerId: saleCustomerId ? Number(saleCustomerId) : null,
        productId: Number(saleProductId),
        quantity: Number(saleQuantity),
        unitPriceMinor: Math.round(Number(salePrice) * 100),
        status: 'paid',
      })
      setSaleInvoice('')
      setSaleProductId('')
      setSaleCustomerId('')
      setSaleQuantity('')
      setSalePrice('')
      await refreshDashboard()
      await refreshProducts()
    } catch (error) {
      setInventoryError(error instanceof Error ? error.message : String(error))
    }
  }

  const createCustomer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
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
        barcode: null,
        name_ar: productNameAr,
        name_en: productNameEn,
        base_unit: baseUnit,
        reorder_level_units: 0,
      })
      setProductSku('')
      setProductNameAr('')
      setProductNameEn('')
      setBaseUnit('')
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
            <Activity size={21} strokeWidth={2.5} />
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
            <strong>{t('branchName')}</strong>
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
          <strong>{t('needHelp')}</strong>
          <p>{t('helpDescription')}</p>
          <button type="button" className="help-link">
            {t('contactSupport')}
            <ArrowUpLeft size={15} />
          </button>
        </div>
        <button className="profile" type="button">
          <div className="profile-avatar">م</div>
          <div className="profile-info">
            <strong>{t('userName')}</strong>
            <span>{t('adminRole')}</span>
          </div>
          <LogOut size={17} className="muted-icon" />
        </button>
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
              <input aria-label={t('search')} placeholder={t('search')} />
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
            >
              <Bell size={18} />
              <span className="notification-dot" />
            </button>
          </div>
        </header>

        {activePage === 'dashboard' ? (
          <section className="page-content">
            <div className="page-heading">
              <div>
                <h2>{t('dashboardHeading')}</h2>
                <p>{t('dashboardDescription')}</p>
              </div>
              <button className="primary-button" type="button">
                <Plus size={18} />
                {t('newSale')}
              </button>
            </div>

            <div className="stats-grid">
              <article className="stat-card">
                <div className="stat-top">
                  <span className="stat-icon mint"><CreditCard size={19} /></span>
                  <span className="stat-change positive"><ArrowUpLeft size={14} /> 12.8%</span>
                </div>
                <p>{t('todaySales')}</p>
                <strong className="stat-value">{dashboard ? `${(dashboard.todaySalesMinor / 100).toLocaleString()} ر.س` : '0 ر.س'}</strong>
                <span className="stat-note">{t('comparedYesterday')}</span>
              </article>
              <article className="stat-card">
                <div className="stat-top">
                  <span className="stat-icon blue"><ShoppingCart size={19} /></span>
                  <span className="stat-change positive"><ArrowUpLeft size={14} /> 8.2%</span>
                </div>
                <p>{t('ordersToday')}</p>
                <strong className="stat-value">{dashboard?.todayOrders ?? 0}</strong>
                <span className="stat-note">{t('ordersCompared')}</span>
              </article>
              <article className="stat-card">
                <div className="stat-top">
                  <span className="stat-icon amber"><Package size={19} /></span>
                  <span className="stat-change negative"><ArrowDownLeft size={14} /> 4.1%</span>
                </div>
                <p>{t('productsInStock')}</p>
                <strong className="stat-value">{dashboard?.productCount ?? 0}</strong>
                <span className="stat-note">{t('productsCompared')}</span>
              </article>
              <article className="stat-card">
                <div className="stat-top">
                  <span className="stat-icon rose"><Bell size={19} /></span>
                  <span className="stat-alert">{t('needsAttention')}</span>
                </div>
                <p>{t('lowStockProducts')}</p>
                <strong className="stat-value">{dashboard?.lowStockCount ?? 0}</strong>
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
                  <select aria-label={t('period')}>
                    <option>{t('thisWeek')}</option>
                    <option>{t('thisMonth')}</option>
                  </select>
                </div>
                <div className="chart-summary">
                  <strong>{t('sampleSalesValue')}</strong>
                  <span className="chart-legend"><i /> {t('sales')}</span>
                </div>
                <div className="chart" role="img" aria-label={t('salesChart')}>
                  <div className="chart-grid">
                    <span>{t('chartTop')}</span><span>{t('chartMidHigh')}</span>
                    <span>{t('chartMid')}</span><span>{t('chartLow')}</span>
                    <span>{t('chartBottom')}</span>
                  </div>
                  <div className="chart-bars" aria-hidden="true">
                    {(dashboard?.dailySalesMinor ?? [0, 0, 0, 0, 0, 0, 0]).map((amount, index) => {
                      const max = Math.max(...(dashboard?.dailySalesMinor ?? [1]), 1)
                      const height = max > 0 ? Math.max(8, (amount / max) * 100) : 8
                      return (
                      <div className="bar-column" key={index}>
                        <span className={index === 10 ? 'bar is-highlighted' : 'bar'} style={{ height: `${height}%` }} />
                        <small>{t(`days.${index}`)}</small>
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
                    { icon: ShoppingCart, label: t('newSale'), color: 'mint' },
                    { icon: Plus, label: t('addProduct'), color: 'blue' },
                    { icon: ClipboardList, label: t('newPurchase'), color: 'amber' },
                    { icon: Users, label: t('addCustomer'), color: 'violet' },
                  ].map(({ icon: Icon, label, color }) => (
                    <button className="quick-action" type="button" key={label}>
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
                  <button className="text-button" type="button">{t('viewAll')}</button>
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
                          <td><span className="customer-cell"><i className="customer-avatar ca-one">{sale.customerName.charAt(0)}</i>{sale.customerName}</span></td>
                          <td>{new Date(sale.soldAt).toLocaleString(isArabic ? 'ar' : 'en')}</td>
                          <td className="amount-cell">{(sale.totalMinor / 100).toLocaleString(isArabic ? 'ar-SA' : 'en-US')} ر.س</td>
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
                {inventoryError && <p className="inventory-error" role="alert">{inventoryError}</p>}
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>{t('product')}</th>
                        <th>{t('sku')}</th>
                        <th>{t('baseUnit')}</th>
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
                          <td><span className={product.availableUnits <= product.reorderLevelUnits ? 'stock-low' : 'stock-ok'}>{product.availableUnits}</span></td>
                        </tr>
                      ))}
                      {products.length === 0 && !inventoryLoading && (
                        <tr>
                          <td colSpan={4} className="inventory-empty">{t('noProducts')}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
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
                <label><span>{t('purchaseTotal')}</span><input type="number" min="0" step="0.01" value={purchaseTotal} onChange={(e) => setPurchaseTotal(e.target.value)} required /></label>
                <button className="primary-button" type="submit">{t('savePurchase')}</button>
              </form>
              <section className="panel inventory-products">
                <div className="table-scroll"><table><thead><tr><th>{t('purchaseReference')}</th><th>{t('supplierName')}</th><th>{t('amount')}</th><th>{t('status')}</th></tr></thead>
                  <tbody>{purchases.map((purchase) => (
                    <tr key={purchase.id}><td>{purchase.referenceNumber}</td><td>{purchase.supplierName}</td><td>{(purchase.totalMinor / 100).toLocaleString(isArabic ? 'ar-SA' : 'en-US')} ر.س</td><td>{t(purchase.status)}</td></tr>
                  ))}
                  {purchases.length === 0 && <tr><td colSpan={4} className="inventory-empty">{t('noPurchases')}</td></tr>}</tbody>
                </table></div>
              </section>
            </div>
          </section>
        ) : activePage === 'settings' ? (
          <section className="page-content inventory-page">
            <div className="page-heading"><div><h2>{t('settingsHeading')}</h2><p>{t('settingsDescription')}</p></div></div>
            <form className="panel inventory-form" onSubmit={saveSetting}>
              <label><span>{t('pharmacyName')}</span><input value={pharmacyName} onChange={(e) => setPharmacyName(e.target.value)} required /></label>
              <button className="primary-button" type="submit">{t('saveSettings')}</button>
            </form>
          </section>
        ) : activePage === 'sales' || activePage === 'reports' ? (
          <section className="page-content inventory-page">
            <div className="page-heading"><div><h2>{activeTitle}</h2><p>{t('operationalDataDescription')}</p></div></div>
            {activePage === 'sales' && (
              <form className="panel inventory-form sale-form" onSubmit={createSale}>
                <label><span>{t('invoice')}</span><input value={saleInvoice} onChange={(e) => setSaleInvoice(e.target.value)} required /></label>
                <label><span>{t('customer')}</span><select value={saleCustomerId} onChange={(e) => setSaleCustomerId(e.target.value)}><option value="">-</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
                <label><span>{t('product')}</span><select value={saleProductId} onChange={(e) => setSaleProductId(e.target.value)} required><option value="">--</option>{products.map((product) => <option key={product.id} value={product.id}>{isArabic ? product.nameAr : product.nameEn}</option>)}</select></label>
                <label><span>{t('quantityUnits')}</span><input type="number" min="1" value={saleQuantity} onChange={(e) => setSaleQuantity(e.target.value)} required /></label>
                <label><span>{t('unitPrice')}</span><input type="number" min="0" step="0.01" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} required /></label>
                <button className="primary-button" type="submit">{t('saveSale')}</button>
              </form>
            )}
            <section className="panel inventory-products">
              <div className="table-scroll"><table><thead><tr><th>{t('invoice')}</th><th>{t('customer')}</th><th>{t('date')}</th><th>{t('amount')}</th><th>{t('status')}</th></tr></thead>
                <tbody>{(dashboard?.recentSales ?? []).map((sale) => (
                  <tr key={sale.id}><td>{sale.invoiceNumber}</td><td>{sale.customerName}</td><td>{new Date(sale.soldAt).toLocaleString(isArabic ? 'ar' : 'en')}</td><td>{(sale.totalMinor / 100).toLocaleString(isArabic ? 'ar-SA' : 'en-US')} ر.س</td><td>{t(sale.status)}</td></tr>
                ))}
                {dashboard?.recentSales.length === 0 && <tr><td colSpan={5} className="inventory-empty">{t('noTransactions')}</td></tr>}</tbody>
              </table></div>
            </section>
          </section>
        ) : (
          <section className="page-content section-placeholder">
            <div className="placeholder-card">
              <div className="placeholder-icon"><LayoutDashboard size={24} /></div>
              <h2>{activeTitle}</h2>
              <p>{t('sectionComingSoon')}</p>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

export default App
