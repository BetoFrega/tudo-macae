export function authenticationRateLimitStorage(
  database: D1Database,
  secret: string,
  now: () => number,
) {
  const signingKey = crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  return {
    async consume(key: string, rule: { window: number; max: number }) {
      const digest = await crypto.subtle.sign(
        "HMAC", await signingKey, new TextEncoder().encode(key),
      );
      const opaqueKey = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
      const timestamp = now();
      const expiresAt = timestamp + rule.window * 1000;
      // The conditional upsert admits and increments together across isolates.
      // Denied requests preserve the last admitted request's expiry.
      const results = await database.batch([
        database.prepare("DELETE FROM authentication_rate_limit WHERE key IN (SELECT key FROM authentication_rate_limit WHERE expiresAt<=? LIMIT 1000)").bind(timestamp),
        database.prepare("INSERT INTO authentication_rate_limit (key,count,expiresAt) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN authentication_rate_limit.expiresAt<=? THEN 1 ELSE authentication_rate_limit.count+1 END, expiresAt=excluded.expiresAt WHERE authentication_rate_limit.expiresAt<=? OR authentication_rate_limit.count<? RETURNING expiresAt")
          .bind(opaqueKey, expiresAt, timestamp, timestamp, rule.max),
      ]);
      if (results[1].results.length > 0)
        return { allowed: true, retryAfter: null };
      const current = await database.prepare("SELECT expiresAt FROM authentication_rate_limit WHERE key=?").bind(opaqueKey).first<{ expiresAt: number }>();
      return {
        allowed: false,
        retryAfter: Math.max(1, Math.ceil(((current?.expiresAt ?? expiresAt) - timestamp) / 1000)),
      };
    },
  };
}
