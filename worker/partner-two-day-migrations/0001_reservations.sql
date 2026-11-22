CREATE TABLE IF NOT EXISTS reservations (
  id INTEGER PRIMARY KEY,
  contact_name TEXT NOT NULL,
  contact_phone TEXT NOT NULL UNIQUE,
  seats INTEGER NOT NULL CHECK (seats IN (1,2)),
  second_name TEXT CHECK (seats = 2 OR second_name IS NULL),
  company_invoice INTEGER NOT NULL CHECK (company_invoice IN (0,1)),
  company_name TEXT,
  company_address TEXT,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','confirmed','cancelled')),
  created_at TEXT NOT NULL,
  CHECK ((company_invoice = 0 AND company_name IS NULL AND company_address IS NULL)
      OR (company_invoice = 1 AND length(trim(coalesce(company_name, ''))) > 0))
);
