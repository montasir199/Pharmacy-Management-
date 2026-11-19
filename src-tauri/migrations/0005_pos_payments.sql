INSERT OR IGNORE INTO currencies (code, name, symbol, minor_unit_exponent) VALUES
    ('AED', 'United Arab Emirates dirham', 'د.إ', 2),
    ('BHD', 'Bahraini dinar', 'د.ب', 3),
    ('DZD', 'Algerian dinar', 'د.ج', 2),
    ('DJF', 'Djiboutian franc', 'Fdj', 0),
    ('EGP', 'Egyptian pound', 'ج.م', 2),
    ('ILS', 'Israeli new shekel', '₪', 2),
    ('IQD', 'Iraqi dinar', 'د.ع', 3),
    ('JOD', 'Jordanian dinar', 'د.أ', 3),
    ('KMF', 'Comorian franc', 'CF', 0),
    ('KWD', 'Kuwaiti dinar', 'د.ك', 3),
    ('LBP', 'Lebanese pound', 'ل.ل', 2),
    ('LYD', 'Libyan dinar', 'د.ل', 3),
    ('MAD', 'Moroccan dirham', 'د.م.', 2),
    ('MRU', 'Mauritanian ouguiya', 'أ.م', 2),
    ('OMR', 'Omani rial', 'ر.ع.', 3),
    ('QAR', 'Qatari riyal', 'ر.ق', 2),
    ('SAR', 'Saudi riyal', 'ر.س', 2),
    ('SDG', 'Sudanese pound', 'ج.س', 2),
    ('SOS', 'Somali shilling', 'Sh.So.', 2),
    ('SYP', 'Syrian pound', 'ل.س', 2),
    ('TND', 'Tunisian dinar', 'د.ت', 3),
    ('YER', 'Yemeni rial', 'ر.ي', 2);

ALTER TABLE sales
ADD COLUMN currency_code TEXT NOT NULL DEFAULT 'SAR' REFERENCES currencies(code);

ALTER TABLE sales
ADD COLUMN exchange_rate_scaled INTEGER NOT NULL DEFAULT 1000000000
    CHECK (typeof(exchange_rate_scaled) = 'integer' AND exchange_rate_scaled > 0);

ALTER TABLE sales
ADD COLUMN tax_rate_basis_points INTEGER NOT NULL DEFAULT 0
    CHECK (typeof(tax_rate_basis_points) = 'integer' AND tax_rate_basis_points BETWEEN 0 AND 10000);

ALTER TABLE sale_items
ADD COLUMN discount_minor INTEGER NOT NULL DEFAULT 0
    CHECK (typeof(discount_minor) = 'integer' AND discount_minor >= 0);

CREATE TABLE sale_payments (
    id INTEGER PRIMARY KEY,
    sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    method TEXT NOT NULL CHECK (method IN ('cash', 'card', 'bank_transfer')),
    amount_minor INTEGER NOT NULL CHECK (typeof(amount_minor) = 'integer' AND amount_minor > 0),
    currency_code TEXT NOT NULL REFERENCES currencies(code),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX sale_payments_sale ON sale_payments (sale_id, id);
