import { CreditCard, DollarSign, Landmark, ScanLine, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export type PaymentMethod = 'cash' | 'card' | 'bank_transfer' | 'mixed'
export type PaymentAmounts = Record<'cash' | 'card' | 'bank_transfer', string>

type Props = {
  open: boolean
  currencyCode: string
  currencyName: string
  paymentMethod: PaymentMethod
  paymentAmounts: PaymentAmounts
  invoiceTotalMinor: number
  paymentTotalMinor: number
  remainingMinor: number
  changeMinor: number
  currencyExponent: number
  submitting: boolean
  onClose: () => void
  onMethodChange: (method: PaymentMethod) => void
  onAmountChange: (amounts: PaymentAmounts) => void
  onComplete: () => void
  formatMinor: (amountMinor: number, currencyCode: string) => string
}

export function PaymentDialog({
  open,
  currencyCode,
  currencyName,
  paymentMethod,
  paymentAmounts,
  invoiceTotalMinor,
  paymentTotalMinor,
  remainingMinor,
  changeMinor,
  currencyExponent,
  submitting,
  onClose,
  onMethodChange,
  onAmountChange,
  onComplete,
  formatMinor,
}: Props) {
  const { t } = useTranslation()
  if (!open) return null

  const methods: PaymentMethod[] = ['cash', 'card', 'bank_transfer', 'mixed']
  const splitMethods: Array<Exclude<PaymentMethod, 'mixed'>> = ['cash', 'card', 'bank_transfer']

  return (
    <div className="pos-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section
        className="payment-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-dialog-title"
        onKeyDown={(event) => {
          if (event.key === 'F8' && !submitting && paymentTotalMinor >= invoiceTotalMinor && invoiceTotalMinor > 0) {
            event.preventDefault()
            onComplete()
          }
        }}
      >
        <div className="payment-dialog-heading">
          <div>
            <h3 id="payment-dialog-title">{t('paymentMethods')}</h3>
            <p>{t('paymentDue', { amount: formatMinor(invoiceTotalMinor, currencyCode) })}</p>
          </div>
          <button className="icon-button" type="button" aria-label={t('close')} onClick={onClose}><X size={18} /></button>
        </div>
        <div className="active-currency-display">
          <span>{t('currency')}</span>
          <strong>{currencyCode} · {currencyName}</strong>
        </div>
        <div className="payment-methods">
          {methods.map((method) => {
            const Icon = method === 'cash' ? DollarSign : method === 'card' ? CreditCard : method === 'bank_transfer' ? Landmark : ScanLine
            return (
              <button
                className={`payment-method ${paymentMethod === method ? 'is-active' : ''}`}
                type="button"
                key={method}
                aria-pressed={paymentMethod === method}
                onClick={() => onMethodChange(method)}
              >
                <Icon size={17} />
                <span>{t(method === 'bank_transfer' ? 'bankTransfer' : method === 'mixed' ? 'mixedPayment' : method)}</span>
              </button>
            )
          })}
        </div>
        {paymentMethod === 'mixed' ? (
          <div className="mixed-payment-fields">
            {splitMethods.map((method) => (
              <label key={method}>
                <span>{t(method === 'bank_transfer' ? 'bankTransfer' : method)}</span>
                <input
                  autoFocus={method === 'cash'}
                  data-payment-field
                  type="number"
                  min="0"
                  step="any"
                  value={paymentAmounts[method]}
                  onChange={(event) => onAmountChange({ ...paymentAmounts, [method]: event.target.value })}
                />
              </label>
            ))}
          </div>
        ) : (
          <label className="payment-amount-field">
            <span>{t('paidAmount')}</span>
            <input
              autoFocus
              type="number"
              data-payment-field
              min="0"
              step="any"
              value={paymentAmounts[paymentMethod]}
              placeholder={(invoiceTotalMinor / (10 ** currencyExponent)).toFixed(currencyExponent)}
              onChange={(event) => onAmountChange({ ...paymentAmounts, [paymentMethod]: event.target.value })}
            />
          </label>
        )}
        <div className="payment-balance">
          <div><span>{t('remainingAmount')}</span><strong>{formatMinor(remainingMinor, currencyCode)}</strong></div>
          <div><span>{t('changeDue')}</span><strong>{formatMinor(changeMinor, currencyCode)}</strong></div>
          <div><span>{t('paidAmount')}</span><strong>{formatMinor(paymentTotalMinor, currencyCode)}</strong></div>
        </div>
        <div className="payment-dialog-actions">
          <button className="text-button" type="button" onClick={onClose}>{t('cancel')}</button>
          <button
            className="primary-button complete-sale-button"
            type="button"
            onClick={onComplete}
            disabled={submitting || paymentTotalMinor < invoiceTotalMinor || invoiceTotalMinor <= 0}
          >
            {submitting ? t('loading') : t('completeSale')}<span>F8</span>
          </button>
        </div>
      </section>
    </div>
  )
}
