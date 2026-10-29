export const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vocab (
  voc_id TEXT PRIMARY KEY,
  spelling TEXT NOT NULL,
  lemma TEXT NOT NULL,
  last_response TEXT,
  study_count INTEGER NOT NULL DEFAULT 0,
  tags TEXT NOT NULL DEFAULT '[]',
  add_date TEXT,
  first_study_date TEXT,
  last_study_date TEXT,
  next_study_date TEXT,
  synced_at TEXT,
  source TEXT NOT NULL DEFAULT 'maimemo'
);
CREATE INDEX IF NOT EXISTS vocab_lemma_idx ON vocab(lemma);
CREATE INDEX IF NOT EXISTS vocab_source_idx ON vocab(source);

CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'generated',
  level TEXT NOT NULL,
  topic TEXT NOT NULL DEFAULT '',
  genre TEXT NOT NULL DEFAULT 'expository',
  request_json TEXT,
  content_json TEXT NOT NULL,
  metrics_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS articles_created_idx ON articles(created_at);

CREATE TABLE IF NOT EXISTS article_tokens (
  article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  surface TEXT NOT NULL,
  normalized TEXT NOT NULL,
  lemma TEXT NOT NULL,
  status TEXT NOT NULL,
  paragraph INTEGER NOT NULL,
  sentence_index INTEGER NOT NULL,
  start_offset INTEGER NOT NULL,
  end_offset INTEGER NOT NULL,
  known_response TEXT,
  repeat INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (article_id, idx)
);
CREATE INDEX IF NOT EXISTS article_tokens_lemma_idx ON article_tokens(lemma);

CREATE TABLE IF NOT EXISTS word_lookup (
  lemma TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tts_cache (
  hash TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  voice TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS additions (
  lemma TEXT PRIMARY KEY,
  voc_id TEXT,
  spelling TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  simulated INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ecdict (
  word TEXT PRIMARY KEY,
  phonetic TEXT,
  translation TEXT,
  definition TEXT,
  pos TEXT,
  tag TEXT,
  frq INTEGER,
  bnc INTEGER,
  oxford INTEGER,
  collins INTEGER,
  exchange TEXT,
  detail TEXT
);

CREATE TABLE IF NOT EXISTS lemma_map (
  surface TEXT PRIMARY KEY,
  lemma TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS article_audio (
  article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  voice TEXT NOT NULL,
  hash TEXT,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  error TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (article_id, idx, voice)
);

PRAGMA user_version = 1;
`
