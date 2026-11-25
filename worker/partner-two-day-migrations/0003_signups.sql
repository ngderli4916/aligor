-- 2026-11-26 (Adrian): no proof upload on the site. Sign-up first, then the page shows the bank details and
-- the customer WhatsApps the receipt. Additive only: `registrations` (0002) and `reservations` (0001) are left as they are.
CREATE TABLE IF NOT EXISTS signups (
  id INTEGER PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  contact_name TEXT NOT NULL,
  contact_phone TEXT NOT NULL UNIQUE,
  seats INTEGER NOT NULL CHECK (seats IN (1,2)),
  second_name TEXT CHECK (seats = 2 OR second_name IS NULL),
  company_invoice INTEGER NOT NULL CHECK (company_invoice IN (0,1)),
  company_name TEXT,
  company_address TEXT,
  amount_rm INTEGER NOT NULL CHECK (amount_rm > 0),
  status TEXT NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment','paid','cancelled')),
  created_at TEXT NOT NULL,
  paid_at TEXT,
  CHECK ((company_invoice = 0 AND company_name IS NULL AND company_address IS NULL)
      OR (company_invoice = 1 AND length(trim(coalesce(company_name, ''))) > 0))
);
