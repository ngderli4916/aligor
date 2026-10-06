PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone_e164 TEXT NOT NULL,
  batch TEXT NOT NULL,
  course TEXT NOT NULL DEFAULT 'AI Personal Assistant Preview',
  company TEXT NOT NULL DEFAULT '',
  industry TEXT NOT NULL DEFAULT '',
  used_ai_agent TEXT NOT NULL DEFAULT '',
  ai_tools TEXT NOT NULL DEFAULT '',
  ai_tools_other TEXT NOT NULL DEFAULT '',
  goal TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'aligor',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','registered','paid','attended','cancelled')),
  consent_whatsapp INTEGER NOT NULL DEFAULT 0 CHECK (consent_whatsapp IN (0,1)),
  consent_at TEXT,
  notes TEXT NOT NULL DEFAULT '',
  last_contacted_at TEXT,
  paid_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(phone_e164, batch)
);

CREATE INDEX IF NOT EXISTS idx_leads_status_created ON leads(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_batch_created ON leads(batch, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone_e164);

CREATE TABLE IF NOT EXISTS lead_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_lead_events_lead ON lead_events(lead_id, created_at DESC);
