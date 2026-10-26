// Database tables. Safe to run on every start: it only creates what's missing.
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            text PRIMARY KEY,
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Only a hash of each sign-in token is stored, so a leaked table can't be
-- used to sign in as anyone.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

-- Private verification documents. Never shown in the swipe portal.
CREATE TABLE IF NOT EXISTS bill_documents (
  id           text PRIMARY KEY,
  content_type text NOT NULL,
  bytes        bytea NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bills (
  id           text PRIMARY KEY,
  owner_id     text NOT NULL REFERENCES users(id),
  category     text NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  due_date     date NOT NULL,
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paid')),
  document_id  text REFERENCES bill_documents(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  paid_at      timestamptz
);
CREATE INDEX IF NOT EXISTS bills_feed_idx ON bills(status, due_date, created_at);
CREATE INDEX IF NOT EXISTS bills_owner_idx ON bills(owner_id);

CREATE TABLE IF NOT EXISTS contributions (
  id           text PRIMARY KEY,
  bill_id      text NOT NULL REFERENCES bills(id),
  user_id      text NOT NULL REFERENCES users(id),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  payment_ref  text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contributions_bill_idx ON contributions(bill_id);
CREATE INDEX IF NOT EXISTS contributions_user_idx ON contributions(user_id);

CREATE TABLE IF NOT EXISTS passes (
  user_id    text NOT NULL REFERENCES users(id),
  bill_id    text NOT NULL REFERENCES bills(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, bill_id)
);
`;
