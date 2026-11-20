export type ProductSaleUnit = {
  id: number
  name: string
  baseUnitsPerUnit: number
  salePriceMinor: number
  isBaseUnit: boolean
}

export type ProductSummary = {
  id: number
  sku: string
  barcode: string | null
  nameAr: string
  nameEn: string
  baseUnit: string
  category: string
  reorderLevelUnits: number
  salePriceMinor: number
  availableUnits: number
  nearestExpiryDate: string | null
  saleUnits: ProductSaleUnit[]
}

export type SaleStockFilter = 'all' | 'available' | 'low' | 'out'
