import { useEffect, useState } from 'react'
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
  const isArabic = i18n.resolvedLanguage !== 'en'

  useEffect(() => {
    document.documentElement.lang = isArabic ? 'ar' : 'en'
    document.documentElement.dir = isArabic ? 'rtl' : 'ltr'
  }, [isArabic])

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
              {key === 'inventory' && <span className="nav-badge" aria-hidden="true">3</span>}
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
                <strong className="stat-value">{t('sampleSalesValue')}</strong>
                <span className="stat-note">{t('comparedYesterday')}</span>
              </article>
              <article className="stat-card">
                <div className="stat-top">
                  <span className="stat-icon blue"><ShoppingCart size={19} /></span>
                  <span className="stat-change positive"><ArrowUpLeft size={14} /> 8.2%</span>
                </div>
                <p>{t('ordersToday')}</p>
                <strong className="stat-value">126</strong>
                <span className="stat-note">{t('ordersCompared')}</span>
              </article>
              <article className="stat-card">
                <div className="stat-top">
                  <span className="stat-icon amber"><Package size={19} /></span>
                  <span className="stat-change negative"><ArrowDownLeft size={14} /> 4.1%</span>
                </div>
                <p>{t('productsInStock')}</p>
                <strong className="stat-value">2,481</strong>
                <span className="stat-note">{t('productsCompared')}</span>
              </article>
              <article className="stat-card">
                <div className="stat-top">
                  <span className="stat-icon rose"><Bell size={19} /></span>
                  <span className="stat-alert">{t('needsAttention')}</span>
                </div>
                <p>{t('lowStockProducts')}</p>
                <strong className="stat-value">08</strong>
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
                    {[38, 55, 45, 70, 50, 84, 63, 48, 73, 58, 91, 67].map((height, index) => (
                      <div className="bar-column" key={index}>
                        <span className={index === 10 ? 'bar is-highlighted' : 'bar'} style={{ height: `${height}%` }} />
                        <small>{t(`days.${index}`)}</small>
                      </div>
                    ))}
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
                      <tr>
                        <td><span className="invoice-number">#INV-1048</span></td>
                        <td><span className="customer-cell"><i className="customer-avatar ca-one">ن</i>{t('customerOne')}</span></td>
                        <td>{t('timeTen')}</td>
                        <td className="amount-cell">{t('amountOne')}</td>
                        <td><span className="status-pill paid">{t('paid')}</span></td>
                      </tr>
                      <tr>
                        <td><span className="invoice-number">#INV-1047</span></td>
                        <td><span className="customer-cell"><i className="customer-avatar ca-two">ع</i>{t('customerTwo')}</span></td>
                        <td>{t('timeNine')}</td>
                        <td className="amount-cell">{t('amountTwo')}</td>
                        <td><span className="status-pill pending">{t('pending')}</span></td>
                      </tr>
                      <tr>
                        <td><span className="invoice-number">#INV-1046</span></td>
                        <td><span className="customer-cell"><i className="customer-avatar ca-three">س</i>{t('customerThree')}</span></td>
                        <td>{t('timeNine')}</td>
                        <td className="amount-cell">{t('amountThree')}</td>
                        <td><span className="status-pill paid">{t('paid')}</span></td>
                      </tr>
                      <tr>
                        <td><span className="invoice-number">#INV-1045</span></td>
                        <td><span className="customer-cell"><i className="customer-avatar ca-four">م</i>{t('customerFour')}</span></td>
                        <td>{t('timeEight')}</td>
                        <td className="amount-cell">{t('amountFour')}</td>
                        <td><span className="status-pill cancelled">{t('cancelled')}</span></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
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
