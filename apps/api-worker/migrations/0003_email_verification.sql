CREATE TABLE verification_attempt (userId TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE, nextSendAt INTEGER NOT NULL DEFAULT 0, error TEXT, pendingEmail TEXT);
CREATE TABLE email_confirmation (tokenHash TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE, previousEmail TEXT NOT NULL, recipient TEXT NOT NULL, expiresAt INTEGER NOT NULL);
