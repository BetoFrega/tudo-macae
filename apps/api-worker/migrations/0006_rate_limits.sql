CREATE TABLE authentication_rate_limit (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expiresAt INTEGER NOT NULL);
CREATE INDEX authentication_rate_limit_expiry ON authentication_rate_limit(expiresAt);
