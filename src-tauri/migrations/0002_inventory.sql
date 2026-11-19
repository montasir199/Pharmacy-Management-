CREATE TABLE products (
    id INTEGER PRIMARY KEY,
    sku TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(trim(sku)) > 0),
    barcode TEXT UNIQUE,
    name_ar TEXT NOT NULL CHECK (length(trim(name_ar)) > 0),
    name_en TEXT NOT NULL CHECK (length(trim(name_en)) > 0),
    base_unit TEXT NOT NULL CHECK (length(trim(base_unit)) > 0),
    reorder_level_units INTEGER NOT NULL DEFAULT 0
        CHECK (typeof(reorder_level_units) = 'integer' AND reorder_level_units >= 0),
    is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE batches (
    id INTEGER PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id),
    batch_number TEXT NOT NULL CHECK (length(trim(batch_number)) > 0),
    expiry_date TEXT NOT NULL
        CHECK (date(expiry_date) IS NOT NULL AND date(expiry_date) = expiry_date),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (product_id, batch_number)
);

CREATE INDEX batches_fefo
    ON batches (product_id, expiry_date, id);

CREATE TABLE stock_movements (
    id INTEGER PRIMARY KEY,
    batch_id INTEGER NOT NULL REFERENCES batches(id),
    delta_units INTEGER NOT NULL
        CHECK (typeof(delta_units) = 'integer' AND delta_units <> 0),
    movement_type TEXT NOT NULL
        CHECK (movement_type IN ('opening', 'receipt', 'dispense', 'sale_return', 'adjustment', 'reversal')),
    source_id TEXT CHECK (source_id IS NULL OR length(trim(source_id)) > 0),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX stock_movements_batch
    ON stock_movements (batch_id, id);

CREATE TRIGGER stock_movement_validate_direction
BEFORE INSERT ON stock_movements
WHEN
    (NEW.movement_type IN ('opening', 'receipt', 'sale_return') AND NEW.delta_units <= 0)
    OR (NEW.movement_type = 'dispense' AND NEW.delta_units >= 0)
BEGIN
    SELECT RAISE(ABORT, 'stock movement has an invalid quantity direction');
END;

CREATE TRIGGER stock_movement_prevent_negative_balance
BEFORE INSERT ON stock_movements
WHEN (
    COALESCE(
        (SELECT SUM(delta_units) FROM stock_movements WHERE batch_id = NEW.batch_id),
        0
    ) + NEW.delta_units
) < 0
BEGIN
    SELECT RAISE(ABORT, 'stock movement would make the batch balance negative');
END;

CREATE TRIGGER stock_movements_no_update
BEFORE UPDATE ON stock_movements
BEGIN
    SELECT RAISE(ABORT, 'stock movements are immutable; append a reversal instead');
END;

CREATE TRIGGER stock_movements_no_delete
BEFORE DELETE ON stock_movements
BEGIN
    SELECT RAISE(ABORT, 'stock movements are immutable; append a reversal instead');
END;
