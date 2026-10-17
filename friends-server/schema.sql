-- D1 (SQLite) schema for the friends server. Safe to run again: the deploy workflow
-- applies it on every deploy.

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,  -- SHA-256 of the recovery code; the code itself is never stored
  adj INTEGER NOT NULL,             -- the name: positions in src/names.js, plus a number (0 = none)
  animal INTEGER NOT NULL,
  num INTEGER NOT NULL,
  level INTEGER NOT NULL DEFAULT 1, -- what friends see
  streak INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (adj, animal, num)
);

-- One row per direction, so "my friends" is a single indexed lookup.
CREATE TABLE IF NOT EXISTS friends (
  profile_id TEXT NOT NULL,
  friend_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (profile_id, friend_id)
);

-- Single-use invite codes. Each profile has at most one open invite at a time.
CREATE TABLE IF NOT EXISTS invites (
  code TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL
);

-- Feedback sent from the app's ⋮ menu. Anonymous: no profile is attached. ip_hash (a
-- SHA-256 of the sender's address) only limits how often one sender can post.
CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  lang TEXT NOT NULL,
  platform TEXT NOT NULL,           -- 'web' or 'android'
  ip_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS feedback_by_sender ON feedback (ip_hash, created_at);

-- Devices of admin profiles that want a notification for new feedback: their Web Push
-- endpoint (the push server in server/ holds the subscription itself) and the
-- notification text in that admin's language.
CREATE TABLE IF NOT EXISTS admin_devices (
  endpoint TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL
);
