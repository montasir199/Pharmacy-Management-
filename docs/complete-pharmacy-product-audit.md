# Comprehensive Pharmacy Product Audit & Roadmap

Audit date: 2026-11-20  
Repository: https://github.com/montasir199/Pharmacy-Management-  
Target: Arabic-first, luxury-quality, offline-capable Windows pharmacy desktop product.

## 1. Executive findings

The current application is a sound desktop MVP built with Tauri 2, React 19, TypeScript, Rust, and SQLite. It already has valuable foundations: local database storage under AppData, versioned SQLite migrations, pre-migration backups, immutable stock movements, FEFO batch dispensing, barcode-aware POS, split payments, receipt reprinting, ESC/POS USB/network printing, Arabic/English, light/dark themes, and a signed Windows updater.

It is not yet a full pharmacy ERP. The visible application currently has eight navigation areas: Dashboard, POS/Sales, Products, Inventory, Purchases, Customers, Reports, and Settings. The largest functional gaps are suppliers as managed records, purchase-order lifecycle and multi-line receiving, sales returns/refunds, cash drawer and shifts, expenses, accounting ledgers, role-based users, audit trail, batch-level traceability from receipt to sold invoice, advanced pharmacy product data, prescription workflows, insurance, multi-branch operation, and jurisdiction-specific integrations.

The frontend is concentrated in a single large App.tsx (~2,425 lines) and App.css (~2,666 lines). This increases change risk and makes page-level testing and maintenance harder. The first architecture improvement should be incremental extraction into typed feature modules; do not combine a large rewrite with database changes.

## 2. Existing implementation verified in source

### Application and deployment
- Tauri 2 desktop shell, React 19, TypeScript, Vite, Rust, SQLite.
- Offline-first local database; no required hosted database for core workflows.
- SQLite migrations 0001–0006 and a pre-migration backup mechanism.
- Arabic RTL and English LTR; light and dark themes.
- Windows NSIS installer and signed updater manifest workflow.
- App version is 0.2.2 in package.json and tauri.conf.json. Cargo.toml still reports 0.2.1; align this metadata in this branch.

### Existing navigation and pages
1. Dashboard: daily sales, order count, stock units, low-stock count, 7-day sales visualization, quick actions, recent sales.
2. Sales/POS: product search, barcode entry, cart, line discounts, mixed tender (cash/card/bank transfer), customer selection/quick creation, tax, invoice, receipt, print history and reprint.
3. Products: searchable catalog and basic product fields.
4. Inventory: product creation, batch receiving, reorder levels, stock balance and batch ledger, low-stock and expiry alerts.
5. Purchases: a basic one-product purchase form that receives stock immediately.
6. Customers: basic customer creation and list.
7. Reports: currently a small summary of paid sales, invoice count and stock units; this is not yet a full reporting suite.
8. Settings: pharmacy identity, tax, global currency, logo, updater, thermal printer profiles and test printing.

### Existing backend
- Product creation and price/reorder-level updates.
- Batch receiving, FEFO dispensing and batch balances.
- Sales, payments, customers, basic purchases and dashboard queries.
- Settings and currency list.
- Thermal printer discovery, ESC/POS receipt jobs and retry.
- Current Rust command surface does not yet expose suppliers, expense management, sales return/refund, cash shifts, users/roles, audit logs, prescription/insurance, or branch transfers.

## 3. Competitor research and transferable patterns

This is a capability benchmark, not an instruction to copy a vendor UI or assume every advertised feature is verified.

- PioneerRx / BestRx / Liberty: workflow queues, pharmacy-centric checkout, prescription-related operations, inventory, staff workflows, reporting and integrations.
- DawaTech (Saudi pharmacy ERP): offline workflow, batch/GTIN traceability, near-expiry actions, branch stock transfer, supplier purchasing, accounting, ZATCA e-invoicing, Wasfaty/RSD-related integration claims.
- PharmaSync: offline desktop and LAN-oriented workflows, FEFO, mobile stock/POS concepts, purchase and stock movement visibility, audit trails, backups, roles, recurring supply orders and operational analytics.
- Pharmacy POS category patterns: batch/expiry traceability, supplier aging, FEFO, stock counts, returns, cash drawer shifts, mixed payments, barcode labels, customer loyalty, delivery and multi-branch analytics.

