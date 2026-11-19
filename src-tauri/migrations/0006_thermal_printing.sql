CREATE TABLE receipt_printers (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
    connection_type TEXT NOT NULL CHECK (connection_type IN ('usb', 'network')),
    vendor_id INTEGER,
    product_id INTEGER,
    host TEXT,
    port INTEGER,
    paper_width TEXT NOT NULL CHECK (paper_width IN ('80mm', '58mm')),
    dpi INTEGER NOT NULL CHECK (dpi IN (203, 300)),
    copies INTEGER NOT NULL CHECK (copies BETWEEN 1 AND 5),
    auto_cut INTEGER NOT NULL CHECK (auto_cut IN (0, 1)),
    auto_print INTEGER NOT NULL CHECK (auto_print IN (0, 1)),
    print_logo INTEGER NOT NULL CHECK (print_logo IN (0, 1)),
    font_size INTEGER NOT NULL CHECK (font_size BETWEEN 8 AND 32),
    is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
    CHECK (
        (connection_type = 'usb' AND vendor_id IS NOT NULL AND product_id IS NOT NULL
            AND vendor_id BETWEEN 0 AND 65535 AND product_id BETWEEN 0 AND 65535)
        OR
        (connection_type = 'network' AND host IS NOT NULL AND port IS NOT NULL
            AND port BETWEEN 1 AND 65535)
    )
);

CREATE UNIQUE INDEX receipt_printers_single_default ON receipt_printers (is_default)
WHERE is_default = 1;

CREATE TABLE print_jobs (
    id INTEGER PRIMARY KEY,
    sale_id INTEGER REFERENCES sales(id) ON DELETE SET NULL,
    printer_id INTEGER REFERENCES receipt_printers(id) ON DELETE SET NULL,
    job_type TEXT NOT NULL CHECK (job_type IN ('sale', 'test')),
    status TEXT NOT NULL CHECK (status IN ('queued', 'printing', 'printed', 'failed')),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    last_error TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX print_jobs_recent ON print_jobs (created_at DESC, id DESC);
