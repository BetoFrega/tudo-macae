import { expect, test } from "vitest";
import { authenticationDatabase, start } from "./authenticationRuntimeHarness";

const day = 24 * 60 * 60 * 1000;

test("hourly maintenance deletes sessions and codes expired for more than a day", async () => {
  const worker = await start();
  const database = await authenticationDatabase();
  const now = Date.now();
  await database.prepare("INSERT INTO user (id,name,email,createdAt,updatedAt) VALUES ('expiry','','expiry@example.com',0,0)").run();
  for (const [suffix, expiresAt] of [["old", now - day - 1], ["recent", now - 1]] as const) {
    await database.batch([
      database.prepare("INSERT INTO session (id,expiresAt,token,createdAt,updatedAt,userId) VALUES (?,?,?,0,0,'expiry')").bind(suffix, expiresAt, suffix),
      database.prepare("INSERT INTO verification (id,identifier,value,expiresAt,createdAt,updatedAt) VALUES (?,?,'expiry',?,0,0)").bind(suffix, suffix, expiresAt),
      database.prepare("INSERT INTO password_recovery (tokenHash,userId,recipient,expiresAt) VALUES (?,'expiry','expiry@example.com',?)").bind(suffix, expiresAt),
      database.prepare("INSERT INTO email_confirmation (tokenHash,userId,previousEmail,recipient,expiresAt) VALUES (?,'expiry','expiry@example.com','expiry@example.com',?)").bind(suffix, expiresAt),
    ]);
  }

  expect(await (await worker.getWorker()).scheduled({ scheduledTime: new Date(now) })).toMatchObject({ outcome: "ok" });

  for (const [table, key] of [["session", "id"], ["verification", "id"], ["password_recovery", "tokenHash"], ["email_confirmation", "tokenHash"]]) {
    const rows = await database.prepare(`SELECT ${key} AS key FROM ${table} WHERE ${key} IN ('old','recent')`).all<{ key: string }>();
    expect(rows.results.map(row => row.key), table).toEqual(["recent"]);
  }
});
