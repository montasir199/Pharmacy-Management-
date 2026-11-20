import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ProductSummary, SaleStockFilter } from './types'

type Props = {
  products: ProductSummary[]
  totalProducts: number
  availableCount: number
  lowStockCount: number
  outOfStockCount: number
  filter: SaleStockFilter
  inventoryLoading: boolean
  isArabic: boolean
  formatPrice: (amountMinor: number) => string
  onFilterChange: (filter: SaleStockFilter) => void
  onAddProduct: (productId: number) => void
}

export function ProductGrid({
  products,
  totalProducts,
  availableCount,
  lowStockCount,
  outOfStockCount,
  filter,
  inventoryLoading,
  isArabic,
  formatPrice,
  onFilterChange,
  onAddProduct,
}: Props) {
  const { t } = useTranslation()

  const filters: { key: SaleStockFilter; label: string; count: number }[] = [
    { key: 'all', label: t('posFilterAll'), count: totalProducts },
    { key: 'available', label: t('posFilterAvailable'), count: availableCount },
    { key: 'low', label: t('posFilterLowStock'), count: lowStockCount },
    { key: 'out', label: t('posFilterOutOfStock'), count: outOfStockCount },
  ]

  return (
    <>
      <div className="pos-stock-filters" role="group" aria-label={t('posStockFilters')}>
        {filters.map(({ key, label, count }) => (
          <button
            type="button"
            className={filter === key ? 'pos-stock-filter is-active' : 'pos-stock-filter'}
            aria-pressed={filter === key}
            key={key}
            onClick={() => onFilterChange(key)}
          >
            {label} <span>{count}</span>
          </button>
        ))}
        <span className="pos-result-count">{t('posShowingProducts', { count: products.length })}</span>
      </div>
      <div className="pos-product-grid" role="list" aria-label={t('posProducts')}>
        {products.map((product) => {
          const productName = isArabic ? product.nameAr : product.nameEn
          const isLowStock = product.availableUnits <= product.reorderLevelUnits
          const isOutOfStock = product.availableUnits === 0
          return (
            <article className="pos-product-card" key={product.id} role="listitem">
              <div className="pos-product-card-top">
                <div className="pos-product-identity">
                  <h4>{productName}</h4>
                  <span>{product.sku}</span>
                </div>
                <span className={isOutOfStock ? 'pos-stock-state is-out' : isLowStock ? 'pos-stock-state is-low' : 'pos-stock-state is-available'}>
                  {isOutOfStock ? t('posFilterOutOfStock') : isLowStock ? t('stockLow') : t('posFilterAvailable')}
                </span>
              </div>
              <div className="pos-product-card-price">{formatPrice(product.salePriceMinor)}</div>
              <div className="pos-product-card-details">
                <div><span>{t('barcode')}</span><strong>{product.barcode || '—'}</strong></div>
                <div><span>{t('availableUnits')}</span><strong className={isLowStock ? 'stock-low' : 'stock-ok'}>{product.availableUnits}</strong></div>
                <div><span>{t('nearestExpiry')}</span><strong>{product.nearestExpiryDate || '—'}</strong></div>
              </div>
              <button
                className="pos-product-add"
                type="button"
                aria-label={`${t('addToInvoice')} ${productName}`}
                onClick={() => onAddProduct(product.id)}
                disabled={isOutOfStock || product.salePriceMinor <= 0}
              >
                <Plus size={16} />
                <span>{t('addToInvoice')}</span>
              </button>
            </article>
          )
        })}
        {products.length === 0 && !inventoryLoading && (
          <div className="pos-catalog-empty">{t(totalProducts === 0 ? 'noProducts' : 'noSearchResults')}</div>
        )}
        {inventoryLoading && totalProducts === 0 && (
          <div className="pos-catalog-empty">{t('loading')}</div>
        )}
      </div>
    </>
  )
}
