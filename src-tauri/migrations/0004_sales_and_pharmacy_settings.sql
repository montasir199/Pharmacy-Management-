ALTER TABLE products
ADD COLUMN sale_price_minor INTEGER NOT NULL DEFAULT 0
    CHECK (typeof(sale_price_minor) = 'integer' AND sale_price_minor >= 0);
