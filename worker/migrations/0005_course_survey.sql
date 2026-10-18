CREATE TABLE IF NOT EXISTS course_survey_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id TEXT NOT NULL UNIQUE,
  idempotency_key TEXT NOT NULL UNIQUE,
  student_name TEXT NOT NULL DEFAULT '',
  course_date TEXT NOT NULL,
  cohort TEXT NOT NULL,
  practical_learning INTEGER NOT NULL CHECK (practical_learning BETWEEN 1 AND 5),
  overall_satisfaction INTEGER NOT NULL CHECK (overall_satisfaction BETWEEN 1 AND 5),
  ai_agent_confidence INTEGER NOT NULL CHECK (ai_agent_confidence BETWEEN 1 AND 5),
  course_length TEXT NOT NULL CHECK (course_length IN ('too_short','slightly_short','just_right','slightly_long','too_long')),
  teaching_speed TEXT NOT NULL CHECK (teaching_speed IN ('too_slow','slightly_slow','just_right','slightly_fast','too_fast')),
  unnecessary_content INTEGER NOT NULL CHECK (unnecessary_content BETWEEN 1 AND 5),
  example_amount TEXT NOT NULL CHECK (example_amount IN ('too_few','slightly_few','just_right','slightly_many','too_many')),
  hands_on_time INTEGER NOT NULL CHECK (hands_on_time BETWEEN 1 AND 5),
  explanation_clarity INTEGER NOT NULL CHECK (explanation_clarity BETWEEN 1 AND 5),
  helpful_parts TEXT NOT NULL,
  difficult_parts TEXT NOT NULL,
  reduce_topics TEXT NOT NULL DEFAULT '',
  work_applicability INTEGER NOT NULL CHECK (work_applicability BETWEEN 1 AND 5),
  first_use TEXT NOT NULL DEFAULT '',
  recommend_score INTEGER NOT NULL CHECK (recommend_score BETWEEN 1 AND 5),
  improvement TEXT NOT NULL DEFAULT '',
  testimonial TEXT NOT NULL DEFAULT '',
  publicity_consent TEXT NOT NULL CHECK (publicity_consent IN ('name_and_quote','anonymous_only','no_publicity')),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_course_survey_date ON course_survey_responses(course_date, created_at DESC);