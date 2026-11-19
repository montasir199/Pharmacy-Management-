CREATE TABLE customers (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    phone TEXT,
    email TEXT,
    address TEXT,
    is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE sales (
    id INTEGER PRIMARY KEY,
    invoice_number TEXT NOT NULL UNIQUE COLLATE NOCASE,
    customer_id INTEGER REFERENCES customers(id),
    subtotal_minor INTEGER NOT NULL CHECK (subtotal_minor >= 0),
    discount_minor INTEGER NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
    tax_minor INTEGER NOT NULL DEFAULT 0 CHECK (tax_minor >= 0),
    total_minor INTEGER NOT NULL CHECK (total_minor >= 0),
    status TEXT NOT NULL CHECK (status IN ('paid', 'pending', 'cancelled')),
    sold_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE sale_items (
    id INTEGER PRIMARY KEY,
    sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price_minor INTEGER NOT NULL CHECK (unit_price_minor >= 0),
    line_total_minor INTEGER NOT NULL CHECK (line_total_minor >= 0)
);

CREATE TABLE purchases (
    id INTEGER PRIMARY KEY,
    reference_number TEXT NOT NULL UNIQUE COLLATE NOCASE,
    supplier_name TEXT NOT NULL CHECK (length(trim(supplier_name)) > 0),
    total_minor INTEGER NOT NULL CHECK (total_minor >= 0),
    status TEXT NOT NULL CHECK (status IN ('ordered', 'received', 'cancelled')),
    purchased_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE purchase_items (
    id INTEGER PRIMARY KEY,
    purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_cost_minor INTEGER NOT NULL CHECK (unit_cost_minor >= 0)
);