Reference sources:
- https://www.pioneerrx.com/
- https://bestrx.com/
- https://dawatech.com/en/erp
- https://pharmasync.app/en/features/
- https://www.softwareadvice.com/retail/pharmacy-comparison/small-business/
- https://www.appintent.com/software/point-of-sale/retail/pharmacy/
- https://zatca.gov.sa/en/E-Invoicing/Introduction/FAQ/Documents/E-Invoicing%20FAQ%20En.pdf

Saudi compliance note: ZATCA Phase 2 is not satisfied by merely printing a QR code; integration requirements include structured invoice data and cryptographic/technical controls. Production integration must be designed against current official ZATCA specifications and tested with the taxpayer's onboarding credentials. SFDA RSD/DTTS, Wasfaty, insurance networks and controlled-medicine workflows require official access, contracts, and jurisdiction-specific validation. Do not display a compliance badge or claim integration until a real end-to-end certification test has passed.

## 4. Detailed page-by-page audit and target state

### A. Dashboard
Current: four KPI cards, 7-day sales chart, quick actions, recent sales.
Add:
- Date-range selector: today, yesterday, 7 days, 30 days, current month, custom.
- KPI cards: gross sales, net sales, gross profit, COGS, invoice count, average basket, returns, expenses, cash/card/bank totals.
- Inventory health: low stock, out of stock, near expiry, expired quarantine, dead stock, stock value at cost and retail.
- Cash state: open shift, expected cash, cash variance, pending supplier balances.
- Top-selling and highest-margin products; slow movers; sales by hour/day; payment mix.
- Actionable alert center with severity, owner, due date, acknowledge/snooze and navigation to the relevant record.
- Drill-through from each KPI to a filtered detail list.
- Loading, empty, offline, stale-data, and error states; last refresh timestamp.
- No fake percentages or trend indicators without a valid comparison period.

### B. Point of Sale
Current: search/barcode, cart, discounts, customer, payment and receipt.
Add:
- Dedicated keyboard-first cashier layout; configurable hotkeys and focus restoration after each action.
- Search by Arabic/English/trade name/generic name/brand/strength/form/barcode/SKU.
- Duplicate scan increments quantity; unknown barcode offers safe product registration only to authorized staff.
- Cart hold, recall, suspend, quote, park and retrieve; persisted drafts to survive accidental app closure.
- Quantity by pack/strip/unit with validated conversion factors and clear unit pricing.
- Lot selection/FEFO with batch number and expiry visible on line; prohibit expired/quarantined batches.
- Price override and discount approvals with reason and audit log.
- Tax-inclusive/exclusive display, line-level tax category, invoice-level discounts apportioned correctly.
- Split tender with change, partial payment/credit only when permitted, payment references, terminal references.
- Customer lookup, loyalty redemption, saved cart, receipt/email/print actions.
- Sale cancellation and return must be separate audited workflows, never deletion.
- Cash drawer opening/closing and shift ownership.
- Strong idempotency protection against double-click/double-submit and duplicate invoices.
- Accessibility: visible focus, keyboard navigation, readable contrast, screen-reader labels.

### C. Products / Drug Catalog
Current: SKU, barcode, Arabic/English names, base unit, reorder level, sale price.
Add:
- Generic/scientific name, brand/manufacturer, active ingredient, strength, dosage form, route, pack size.
- GTIN/GS1 barcode(s), internal barcode, alternate barcodes, product image, category, therapeutic class.
- Purchase cost, retail price, wholesale price if required, minimum advertised price where lawful, tax category.
- Pack/box/strip/tablet conversion with integer-safe stock units and price per sale unit.
- Prescription/controlled classification, cold-chain flag, storage instructions, high-alert flag.
- Minimum/maximum stock, preferred supplier, lead time, reorder multiple, discontinued/substitute links.
- Product variants and duplicate detection.
- CSV/Excel import with preview, column mapping, validation, duplicate policy and rollback.
- Bulk price/stock threshold update with confirmation and audit.
- Product history: price changes, purchases, sales, returns, batches, adjustments.
- Inactive/archive instead of destructive delete.

### D. Inventory and batches
Current: batch receiving, FEFO dispensing, balances, nearest expiry alerts, reorder threshold.
Add:
- Expiry buckets: expired, 0–30, 31–60, 61–90, 91–180 days; user-configurable.
- Quarantine and release controls; expired stock never sellable.
- Full batch traceability: supplier invoice → receipt → batch → sale invoice/customer (subject to privacy) → return/recall.
- FEFO override with permission and reason.
- Stock count sessions: blind count, recount, variance approval, signed adjustment.
- Stock adjustment reasons: damage, expiry, theft, recall, sample, correction, opening balance.
- Stock transfer between stores/branches with dispatch, in-transit, receipt and variance.
- Stock valuation by moving average/FIFO policy explicitly selected and tested.
- Reorder suggestions based on recent demand, lead time, safety stock and minimum order quantity.
- Barcode scanning for receiving, cycle counts and batch identification.
- Inventory movement timeline with immutable ledger and reversal entries.

