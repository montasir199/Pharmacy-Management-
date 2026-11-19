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
        salePriceMinor: 1250,
        availableUnits: 24,
      }])
      if (command === 'create_sale') return Promise.resolve({
        invoiceNumber: 'INV-20261119-000001',
        totalMinor: 1250,
      })
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
    await user.type(screen.getByLabelText('سعر الوحدة'), '12.50')
    await user.click(screen.getByRole('button', { name: 'حفظ المنتج' }))

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('create_product', expect.objectContaining({
        sku: 'MED-200',
        nameAr: 'دواء جديد',
        nameEn: 'New medicine',
        baseUnit: 'قرص',
        reorderLevelUnits: 0,
        salePriceMinor: 1250,
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
      expect(invokeMock).toHaveBeenCalledWith('set_settings', {
        settings: expect.objectContaining({
          pharmacy_name: 'صيدلية النور',
          pharmacy_address: '',
          pharmacy_phone: '',
          pharmacy_tax_number: '',
          pharmacy_logo: '',
        }),
      })
    })
  })

  it('creates a point-of-sale invoice with a generated number and enables printing', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'المبيعات' }))

    await user.click(await screen.findByRole('button', { name: /باراسيتامول/ }))
    await user.click(screen.getByRole('button', { name: 'حفظ فاتورة البيع' }))

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('create_sale', {
        customerId: null,
        items: [{ productId: 1, quantity: 1 }],
        status: 'paid',
      })
    })
    expect(await screen.findByText('INV-20261119-000001')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /طباعة الفاتورة/ })).toBeInTheDocument()
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
