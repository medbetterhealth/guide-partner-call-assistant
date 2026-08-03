CREATE TABLE IF NOT EXISTS guide_store (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_guide_store_updated_at ON guide_store(updated_at);
PRAGMA optimize;