### E. Purchases and suppliers
Current: supplier is plain text, one product per purchase, purchase immediately receives stock.
Add:
- Supplier master: contact details, tax number, payment terms, currency policy (system currency remains global), account balance, notes, status.
- Purchase requisition → approval → purchase order → partial receiving → supplier invoice → payment.
- Multi-line purchase with unit cost, discounts, tax, bonus/free quantity and batch/expiry per received line.
- Purchase returns and supplier credit notes.
- Supplier price history, preferred items, lead times, fill rate and expiry-return policy.
- Supplier statement, aging buckets, outstanding invoices, payment allocation.
- Duplicate supplier invoice/reference detection.
- Import supplier invoice via CSV first; OCR can be an optional later helper, not a dependency.
- Prevent received quantity from exceeding ordered quantity without override.

### F. Sales history, returns and refunds
Current: list of sales and receipt details.
Add:
- Filters by date, invoice, customer, cashier, payment type, status, product, batch.
- Full invoice detail: line quantities, unit, batch, discounts, tax, payments, printer status, operator.
- Return against original invoice with item/batch/quantity checks, return reason, condition, restock/quarantine decision.
- Refund method and refund reference; reverse payment and accounting entries, never mutate original invoice totals.
- Return without original invoice only under a controlled permission and explicit reason.
- Reprint/duplicate receipt watermark and audit event.
- Cancel/void only under a documented lifecycle with approval and regulatory constraints.

### G. Customers
Current: name, phone and list.
Add:
- Full profile, contact, tax details where applicable, balance/credit limit, loyalty points, purchase history.
- Duplicate detection by normalized phone/name.
- Customer statement, payment/credit notes, purchase frequency and last visit.
- Opt-in/consent and notification preferences; do not store sensitive medical information without an explicit clinical/legal requirement.
- Export and anonymization/retention tools where applicable.

### H. Reports and analytics
Current: three summary cards only.
Add:
- Sales: daily/monthly, net/gross, by product/category/cashier/payment/hour.
- Profit: gross margin, COGS, discount cost, returns, taxes separated from revenue.
- Inventory: stock on hand, valuation, turnover, days cover, aging, expiry exposure, dead stock, negative/zero anomalies.
- Purchasing: supplier spend, price variance, delivery lead time, bonus units and returns.
- Cash: shift closing, tender reconciliation, drawer variance, refunds.
- Customer: top/at-risk/loyalty (non-clinical).
- Audit and operations: voids, discounts, price changes, failed print jobs, overrides.
- Filters, saved views, drill-down, print, PDF, CSV/XLSX export.
- Every report states date basis, currency, tax inclusion and calculation definition.

### I. Settings and administration
Current: pharmacy identity, tax rate, global currency, logo, updater and printer profiles.
Add:
- Store identity, receipt templates, invoice numbering, timezone/date/number formats.
- Global currency remains selected in Settings only; display currency label everywhere; no FX controls or conversion.
- Tax profiles per item/category and invoice types; do not assume one tax rate for all items.
- Cashiers, roles and granular permissions.
- Approval limits for discounts, returns, stock adjustments, supplier payments and price overrides.
- Backup schedule, retention, encrypted export, restore validation and backup history.
- Device, printer, barcode scanner and scale configuration.
- Import/export and migration tools.
- Data retention, privacy and session lock.
- Feature toggles only for genuinely optional modules, with safe defaults.
- About/version/update diagnostics and signed update verification.

### J. Additional modules required for a complete product
1. Suppliers and supplier ledger.
2. Cash register, shifts and drawer reconciliation.
3. Expenses and other income.
4. Sales returns, refunds and supplier returns.
5. User management, roles, permissions and audit log.
6. Barcode/price/expiry label printing.
7. Delivery orders and driver dispatch (optional).
8. Multi-warehouse and multi-branch (later architecture phase).
9. Prescription queue and dispensing records (only with appropriate pharmacy/regulatory scope).
10. Insurance claims and Wasfaty/RSD integrations (official access required).
11. Accounting: chart of accounts, journals, receivables, payables, cash/bank, trial balance and financial statements (only after source transactions are complete and reconciled).

## 5. Cross-cutting quality requirements

