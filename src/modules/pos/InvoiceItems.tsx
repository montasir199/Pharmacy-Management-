import { useState } from 'react'
import { Minus, Plus, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ProductSummary } from './types'

export type InvoiceLine = {
  productId: number
  saleUnitId: number | null
  soldQuantity: number
  baseUnitsPerUnit: number
  unitPriceMinor: number
  discountType: 'percent' | 'amount'
  discountValue: number
}

export type InvoiceBatch = {
  batchNumber: string
  expiryDate: string
  availableUnits: number
  isExpired: boolean
}

type Props = {
  items: InvoiceLine[]
  products: ProductSummary[]
  batchesByProduct: Record<number, InvoiceBatch[]>
  selectedProductId: number | null
  isArabic: boolean
  formatMoney: (amountMinor: number) => string
  formatDiscountAmount: (amountMinor: number) => string
  isNearExpiry: (date: string) => boolean
  onSelect: (productId: number) => void
  onQuantityChange: (productId: number, quantity: number) => void
  onUnitChange: (productId: number, saleUnitId: number) => void
  onDiscountChange: (productId: number, type: 'percent' | 'amount', value: string) => void
  onRemove: (productId: number) => void
}

function itemTotal(item: InvoiceLine) {
  const subtotal = item.soldQuantity * item.unitPriceMinor
  const discount = item.discountType === 'amount'
    ? Math.min(subtotal, item.discountValue)
    : Math.round(subtotal * item.discountValue / 10000)
  return subtotal - discount
}

function previewAllocations(item: InvoiceLine, batches: InvoiceBatch[]) {
  let remaining = item.soldQuantity * item.baseUnitsPerUnit
  return [...batches]
    .filter((batch) => !batch.isExpired && batch.availableUnits > 0)
    .sort((left, right) => left.expiryDate.localeCompare(right.expiryDate))
    .flatMap((batch) => {
      const units = Math.min(remaining, batch.availableUnits)
      remaining -= units
      return units > 0 ? [{ ...batch, units }] : []
    })
}

