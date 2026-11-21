import { useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { ChevronDown, Trash2, UserRoundPlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

type Customer = { id: number; name: string }

type Props = {
  invoiceNumber: number | null
  startedAt: string
  customers: Customer[]
  customerRef: RefObject<HTMLSelectElement | null>
  customerId: string
  note: string
  itemCount: number
  totalQuantity: number
  subtotal: string
  discount: string
  tax: string
  taxRate: string
  total: string
  canClear: boolean
  canHold: boolean
  paymentDisabled: boolean
  customerExtra?: ReactNode
  tabs?: ReactNode
  children: ReactNode
  onCustomerChange: (customerId: string) => void
  onCreateCustomer: () => void
  onNoteChange: (note: string) => void
  onClear: () => void
  onHold: () => void
  onPayment: () => void
}

export function InvoicePanel({
  invoiceNumber,
  startedAt,
  customers,
  customerRef,
  customerId,
  note,
  itemCount,
  totalQuantity,
  subtotal,
  discount,
  tax,
  taxRate,
  total,
  canClear,
  canHold,
  paymentDisabled,
  customerExtra,
  tabs,
  children,
  onCustomerChange,
  onCreateCustomer,
  onNoteChange,
  onClear,
  onHold,
  onPayment,
}: Props) {
  const { t } = useTranslation()
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)

  return (
    <section className="panel pos-cart">
      {tabs}
      <div className="panel-heading pos-invoice-heading">
        <div><h3>{t('currentSale')}</h3><p>{t('invoiceNumberPending')}</p></div>
        <div className="pos-invoice-actions">
          <div className="pos-invoice-options">
            <button
              className="text-button"
              type="button"
              aria-expanded={optionsOpen}
              onClick={() => setOptionsOpen((open) => !open)}
            >
              {t('invoiceOptions')}<ChevronDown size={15} />
            </button>
            {optionsOpen && (
              <div className="pos-invoice-menu">
                <button type="button" disabled={!canHold} onClick={() => { onHold(); setOptionsOpen(false) }}>{t('holdInvoice')}</button>
                <button type="button" onClick={() => { setNoteOpen((open) => !open); setOptionsOpen(false) }}>{t('invoiceNote')}</button>
              </div>
            )}
          </div>
          <button className="text-button clear-invoice-button" type="button" onClick={onClear} disabled={!canClear}>
            <Trash2 size={16} />{t('clearInvoice')}
          </button>
        </div>
      </div>
      <div className="invoice-meta">
        <div><span>{t('invoice')}</span><strong>{invoiceNumber === null ? '—' : `#${invoiceNumber}`}</strong></div>
        <div><span>{t('invoiceTime')}</span><strong>{startedAt || '—'}</strong></div>
      </div>
      <div className="customer-picker">
        <label>
          <span>{t('customer')}</span>
          <select ref={customerRef} value={customerId} onChange={(event) => onCustomerChange(event.target.value)}>
            <option value="">{t('cashCustomer')}</option>
            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
          </select>
        </label>
        <button className="icon-button" type="button" aria-label={t('addCustomerInline')} onClick={onCreateCustomer}>
          <UserRoundPlus size={18} />
        </button>
      </div>
      {customerExtra}
      {noteOpen && (
        <label className="invoice-note-field">
          <span>{t('invoiceNote')}</span>
          <textarea maxLength={2000} value={note} onChange={(event) => onNoteChange(event.target.value)} />
        </label>
      )}
      {children}
      <div className="invoice-summary">
        <div><span>{t('itemCount')}</span><strong>{itemCount}</strong></div>
        <div><span>{t('totalQuantity')}</span><strong>{totalQuantity}</strong></div>
        <div><span>{t('subtotal')}</span><strong>{subtotal}</strong></div>
        <div><span>{t('discounts')}</span><strong>{discount}</strong></div>
        <div><span>{t('vat')} ({taxRate})</span><strong>{tax}</strong></div>
        <div className="invoice-grand-total"><span>{t('netTotal')}</span><strong>{total}</strong></div>
      </div>
      <button className="primary-button complete-sale-button" type="button" onClick={onPayment} disabled={paymentDisabled}>
        {t('proceedToPayment')}<span>F4</span>
      </button>
      <small className="pos-shortcuts-hint">{t('posKeyboardShortcuts')}</small>
    </section>
  )
}
