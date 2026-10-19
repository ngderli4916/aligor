PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_no TEXT NOT NULL UNIQUE,
    public_id TEXT NOT NULL UNIQUE,
    document_type TEXT NOT NULL DEFAULT 'invoice' CHECK(document_type IN ('invoice','receipt')),
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','issued','paid','cancelled')),
    customer_name TEXT NOT NULL,
    customer_company TEXT NOT NULL DEFAULT '',
    customer_phone TEXT NOT NULL DEFAULT '',
    customer_email TEXT NOT NULL DEFAULT '',
    customer_address TEXT NOT NULL DEFAULT '',
    issue_date TEXT NOT NULL,
    due_date TEXT NOT NULL DEFAULT '',
    currency TEXT NOT NULL DEFAULT 'MYR',
    subtotal_cents INTEGER NOT NULL DEFAULT 0,
    discount_cents INTEGER NOT NULL DEFAULT 0,
    tax_rate REAL NOT NULL DEFAULT 0,
    tax_cents INTEGER NOT NULL DEFAULT 0,
    total_cents INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    terms TEXT NOT NULL DEFAULT '',
    source_order_id TEXT NOT NULL DEFAULT '',
    issuer_name TEXT NOT NULL,
    issuer_brand TEXT NOT NULL DEFAULT 'Aligor',
    issuer_reg_no TEXT NOT NULL DEFAULT '',
    issuer_tin TEXT NOT NULL DEFAULT '',
    issuer_address TEXT NOT NULL DEFAULT '',
    issuer_phone TEXT NOT NULL DEFAULT '',
    issued_at TEXT,
    paid_at TEXT,
    cancelled_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

CREATE TABLE IF NOT EXISTS invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL,
    position INTEGER NOT NULL,
    description TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit_price_cents INTEGER NOT NULL,
    amount_cents INTEGER NOT NULL,
    FOREIGN KEY(invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
  );

CREATE TABLE IF NOT EXISTS invoice_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    actor TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY(invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
  );

CREATE INDEX IF NOT EXISTS idx_invoices_status_created ON invoices(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_name, customer_phone);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id, position);

CREATE INDEX IF NOT EXISTS idx_invoice_events_invoice ON invoice_events(invoice_id, created_at DESC);
