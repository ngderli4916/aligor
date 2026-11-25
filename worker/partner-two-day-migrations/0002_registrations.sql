-- Paid sign-ups with bank-transfer proof. Separate from 0001 reservations (left untouched).
-- Proof files live in the private R2 bucket bound as PARTNER_TWO_DAY_PROOFS; only the key is stored here.
CREATE TABLE IF NOT EXISTS registrations (
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
  proof_key TEXT NOT NULL UNIQUE,
  proof_type TEXT NOT NULL,
  proof_size INTEGER NOT NULL CHECK (proof_size > 0),
  status TEXT NOT NULL DEFAULT 'pending_verification'
    CHECK (status IN ('pending_verification','verified','rejected','cancelled')),
  created_at TEXT NOT NULL,
  verified_at TEXT,
  CHECK ((company_invoice = 0 AND company_name IS NULL AND company_address IS NULL)
      OR (company_invoice = 1 AND length(trim(coalesce(company_name, ''))) > 0))
);
