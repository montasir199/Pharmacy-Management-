import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import i18n from './i18n'

const invokeMock = vi.hoisted(() => vi.fn())
const isTauriMock = vi.hoisted(() => vi.fn(() => false))
vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
  isTauri: isTauriMock,
}))
vi.mock('html-to-image', () => ({
  toPng: vi.fn().mockResolvedValue('data:image/png;base64,aGVsbG8='),
}))
vi.mock('react-barcode', () => ({ default: () => null }))
vi.mock('@tauri-apps/plugin-updater', () => ({
  check: vi.fn().mockResolvedValue(null),
}))

describe('main application shell', () => {
  beforeEach(async () => {
    localStorage.clear()
    await i18n.changeLanguage('ar')
    invokeMock.mockReset()
    isTauriMock.mockReturnValue(false)
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
        nearestExpiryDate: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
      }])
      if (command === 'list_currencies') return Promise.resolve([{
        code: 'SAR',
        name: 'Saudi riyal',
        symbol: 'ر.س',
        minorUnitExponent: 2,
      }])
      if (command === 'create_sale') return Promise.resolve({
        id: 1,
        invoiceNumber: 'INV-20261119-000001',
        totalMinor: 1250,
      })
      if (command === 'get_sale') return Promise.resolve({
        id: 1,
        invoiceNumber: 'INV-20261119-000001',
        subtotalMinor: 1250,
        discountMinor: 0,
        taxMinor: 0,
        totalMinor: 1250,
        customerName: null,
        soldAt: new Date().toISOString(),
        currencyCode: 'SAR',
        exchangeRateScaled: 1000000000,
        taxRateBasisPoints: 0,
        items: [{
          productNameAr: 'باراسيتامول',
          productNameEn: 'Paracetamol',
          quantity: 1,
          unitPriceMinor: 1250,
          discountMinor: 0,
          lineTotalMinor: 1250,
        }],
        payments: [{ method: 'cash', amountMinor: 1250, currencyCode: 'SAR' }],
      })
      if (command === 'get_setting') return Promise.resolve('')
      return Promise.resolve([])
    })
  })

  it('starts in Arabic with right-to-left layout and switches to English', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(document.querySelector('.app-shell')).toHaveClass('luxury-theme')
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
    expect(await screen.findByText('أدوية تقترب من انتهاء الصلاحية')).toBeInTheDocument()
  })

  it('loads the real product catalog and filters it from global search', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'المنتجات' }))
    expect(await screen.findByText('Paracetamol')).toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: 'ابحث عن دواء أو رمز منتج...' }), 'missing')
    expect(screen.queryByText('Paracetamol')).not.toBeInTheDocument()
  })

  it('highlights products at or below their reorder threshold', async () => {
    const user = userEvent.setup()
    const originalInvoke = invokeMock.getMockImplementation()
    invokeMock.mockImplementation((command: string, args: Record<string, unknown>) => {
      if (command === 'list_products') return Promise.resolve([
        {
          id: 1, sku: 'MED-100', barcode: '628100', nameAr: 'باراسيتامول', nameEn: 'Paracetamol',
          baseUnit: 'قرص', reorderLevelUnits: 5, salePriceMinor: 1250, availableUnits: 24,
          nearestExpiryDate: null,
        },
        {
          id: 2, sku: 'MED-200', barcode: null, nameAr: 'أموكسيسيلين', nameEn: 'Amoxicillin',
          baseUnit: 'كبسولة', reorderLevelUnits: 10, salePriceMinor: 2500, availableUnits: 3,
          nearestExpiryDate: null,
        },
      ])
      return originalInvoke?.(command, args)
    })
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'المخزون' }))

    expect(await screen.findByText('أصناف قاربت على النفاد')).toBeInTheDocument()
    expect(screen.getByText('المتوفر 3 · حد إعادة الطلب 10')).toBeInTheDocument()
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

  it('updates the product reorder threshold through the local database command', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'المخزون' }))

    const reorderInput = await screen.findByRole('spinbutton', { name: 'حد إعادة الطلب باراسيتامول' })
    await user.clear(reorderInput)
    await user.type(reorderInput, '12')
    await user.click(screen.getByRole('button', { name: 'حفظ الحد' }))

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('update_product_reorder_level', {
        productId: 1,
        reorderLevelUnits: 12,
      })
    })
  })

  it('uses the selected system currency without an exchange-rate field or conversion', async () => {
    const user = userEvent.setup()
    const originalInvoke = invokeMock.getMockImplementation()
    invokeMock.mockImplementation((command: string, args: Record<string, unknown>) => {
      if (command === 'list_currencies') return Promise.resolve([
        { code: 'SAR', name: 'Saudi riyal', symbol: 'SAR', minorUnitExponent: 2 },
        { code: 'USD', name: 'US Dollar', symbol: 'USD', minorUnitExponent: 2 },
      ])
      if (command === 'get_setting') {
        if (args?.key === 'default_currency_code') return Promise.resolve('SAR')
        return Promise.resolve('')
      }
      return originalInvoke?.(command, args)
    })
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'الإعدادات' }))
    await user.type(await screen.findByLabelText('اسم الصيدلية'), 'صيدلية الاختبار')
    await user.selectOptions(await screen.findByLabelText('العملة الافتراضية للنظام'), 'USD')
    expect(screen.queryByText(/سعر الصرف/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'حفظ الإعدادات' }))
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('set_settings', {
        settings: expect.objectContaining({ default_currency_code: 'USD' }),
      })
    })
    expect(invokeMock).not.toHaveBeenCalledWith('set_settings', expect.objectContaining({
      settings: expect.objectContaining({ default_currency_exchange_rate: expect.anything() }),
    }))
    await user.click(screen.getByRole('button', { name: 'المبيعات' }))
    expect(screen.queryByRole('combobox', { name: 'العملة' })).not.toBeInTheDocument()
    expect(screen.getByText(/USD/)).toBeInTheDocument()
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

  it('saves an independent Ethernet printer profile', async () => {
    const user = userEvent.setup()
    const originalInvoke = invokeMock.getMockImplementation()
    invokeMock.mockImplementation((command: string, args: Record<string, unknown>) => {
      if (command === 'list_printers') return Promise.resolve([])
      if (command === 'save_printer') return Promise.resolve(3)
      return originalInvoke?.(command, args)
    })
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'الإعدادات' }))

    await user.type(await screen.findByLabelText('اسم الطابعة'), 'Thermal LAN')
    await user.selectOptions(screen.getByLabelText('نوع الاتصال'), 'network')
    await user.type(screen.getByLabelText('عنوان IP للطابعة'), '192.168.1.40')
    expect(screen.getByLabelText('اسم الطابعة')).toHaveValue('Thermal LAN')
    expect(screen.getByLabelText('نوع الاتصال')).toHaveValue('network')
    expect(screen.getByLabelText('عنوان IP للطابعة')).toHaveValue('192.168.1.40')
    expect(screen.getByLabelText('منفذ الشبكة')).toHaveValue(9100)
    await user.click(screen.getByRole('button', { name: 'حفظ الطابعة' }))

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('save_printer', {
        printer: expect.objectContaining({
          name: 'Thermal LAN',
          connectionType: 'network',
          host: '192.168.1.40',
          port: 9100,
          paperWidth: '80mm',
          dpi: 203,
          autoCut: true,
        }),
      })
    })
  })

  it('creates a point-of-sale invoice with a generated number and enables printing', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'المبيعات' }))

    await user.click(await screen.findByRole('button', { name: /إضافة للفاتورة باراسيتامول/ }))
    await user.click(screen.getByRole('button', { name: /إتمام البيع/ }))

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('create_sale', {
        customerId: null,
        items: [{ productId: 1, quantity: 1, discountBasisPoints: 0 }],
        status: 'paid',
        payments: [{ method: 'cash', amountMinor: 1250, currencyCode: 'SAR' }],
        currencyCode: 'SAR',
        exchangeRateScaled: 1000000000,
      })
    })
    expect(await screen.findByText('INV-20261119-000001')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /طباعة الفاتورة/ })).toBeInTheDocument()
    expect(screen.getByText('شكرًا لزيارتكم')).toBeInTheDocument()
    expect(screen.getByText('المبلغ المدفوع')).toBeInTheDocument()
    expect(document.querySelector('.receipt-code-row svg')).toBeInTheDocument()
  })

  it('records a printer failure without undoing the saved sale', async () => {
    const user = userEvent.setup()
    const defaultPrinter = {
      id: 8,
      name: 'Receipt printer',
      connectionType: 'network',
      vendorId: null,
      productId: null,
      host: '192.168.1.40',
      port: 9100,
      paperWidth: '80mm',
      dpi: 203,
      copies: 1,
      autoCut: true,
      autoPrint: false,
      printLogo: true,
      fontSize: 12,
      isDefault: true,
    }
    const originalInvoke = invokeMock.getMockImplementation()
    isTauriMock.mockReturnValue(true)
    invokeMock.mockImplementation((command: string, args: Record<string, unknown>) => {
      if (command === 'list_printers') return Promise.resolve([defaultPrinter])
      if (command === 'print_sale_receipt') return Promise.resolve({
        id: 4,
        saleId: args.saleId,
        printerId: args.printerId,
        jobType: 'sale',
        status: 'failed',
        attemptCount: 1,
        lastError: 'network printer unavailable',
        createdAt: new Date().toISOString(),
      })
      return originalInvoke?.(command, args)
    })
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'المبيعات' }))
    await user.click(await screen.findByRole('button', { name: /إضافة للفاتورة باراسيتامول/ }))
    await user.click(screen.getByRole('button', { name: /إتمام البيع/ }))
    await screen.findByText('INV-20261119-000001')
    await user.click(screen.getByRole('button', { name: /طباعة الفاتورة/ }))

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('print_sale_receipt', expect.objectContaining({
        saleId: 1,
        printerId: 8,
        pngBase64: 'aGVsbG8=',
      }))
    })
    expect(screen.getByText('INV-20261119-000001')).toBeInTheDocument()
    expect(screen.getByText('network printer unavailable')).toBeInTheDocument()
  })

  it('adds a product when a barcode scanner submits an exact barcode', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'المبيعات' }))

    const barcode = await screen.findByRole('textbox', { name: 'امسح الباركود أو اكتبه' })
    await user.type(barcode, '628100{Enter}')

    expect(await screen.findByLabelText('الكمية بوحدة المنتج باراسيتامول')).toHaveValue(1)
  })

  it('updates line discounts and requires a complete split payment before checkout', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'المبيعات' }))
    await user.click(await screen.findByRole('button', { name: /إضافة للفاتورة باراسيتامول/ }))

    await user.clear(screen.getByLabelText('الكمية بوحدة المنتج باراسيتامول'))
    await user.type(screen.getByLabelText('الكمية بوحدة المنتج باراسيتامول'), '2')
    await user.clear(screen.getByLabelText('خصم % باراسيتامول'))
    await user.type(screen.getByLabelText('خصم % باراسيتامول'), '10')
    await user.click(screen.getByRole('button', { name: 'دفع مختلط' }))

    const completeSale = screen.getByRole('button', { name: /إتمام البيع/ })
    expect(completeSale).toBeDisabled()

    await user.type(screen.getByLabelText('نقدًا'), '10')
    await user.type(screen.getByLabelText('بطاقة'), '12.5')
    expect(completeSale).toBeEnabled()
    await user.click(completeSale)

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('create_sale', expect.objectContaining({
        items: [{ productId: 1, quantity: 2, discountBasisPoints: 1000 }],
        payments: [
          { method: 'cash', amountMinor: 1000, currencyCode: 'SAR' },
          { method: 'card', amountMinor: 1250, currencyCode: 'SAR' },
        ],
      }))
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
