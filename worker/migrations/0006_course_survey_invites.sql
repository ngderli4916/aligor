CREATE TABLE IF NOT EXISTS course_survey_invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  student_name TEXT NOT NULL,
  phone_normalized TEXT NOT NULL,
  course_date TEXT NOT NULL,
  cohort TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  whatsapp_message_id TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_course_survey_invite_phone ON course_survey_invites(phone_normalized, course_date);