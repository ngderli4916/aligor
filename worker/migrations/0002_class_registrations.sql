-- Aligor class registrations. Idempotent; the Worker also runs these statements itself on first use.
CREATE TABLE IF NOT EXISTS class_registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_order_id TEXT NOT NULL UNIQUE,
  idempotency_key TEXT NOT NULL UNIQUE,
  payment_token_hash TEXT NOT NULL UNIQUE,
  primary_name TEXT NOT NULL,
  primary_phone_normalized TEXT NOT NULL,
  region TEXT NOT NULL CHECK (region IN ('JOHOR','SELANGOR','PENANG')),
  package_code TEXT NOT NULL CHECK (package_code IN ('solo_1pc','pair_1pc','pair_2pc')),
  participant_count INTEGER NOT NULL CHECK (participant_count IN (1,2)),
  computer_count INTEGER NOT NULL CHECK (computer_count IN (1,2)),
  second_name TEXT,
  second_phone_normalized TEXT,
  original_amount INTEGER NOT NULL,
  discount_amount INTEGER NOT NULL,
  final_amount INTEGER NOT NULL,
  payment_reference TEXT,
  payment_status TEXT NOT NULL DEFAULT 'awaiting_payment' CHECK (payment_status IN ('awaiting_payment','payment_submitted','payment_confirmed','payment_rejected','cancelled')),
  registration_status TEXT NOT NULL DEFAULT 'registered' CHECK (registration_status IN ('registered','cancelled')),
  telegram_notification_status TEXT NOT NULL DEFAULT 'pending' CHECK (telegram_notification_status IN ('pending','sending','sent','failed','skipped')),
  telegram_attempted_at TEXT,
  admin_notes TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  utm_source TEXT NOT NULL DEFAULT '',
  utm_medium TEXT NOT NULL DEFAULT '',
  utm_campaign TEXT NOT NULL DEFAULT '',
  payment_submitted_at TEXT,
  payment_confirmed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_class_reg_status ON class_registrations(payment_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_class_reg_phone ON class_registrations(primary_phone_normalized);

CREATE TABLE IF NOT EXISTS class_registration_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  registration_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY (registration_id) REFERENCES class_registrations(id)
);

CREATE INDEX IF NOT EXISTS idx_class_events_reg ON class_registration_events(registration_id, id);

CREATE TRIGGER IF NOT EXISTS class_events_no_update BEFORE UPDATE ON class_registration_events BEGIN SELECT RAISE(ABORT,'class_registration_events is append-only'); END;

CREATE TRIGGER IF NOT EXISTS class_events_no_delete BEFORE DELETE ON class_registration_events BEGIN SELECT RAISE(ABORT,'class_registration_events is append-only'); END;
