CREATE TABLE research_quarantine(kind text NOT NULL CHECK(kind IN ('profile','post','tag')),url text NOT NULL,reason text NOT NULL,last_seen_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,PRIMARY KEY(kind,url));
CREATE INDEX research_quarantine_expiry ON research_quarantine(expires_at);
ALTER TABLE research_quarantine ENABLE ROW LEVEL SECURITY;
