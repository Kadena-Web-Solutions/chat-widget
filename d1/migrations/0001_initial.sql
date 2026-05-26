-- d1/migrations/0001_initial.sql
-- Chat Widget Database — Initial Migration
-- Tables: clients, conversations, messages, leads, audit_events

CREATE TABLE IF NOT EXISTS clients (
  client_key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  client_key TEXT NOT NULL REFERENCES clients(client_key),
  session_token TEXT,
  status TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'escalated' | 'completed' | 'expired'
  source TEXT NOT NULL DEFAULT 'web',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  lead_id TEXT,
  metadata TEXT
);

CREATE INDEX IF NOT EXISTS idx_conversations_client ON conversations(client_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations(session_token);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  model TEXT,
  token_count INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  client_key TEXT NOT NULL REFERENCES clients(client_key),
  name TEXT,
  email TEXT NOT NULL,
  phone TEXT,
  message TEXT,
  lead_score INTEGER DEFAULT 0,
  lead_source TEXT NOT NULL DEFAULT 'chat',
  status TEXT NOT NULL DEFAULT 'new',
  enriched_data TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_leads_client ON leads(client_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email, client_key);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  client_key TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_audit_client ON audit_events(client_key, event_type, created_at DESC);