export function InvoiceItems({
  items,
  products,
  batchesByProduct,
  selectedProductId,
  isArabic,
  formatMoney,
  formatDiscountAmount,
  isNearExpiry,
  onSelect,
  onQuantityChange,
  onUnitChange,
  onDiscountChange,
  onRemove,
}: Props) {
  const { t } = useTranslation()
  const [discountInputValues, setDiscountInputValues] = useState<Record<number, string>>({})

  return (
    <div className="pos-cart-items table-scroll">
      <table className="invoice-items-table">
        <thead>
          <tr>
            <th>{t('product')}</th>
            <th>{t('quantityUnits')}</th>
            <th>{t('unitPrice')}</th>
            <th>{t('lineDiscount')}</th>
            <th>{t('amount')}</th>
            <th aria-label={t('removeItem')} />
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const product = products.find((entry) => entry.id === item.productId)
            if (!product) return null
            const productName = isArabic ? product.nameAr : product.nameEn
            const units = product.saleUnits ?? []
            const currentUnit = units.find((unit) => unit.id === item.saleUnitId)
            const maxQuantity = Math.floor(product.availableUnits / item.baseUnitsPerUnit)
            const batches = previewAllocations(item, batchesByProduct[item.productId] ?? [])
            const formattedDiscount = item.discountType === 'amount'
              ? formatDiscountAmount(item.discountValue)
              : (item.discountValue / 100).toString()
            const discountInput = discountInputValues[item.productId] ?? formattedDiscount
            return (
              <tr
                key={item.productId}
                className={selectedProductId === item.productId ? 'is-selected' : ''}
                onClick={() => onSelect(item.productId)}
                onFocus={() => onSelect(item.productId)}
              >
                <td>
                  <strong>{productName}</strong>
                  <small>{product.sku}</small>
                  <small>
                    {batches.length > 0
                      ? batches.map((batch) => `${batch.batchNumber} · ${batch.expiryDate} · ${batch.units}`).join(' / ')
                      : product.nearestExpiryDate
                        ? `${t('nearestExpiry')}: ${product.nearestExpiryDate}`
                        : t('fefoAllocationPending')}
                  </small>
                  {product.nearestExpiryDate && isNearExpiry(product.nearestExpiryDate) && (
                    <small className="pos-expiry-warning">{t('expiringSoon')}</small>
                  )}
                </td>
                <td>
                  <input
                    className="quantity-input"
                    aria-label={`${t('quantityUnits')} ${productName}`}
                    type="number"
                    min="1"
                    max={maxQuantity}
                    step="1"
                    value={item.soldQuantity}
                    onChange={(event) => {
                      const quantity = event.target.value === ''
                        ? 0
                        : Math.min(maxQuantity, Math.max(0, Number(event.target.value) || 0))
                      onQuantityChange(item.productId, quantity)
                    }}
                    onBlur={() => {
                      if (item.soldQuantity < 1) onQuantityChange(item.productId, 1)
                    }}
                  />
                  <span className="quantity-stepper">
                    <button
                      className="icon-button"
                      type="button"
                      aria-label={`${t('decreaseQuantity')} ${productName}`}
                      disabled={item.soldQuantity <= 1}
                      onClick={() => onQuantityChange(item.productId, item.soldQuantity - 1)}
                    >
                      <Minus size={13} />
                    </button>
                    <button
                      className="icon-button"
                      type="button"
                      aria-label={`${t('increaseQuantity')} ${productName}`}
                      disabled={item.soldQuantity >= maxQuantity}
                      onClick={() => onQuantityChange(item.productId, item.soldQuantity + 1)}
                    >
                      <Plus size={13} />
                    </button>
                  </span>
                  <label className="invoice-unit-select">
                    <span>{t('saleUnit')}</span>
                    <select
                      aria-label={`${t('saleUnit')} ${productName}`}
                      value={item.saleUnitId ?? ''}
                      onChange={(event) => onUnitChange(item.productId, Number(event.target.value))}
                    >
                      {units.map((unit) => (
                        <option key={unit.id} value={unit.id}>{unit.name}</option>
                      ))}
                      {currentUnit && !units.some((unit) => unit.id === currentUnit.id) && (
                        <option value={currentUnit.id}>{currentUnit.name}</option>
                      )}
                    </select>
                  </label>
                </td>
                <td>{formatMoney(item.unitPriceMinor)}</td>
                <td>
                  <select
                    className="discount-type-select"
                    aria-label={`${t('discountType')} ${productName}`}
                    value={item.discountType}
                    onChange={(event) => onDiscountChange(item.productId, event.target.value as 'percent' | 'amount', discountInput)}
                  >
                    <option value="percent">{t('discountPercent')}</option>
                    <option value="amount">{t('discountAmount')}</option>
                  </select>
                  <input
                    className="discount-input"
                    aria-label={`${item.discountType === 'amount' ? t('discountAmount') : t('lineDiscount')} ${productName}`}
                    type="number"
                    min="0"
                    max={item.discountType === 'percent' ? '100' : undefined}
                    step={item.discountType === 'percent' ? '0.01' : 'any'}
                    value={discountInput}
                    onChange={(event) => {
                      const value = event.target.value
                      setDiscountInputValues((current) => ({ ...current, [item.productId]: value }))
                      onDiscountChange(item.productId, item.discountType, value)
                    }}
                  />
                </td>
                <td><strong>{formatMoney(itemTotal(item))}</strong></td>
                <td>
                  <button
                    className="icon-button remove-item-button"
                    type="button"
                    aria-label={`${t('removeItem')} ${productName}`}
                    onClick={() => {
                      setDiscountInputValues((current) => {
                        const next = { ...current }
                        delete next[item.productId]
                        return next
                      })
                      onRemove(item.productId)
                    }}
                  >
                    <X size={15} />
                  </button>
                </td>
              </tr>
            )
          })}
          {items.length === 0 && <tr><td colSpan={6} className="inventory-empty">{t('emptySaleCart')}</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
