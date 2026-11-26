-- 2026-11-26 (Adrian): allow 1–20 seats per sign-up (price = pairs at the two-seat fee + a single).
-- Rebuilds signups (SQLite cannot change CHECKs in place). second_name becomes other_names (free text,
-- one name per line). Existing rows are copied over; the table had 0 rows when this was written.
CREATE TABLE signups_v4 (
  id INTEGER PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  contact_name TEXT NOT NULL,
  contact_phone TEXT NOT NULL UNIQUE,
  seats INTEGER NOT NULL CHECK (seats BETWEEN 1 AND 20),
  other_names TEXT CHECK (seats > 1 OR other_names IS NULL),
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
INSERT INTO signups_v4 (id,reference,contact_name,contact_phone,seats,other_names,company_invoice,company_name,company_address,amount_rm,status,created_at,paid_at)
  SELECT id,reference,contact_name,contact_phone,seats,second_name,company_invoice,company_name,company_address,amount_rm,status,created_at,paid_at FROM signups;
DROP TABLE signups;
ALTER TABLE signups_v4 RENAME TO signups;
