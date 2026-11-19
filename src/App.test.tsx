import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import i18n from './i18n'

const invokeMock = vi.hoisted(() => vi.fn())
vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
  isTauri: () => false,
}))
vi.mock('@tauri-apps/plugin-updater', () => ({
  check: vi.fn().mockResolvedValue(null),
}))

describe('main application shell', () => {
  beforeEach(async () => {
    localStorage.clear()
    await i18n.changeLanguage('ar')
    invokeMock.mockReset()
    invokeMock.mockImplementation((command: string) => {
      if (command === 'get_dashboard') return Promise.resolve({
        todaySalesMinor: 12500,
        todayOrders: 2,
        stockUnits: 24,
        lowStockCount: 1,
        recentSales: [],
        dailySales: [],
      })
      if (command === 'list_products') return Promise.resolve([{
        id: 1,
        sku: 'MED-100',
        barcode: '628100',
        nameAr: 'باراسيتامول',
        nameEn: 'Paracetamol',
        baseUnit: 'قرص',
        reorderLevelUnits: 5,
        availableUnits: 24,
      }])
      if (command === 'get_setting') return Promise.resolve('')
      return Promise.resolve([])
    })
  })

  it('starts in Arabic with right-to-left layout and switches to English', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(document.querySelector('.app-shell')).toHaveAttribute('dir', 'rtl')
    expect(screen.getByRole('heading', { name: 'نظرة عامة' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'التبديل إلى الإنجليزية' }))

    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeInTheDocument()
    expect(document.querySelector('.app-shell')).toHaveAttribute('dir', 'ltr')
    expect(document.documentElement).toHaveAttribute('lang', 'en')
  })

  it('toggles the color theme and opens a selected section', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'تبديل الوضع الداكن والفاتح' }))
    expect(document.querySelector('.app-shell')).toHaveAttribute('data-theme', 'dark')

    await user.click(screen.getByRole('button', { name: 'المخزون' }))
    expect(screen.getByRole('heading', { name: 'المخزون', level: 1 })).toBeInTheDocument()
  })

  it('loads the real product catalog and filters it from global search', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'المنتجات' }))
    expect(await screen.findByText('Paracetamol')).toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: 'ابحث عن دواء أو رمز منتج...' }), 'missing')
    expect(screen.queryByText('Paracetamol')).not.toBeInTheDocument()
  })

  it('sends product creation fields using the Tauri command argument names', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'المخزون' }))

    await user.type(screen.getByLabelText('رمز المنتج'), 'MED-200')
    await user.type(screen.getByLabelText('اسم المنتج بالعربية'), 'دواء جديد')
    await user.type(screen.getByLabelText('اسم المنتج بالإنجليزية'), 'New medicine')
    await user.type(screen.getByLabelText('الوحدة الأساسية'), 'قرص')
    await user.click(screen.getByRole('button', { name: 'حفظ المنتج' }))

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('create_product', expect.objectContaining({
        sku: 'MED-200',
        nameAr: 'دواء جديد',
        nameEn: 'New medicine',
        baseUnit: 'قرص',
        reorderLevelUnits: 0,
      }))
    })
  })

  it('saves the pharmacy name through persistent settings', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'الإعدادات' }))

    await user.type(await screen.findByLabelText('اسم الصيدلية'), 'صيدلية النور')
    await user.click(screen.getByRole('button', { name: 'حفظ الإعدادات' }))

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('set_setting', {
        key: 'pharmacy_name',
        value: 'صيدلية النور',
      })
    })
  })

  it('opens every application page without a placeholder screen', async () => {
    const user = userEvent.setup()
    render(<App />)
    const pages = [
      ['المبيعات', 'المبيعات'],
      ['المنتجات', 'المنتجات'],
      ['المخزون', 'المخزون'],
      ['المشتريات', 'المشتريات'],
      ['العملاء', 'العملاء'],
      ['التقارير', 'التقارير'],
      ['الإعدادات', 'الإعدادات'],
      ['لوحة التحكم', 'لوحة التحكم'],
    ]

    for (const [label, heading] of pages) {
      await user.click(screen.getByRole('button', { name: label }))
      expect(await screen.findByRole('heading', { name: heading, level: 1 })).toBeInTheDocument()
      expect(screen.queryByText(/المراحل القادمة/)).not.toBeInTheDocument()
    }
  })
})
