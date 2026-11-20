export type ProductSummary = {
  id: number
  sku: string
  barcode: string | null
  nameAr: string
  nameEn: string
  baseUnit: string
  reorderLevelUnits: number
  salePriceMinor: number
  availableUnits: number
  nearestExpiryDate: string | null
}

export type SaleStockFilter = 'all' | 'available' | 'low' | 'out'
