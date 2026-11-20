import type { RefObject } from 'react'
import { ScanLine, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ProductSummary } from './types'
import { normalizeProductSearch } from './search'

type Props = {
  products: ProductSummary[]
  search: string
  barcode: string
  searchRef: RefObject<HTMLInputElement | null>
  barcodeRef: RefObject<HTMLInputElement | null>
  onSearchChange: (value: string) => void
  onBarcodeChange: (value: string) => void
  onAddProduct: (productId: number) => void
  onScan: (value: string) => void
}

export function ProductSearch({
  products,
  search,
  barcode,
  searchRef,
  barcodeRef,
  onSearchChange,
  onBarcodeChange,
  onAddProduct,
  onScan,
}: Props) {
  const { t } = useTranslation()

  function submitSearch() {
    const query = normalizeProductSearch(search)
    if (!query) return
    const exact = products.find((product) =>
      normalizeProductSearch(product.barcode ?? '') === query
      || normalizeProductSearch(product.sku) === query)
    const matches = products.filter((product) =>
      [product.nameAr, product.nameEn, product.sku, product.barcode ?? '']
        .some((value) => normalizeProductSearch(value).includes(query)))
    const selectedProduct = exact ?? (matches.length === 1 ? matches[0] : undefined)
    if (selectedProduct) {
      onAddProduct(selectedProduct.id)
      onSearchChange('')
    }
  }

  return (
    <>
      <label className="product-search sale-search">
        <Search size={18} />
        <input
          ref={searchRef}
          aria-label={t('searchProducts')}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            submitSearch()
          }}
          placeholder={t('searchProducts')}
        />
        <kbd>F2</kbd>
      </label>
      <label className="product-search barcode-search">
        <ScanLine size={18} />
        <input
          ref={barcodeRef}
          aria-label={t('scanBarcode')}
          value={barcode}
          onChange={(event) => onBarcodeChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            onScan(barcode)
          }}
          placeholder={t('scanBarcode')}
        />
        <kbd>F6</kbd>
      </label>
    </>
  )
}