- One global selected currency in Settings only. No currency picker in POS; no exchange-rate entry or conversion; historical records remain unchanged.
- Arabic/English parity: every label, validation, tooltip, dialog, report, empty state and notification translated.
- RTL/LTR correctness: icons, chevrons, drawers, tables, keyboard focus and number/date rendering.
- Luxury design system: consistent typography, spacing, semantic colors, surfaces, elevation, density, table controls, forms, dialogs, toasts and responsive breakpoints.
- Search/filter/sort/pagination on every large table.
- Explicit loading, empty, error, success, offline and stale states.
- Confirm destructive/financial actions; avoid native browser alerts.
- No silent failures; actionable errors and retry.
- Audit log for financially or operationally sensitive changes.
- Use integer minor units for money; never floating-point financial storage.
- Use explicit timezone and date boundaries; expiry is a date, not a UTC timestamp.
- SQLite foreign keys, constraints, indexes, transactions, migration backup and rollback strategy.
- No direct historical-row rewriting for new features; use reversal/correction entries.
- Performance: large catalog virtualization/pagination, indexed search, debounced filters.
- Security: least privilege, secure local storage, validated IPC inputs, no secrets in logs, local backup encryption and restore testing.
- Accessibility: keyboard, focus, contrast, labels, non-color status indicators.
- Hardware validation: actual scanner, cash drawer, scale, 58/80mm thermal printer and A4 printer.

## 6. Delivery roadmap

### Phase 0 — Audit and architecture safety
- This document and page/command/schema inventory.
- Align package, Tauri and Cargo version metadata.
- Establish test fixtures and migration upgrade tests from a copy of a populated legacy SQLite database.
- Extract App.tsx incrementally into page components and typed data services without changing behavior.

### Phase 1 — Complete existing pages
- Dashboard with meaningful filters, drill-through and accurate operational indicators.
- Products with category, richer identifiers, bulk import/export, search and filters.
- Inventory with expiry buckets, quarantine, cycle count and stock movement history.
- Purchases with multi-line purchase order and partial receiving.
- Customers with profile, search, statement and history.
- Reports rebuilt as real filtered/exportable reports.
- Settings grouped into clear sections with validation and backup/restore workflow.
- POS reliability, suspended carts, shift awareness and audited overrides.

### Phase 2 — Financial and control foundations
- Suppliers, expenses, cash shifts, returns/refunds, approval permissions, audit log.
- Double-entry accounting only after each operational event has a reconciled posting model.
- Financial close and period lock.

### Phase 3 — Pharmacy-native capabilities
- Advanced medicine catalog, pack conversion, prescriptions/dispensing, controlled-product controls, labels and recall traceability.
- Clinical alerts only with vetted data and explicit pharmacist override/audit.

### Phase 4 — Integrations and scale
- ZATCA Phase 2 integration after official specification review and onboarding.
- SFDA RSD/DTTS, Wasfaty, insurance and distributor APIs only after access approval.
- Multi-branch synchronization, central procurement and consolidated analytics.
- Mobile companion and remote monitoring only after conflict-safe sync is designed.

## 7. Acceptance gates for every change

1. Existing database is opened from a copy and migrated without losing records.
2. Migration is additive and has a backup/restore test; no destructive migration without explicit approval.
3. Rust unit tests cover validation, transaction rollback, inventory and money invariants.
4. Frontend tests cover Arabic and English, RTL and LTR, empty/loading/error states and primary user flow.
5. `npm test`, `npm run build`, `cargo fmt --check`, and `cargo test` pass.
6. A Windows installer build and update manifest are verified for release changes.
7. A manual acceptance checklist covers scanner, printer, cash drawer (if added), receipt, return and backup restore.
8. No feature is marked complete merely because its screen renders; the persisted workflow and audit trail must work.

## 8. Known risks and non-goals

- The current currency list and legacy exchange-rate schema may remain for backward compatibility. The UI and new workflow must not expose or use FX conversion. Do not drop legacy columns/tables without a migration study.
- Current sales store payment details and currency snapshots; do not relabel or rewrite old invoices when the default currency changes.
- Existing stock ledger immutability and FEFO behavior must be preserved.
- Do not claim ZATCA, SFDA, Wasfaty, insurance or controlled-medicine compliance without official integration and acceptance evidence.
- Do not add AI or cloud dependencies to core checkout or inventory. Offline core workflows must continue to work.
- Multi-branch operation is not achieved by adding a branch dropdown; it requires transaction-safe synchronization and conflict handling.
