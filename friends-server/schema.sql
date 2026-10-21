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

-- Feedback sent from the app's ⋮ menu. Who sent it is in feedback_senders (no row when it was sent
-- without a profile). ip_hash (a SHA-256 of the sender's
-- address) only limits how often one sender can post.
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

-- Replies to feedback, without knowing who sent it. Sending feedback hands the sender's
-- device a random token (only its hash is kept here), which reads and answers the thread.
-- endpoint and the titles say where and how to notify the sender (Web Push, optional).
CREATE TABLE IF NOT EXISTS feedback_threads (
  feedback_id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  reaction TEXT NOT NULL DEFAULT '',
  endpoint TEXT NOT NULL DEFAULT '',
  reply_title TEXT NOT NULL DEFAULT '',
  reaction_title TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS feedback_messages (
  id TEXT PRIMARY KEY,
  feedback_id TEXT NOT NULL,
  from_admin INTEGER NOT NULL,      -- 1 = an admin's reply, 0 = the sender answering
  text TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS feedback_messages_by_thread ON feedback_messages (feedback_id, created_at);

-- When admins were last pushed about new feedback, so a burst of feedback sends one
-- notification (with a count) instead of one each. A single row, id 1.
CREATE TABLE IF NOT EXISTS admin_push (
  id INTEGER PRIMARY KEY,
  last_at TEXT NOT NULL
);

-- Each profile's habit backup, encrypted by the app with a key derived from the recovery
-- code (see src/backup.js). The server can't read it: it stores neither the code nor the key.
CREATE TABLE IF NOT EXISTS backups (
  profile_id TEXT PRIMARY KEY,
  data TEXT NOT NULL,               -- base64 of the IV and the AES-GCM ciphertext
  updated_at TEXT NOT NULL
);

-- The profile that sent each feedback, so admins see who wrote it. The name is copied in
-- (positions in src/names.js) so it stays readable after the profile is deleted.
CREATE TABLE IF NOT EXISTS feedback_senders (
  feedback_id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  adj INTEGER NOT NULL,
  animal INTEGER NOT NULL,
  num INTEGER NOT NULL
);
