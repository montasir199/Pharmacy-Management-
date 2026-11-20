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

export type PosDraftItem = {
  productId: number
  saleUnitId: number | null
  soldQuantity: number
  baseUnitsPerUnit: number
  unitPriceMinor: number
  discountType: 'percent' | 'amount'
  discountValue: number
}

export type PosDraft = {
  id: number
  createdAt: string
  updatedAt: string
  customerId: number | null
  note: string
  currencyCode: string
  exchangeRateScaled: number
  paymentMethod: 'cash' | 'card' | 'bank_transfer' | 'mixed'
  cashPaidMinor: number
  cardPaidMinor: number
  bankTransferPaidMinor: number
  items: PosDraftItem[]
}
