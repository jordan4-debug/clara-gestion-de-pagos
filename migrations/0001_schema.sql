CREATE TABLE accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('owner','assistant')),
  password_hash TEXT NOT NULL,
  demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE demo_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  csrf TEXT NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX session_expiry ON demo_sessions(expires);
CREATE TABLE login_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires INTEGER NOT NULL
);
CREATE TABLE shared_state (
  id INTEGER PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 0,
  payload TEXT NOT NULL
);
CREATE TABLE receipt_files (
  key TEXT PRIMARY KEY,
  content_type TEXT NOT NULL,
  parts INTEGER NOT NULL,
  size INTEGER NOT NULL
);
CREATE TABLE receipt_chunks (
  file_key TEXT NOT NULL REFERENCES receipt_files(key) ON DELETE CASCADE,
  part INTEGER NOT NULL,
  content TEXT NOT NULL,
  PRIMARY KEY(file_key, part)
);
