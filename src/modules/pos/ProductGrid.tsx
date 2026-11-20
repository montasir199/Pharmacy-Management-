import { Info, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ProductSummary, SaleStockFilter } from './types'

type Props = {
  products: ProductSummary[]
  totalProducts: number
  availableCount: number
  lowStockCount: number
  outOfStockCount: number
  categories: string[]
  category: string
  filter: SaleStockFilter
  inventoryLoading: boolean
  isArabic: boolean
  formatPrice: (amountMinor: number) => string
  onFilterChange: (filter: SaleStockFilter) => void
  onCategoryChange: (category: string) => void
  onAddProduct: (productId: number) => void
  onShowProductInfo: (productId: number) => void
}

export function ProductGrid({
  products,
  totalProducts,
  availableCount,
  lowStockCount,
  outOfStockCount,
  categories,
  category,
  filter,
  inventoryLoading,
  isArabic,
  formatPrice,
  onFilterChange,
  onCategoryChange,
  onAddProduct,
  onShowProductInfo,
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
      {categories.length > 0 && (
        <div className="pos-category-grid" role="group" aria-label={t('productCategories')}>
          <button
            type="button"
            className={category === '' ? 'pos-category-chip is-active' : 'pos-category-chip'}
            aria-pressed={category === ''}
            onClick={() => onCategoryChange('')}
          >
            {t('allCategories')}
          </button>
          {categories.map((item) => (
            <button
              type="button"
              className={category === item ? 'pos-category-chip is-active' : 'pos-category-chip'}
              aria-pressed={category === item}
              key={item}
              onClick={() => onCategoryChange(item)}
            >
              {item}
            </button>
          ))}
        </div>
      )}
      <div className="pos-product-grid" role="list" aria-label={t('posProducts')}>
        {products.map((product) => {
          const productName = isArabic ? product.nameAr : product.nameEn
          const isLowStock = product.availableUnits <= product.reorderLevelUnits
          const isOutOfStock = product.availableUnits === 0
          const baseUnit = product.saleUnits?.find((unit) => unit.isBaseUnit)
          const salePrice = baseUnit?.salePriceMinor ?? product.salePriceMinor
          return (
            <article
              className={`pos-product-card${isOutOfStock ? ' is-out' : ''}${isLowStock ? ' is-low' : ''}`}
              key={product.id}
              role="listitem"
            >
              <button
                className="pos-product-card-main"
                type="button"
                onClick={() => onAddProduct(product.id)}
                disabled={inventoryLoading || isOutOfStock || salePrice <= 0}
                aria-label={productName}
              >
                <div className="pos-product-card-top">
                  <div className="pos-product-identity">
                    <h4>{productName}</h4>
                    <span>{product.sku}</span>
                  </div>
                  <span className={isOutOfStock ? 'pos-stock-state is-out' : isLowStock ? 'pos-stock-state is-low' : 'pos-stock-state is-available'}>
                    {isOutOfStock ? t('posFilterOutOfStock') : isLowStock ? t('stockLow') : t('posFilterAvailable')}
                  </span>
                </div>
                {product.category && <span className="pos-product-category">{product.category}</span>}
                <div className="pos-product-card-price">{formatPrice(salePrice)}</div>
                <div className="pos-product-card-details">
                  <div><span>{t('barcode')}</span><strong>{product.barcode || '—'}</strong></div>
                  <div><span>{t('availableUnits')}</span><strong className={isLowStock ? 'stock-low' : 'stock-ok'}>{product.availableUnits} {product.baseUnit}</strong></div>
                  <div><span>{t('nearestExpiry')}</span><strong>{product.nearestExpiryDate || '—'}</strong></div>
                </div>
              </button>
              <button
                className="icon-button pos-product-info"
                type="button"
                aria-label={`${t('productBatchInfo')} ${productName}`}
                title={t('productBatchInfo')}
                onClick={() => onShowProductInfo(product.id)}
              >
                <Info size={16} />
              </button>
              <button
                className="pos-product-add"
                type="button"
                aria-label={`${t('addToInvoice')} ${productName}`}
                onClick={() => onAddProduct(product.id)}
                disabled={inventoryLoading || isOutOfStock || salePrice <= 0}
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
