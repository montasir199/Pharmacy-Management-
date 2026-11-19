CREATE TABLE app_settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) WITHOUT ROWID;

CREATE TABLE currencies (
    code TEXT PRIMARY KEY NOT NULL
        CHECK (length(code) = 3 AND code GLOB '[A-Z][A-Z][A-Z]'),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    symbol TEXT NOT NULL CHECK (length(trim(symbol)) > 0),
    minor_unit_exponent INTEGER NOT NULL
        CHECK (typeof(minor_unit_exponent) = 'integer' AND minor_unit_exponent BETWEEN 0 AND 6),
    is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) WITHOUT ROWID;

CREATE TABLE exchange_rates (
    id INTEGER PRIMARY KEY,
    base_currency_code TEXT NOT NULL REFERENCES currencies(code),
    quote_currency_code TEXT NOT NULL REFERENCES currencies(code),
    rate_scaled INTEGER NOT NULL
        CHECK (typeof(rate_scaled) = 'integer' AND rate_scaled > 0),
    effective_at TEXT NOT NULL,
    source TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    CHECK (base_currency_code <> quote_currency_code),
    UNIQUE (base_currency_code, quote_currency_code, effective_at)
);

CREATE INDEX exchange_rates_lookup
    ON exchange_rates (base_currency_code, quote_currency_code, effective_at DESC);
