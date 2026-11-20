ALTER TABLE products
ADD COLUMN category TEXT NOT NULL DEFAULT ''
    CHECK (length(trim(category)) <= 100);

CREATE INDEX products_category ON products (category COLLATE NOCASE);

CREATE TABLE product_sale_units (
    id INTEGER PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    base_units_per_unit INTEGER NOT NULL
        CHECK (typeof(base_units_per_unit) = 'integer' AND base_units_per_unit > 0),
    sale_price_minor INTEGER NOT NULL
        CHECK (typeof(sale_price_minor) = 'integer' AND sale_price_minor >= 0),
    is_base_unit INTEGER NOT NULL DEFAULT 0 CHECK (is_base_unit IN (0, 1)),
    is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
    UNIQUE (product_id, name COLLATE NOCASE)
);

CREATE UNIQUE INDEX product_sale_units_single_base
    ON product_sale_units (product_id)
    WHERE is_base_unit = 1;

INSERT INTO product_sale_units
    (product_id, name, base_units_per_unit, sale_price_minor, is_base_unit)
SELECT id, base_unit, 1, sale_price_minor, 1
FROM products;

ALTER TABLE sale_items
ADD COLUMN sale_unit_id INTEGER REFERENCES product_sale_units(id);

ALTER TABLE sale_items
ADD COLUMN sold_quantity INTEGER NOT NULL DEFAULT 1
    CHECK (typeof(sold_quantity) = 'integer' AND sold_quantity > 0);

UPDATE sale_items SET sold_quantity = quantity;

CREATE TABLE sale_item_batches (
    sale_item_id INTEGER NOT NULL REFERENCES sale_items(id) ON DELETE CASCADE,
    batch_id INTEGER NOT NULL REFERENCES batches(id),
    units INTEGER NOT NULL CHECK (typeof(units) = 'integer' AND units > 0),
    PRIMARY KEY (sale_item_id, batch_id)
);

CREATE TABLE pos_drafts (
    id INTEGER PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    note TEXT NOT NULL DEFAULT '',
    currency_code TEXT NOT NULL DEFAULT 'SAR' REFERENCES currencies(code),
    exchange_rate_scaled INTEGER NOT NULL DEFAULT 1000000000
        CHECK (typeof(exchange_rate_scaled) = 'integer' AND exchange_rate_scaled > 0),
    payment_method TEXT NOT NULL DEFAULT 'cash'
        CHECK (payment_method IN ('cash', 'card', 'bank_transfer', 'mixed')),
    cash_paid_minor INTEGER NOT NULL DEFAULT 0
        CHECK (typeof(cash_paid_minor) = 'integer' AND cash_paid_minor >= 0),
    card_paid_minor INTEGER NOT NULL DEFAULT 0
        CHECK (typeof(card_paid_minor) = 'integer' AND card_paid_minor >= 0),
    bank_transfer_paid_minor INTEGER NOT NULL DEFAULT 0
        CHECK (typeof(bank_transfer_paid_minor) = 'integer' AND bank_transfer_paid_minor >= 0)
);

CREATE TABLE pos_draft_items (
    id INTEGER PRIMARY KEY,
    draft_id INTEGER NOT NULL REFERENCES pos_drafts(id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK (typeof(position) = 'integer' AND position >= 0),
    product_id INTEGER NOT NULL REFERENCES products(id),
    sale_unit_id INTEGER REFERENCES product_sale_units(id),
    sold_quantity INTEGER NOT NULL CHECK (typeof(sold_quantity) = 'integer' AND sold_quantity > 0),
    base_units_per_unit INTEGER NOT NULL
        CHECK (typeof(base_units_per_unit) = 'integer' AND base_units_per_unit > 0),
    unit_price_minor INTEGER NOT NULL
        CHECK (typeof(unit_price_minor) = 'integer' AND unit_price_minor >= 0),
    discount_type TEXT NOT NULL DEFAULT 'percent'
        CHECK (discount_type IN ('percent', 'amount')),
    discount_value INTEGER NOT NULL DEFAULT 0
        CHECK (typeof(discount_value) = 'integer' AND discount_value >= 0),
    UNIQUE (draft_id, position)
);

CREATE INDEX pos_drafts_recent ON pos_drafts (updated_at DESC, id DESC);
