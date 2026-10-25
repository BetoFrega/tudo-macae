import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";

const fixtureId = /^[A-Za-z0-9_-]+$/u;

async function readInput(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 65536) throw new Error("Fixture input too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}

async function createMigratedAccount({ database }, input) {
  const uid = randomUUID();
  await database
    .prepare(
      "INSERT INTO user (id,name,email,emailVerified,createdAt,updatedAt,claims,disabled,migrated) VALUES (?,'',?,0,?,?,?,0,1)",
    )
    .bind(
      uid,
      input.email,
      Date.now(),
      Date.now(),
      JSON.stringify(input.claims ?? {}),
    )
    .run();
  return { uid };
}

async function createAccount({ runtime, database, origin, publicOrigin, messages }, input) {
  const created = await runtime.dispatchFetch(
    `${origin}/api/auth/sign-up/email`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "origin": publicOrigin,
      },
      body: JSON.stringify({
        email: input.email,
        password: input.password,
      }),
    },
  );
  if (!created.ok) throw new Error("Fixture creation failed");
  const account = await created.json();
  await database
    .prepare("UPDATE user SET claims=?,emailVerified=? WHERE id=?")
    .bind(
      JSON.stringify(input.claims ?? {}),
      Number(input.emailVerified ?? false),
      account.user.id,
    )
    .run();
  await database.batch([
    database
      .prepare("DELETE FROM verification_attempt WHERE userId=?")
      .bind(account.user.id),
    database
      .prepare("DELETE FROM email_confirmation WHERE userId=?")
      .bind(account.user.id),
  ]);
  for (let index = messages.length - 1; index >= 0; index--)
    if (messages[index].to === input.email) messages.splice(index, 1);
  return { uid: account.user.id };
}

async function findAccount({ database }, input) {
  const row = await database
    .prepare(
      "SELECT id,email,emailVerified,claims FROM user WHERE email=? OR id=?",
    )
    .bind(input.email ?? "", input.uid ?? "")
    .first();
  return row
    ? {
        uid: row.id,
        email: row.email,
        emailVerified: !!row.emailVerified,
        claims: JSON.parse(row.claims),
      }
    : null;
}

async function verifyAccount({ database }, input) {
  await database
    .prepare("UPDATE user SET emailVerified=? WHERE email=?")
    .bind(Number(input.emailVerified), input.email)
    .run();
  return { success: true };
}

async function deleteAccount({ database, classifiedsDatabase, classifiedsQualification }, input) {
  if (classifiedsQualification) {
    await classifiedsDatabase.batch([
      classifiedsDatabase.prepare("DELETE FROM classifieds_records WHERE kind='ad' AND owner_id=?").bind(input.uid),
      classifiedsDatabase.prepare("DELETE FROM classifieds_records WHERE kind='profile' AND owner_id=?").bind(input.uid),
      classifiedsDatabase.prepare("DELETE FROM classifieds_records WHERE kind='operation' AND namespace='advertiser_profile_creation_operations' AND json_extract(body,'$.userId')=?").bind(input.uid),
    ]);
  }
  await database
    .prepare("DELETE FROM user WHERE id=?")
    .bind(input.uid)
    .run();
  return { success: true };
}

function latestMail({ messages }, input) {
  const recipient = input.newEmail ?? input.email;
  const purpose = input.mode === "resetPassword" ? "resetPassword" : "verifyEmail";
  return messages.findLast(mail => mail.to === recipient && mail.text.includes(purpose)) ?? null;
}

async function setProfileOwner({ classifiedsDatabase }, input) {
  if (![input.id, input.uid].every(value => typeof value === "string" && fixtureId.test(value))) throw new Error("Invalid fixture ID");
  await classifiedsDatabase.prepare("UPDATE classifieds_records SET version=?, body=json_set(body, '$.userId', ?, '$.revision', coalesce(json_extract(body, '$.revision'), 1)+1) WHERE kind='profile' AND id=?")
    .bind(randomUUID(), input.uid, input.id).run();
  return { success: true };
}

/** Persists malformed photo references that public photo operations cannot create. */
/** Photo removal runs on the maintenance schedule, so a deleted ad's durable effect is its queued cleanup job. */
async function adPhotoCleanup({ classifiedsDatabase }, input) {
  if (typeof input.path !== "string") throw new Error("Invalid fixture input");
  // The job id follows scheduleAdPhotoCleanup in lib/db/classifiedsAdCleanupJobs.ts.
  const job = await classifiedsDatabase.prepare("SELECT 1 FROM classifieds_records WHERE kind='adCleanup' AND id=?")
    .bind(createHash("sha256").update(input.path).digest("hex")).first();
  return { scheduled: !!job };
}

async function deleteCategory({ classifiedsDatabase }, input) {
  if (!fixtureId.test(input.id)) throw new Error("Invalid fixture ID");
  await classifiedsDatabase.batch([
    classifiedsDatabase.prepare("DELETE FROM classifieds_records WHERE kind='subcategory' AND category_id=?").bind(input.id),
    classifiedsDatabase.prepare("DELETE FROM classifieds_records WHERE kind='category' AND id=?").bind(input.id),
  ]);
  return { success: true };
}

async function deleteAd({ classifiedsDatabase }, input) {
  if (!fixtureId.test(input.id)) throw new Error("Invalid fixture ID");
  await classifiedsDatabase.prepare("DELETE FROM classifieds_records WHERE kind=? AND id=?").bind("ad", input.id).run();
  return { success: true };
}

async function deleteProfile({ classifiedsDatabase }, input) {
  if (!fixtureId.test(input.id)) throw new Error("Invalid fixture ID");
  await classifiedsDatabase.prepare("DELETE FROM classifieds_records WHERE kind='ad' AND profile_id=?").bind(input.id).run();
  await classifiedsDatabase.prepare("DELETE FROM classifieds_records WHERE kind=? AND id=?").bind("profile", input.id).run();
  return { success: true };
}

/**
 * The demo seed creates its records through the Worker, which stamps the current
 * time; the demo mass then dates them in the past. Only `createdAt` changes.
 */
async function backdateRecord({ classifiedsDatabase }, input) {
  if (!["ad", "profile"].includes(input.kind) || !fixtureId.test(input.id)) throw new Error("Invalid fixture ID");
  if (!Number.isSafeInteger(input.createdAt) || input.createdAt > Date.now()) throw new Error("Invalid fixture date");
  await classifiedsDatabase.prepare("UPDATE classifieds_records SET version=?, body=json_set(body, '$.createdAt', ?) WHERE kind=? AND namespace='' AND id=?")
    .bind(randomUUID(), input.createdAt, input.kind, input.id).run();
  return { success: true };
}

/**
 * The Blog stamps the save time; the demo mass then dates its posts in the past. A draft keeps no
 * `publishedAt`, and `updatedAt` follows the latest of the two dates.
 */
async function backdatePost({ editorialDatabase }, input) {
  if (!fixtureId.test(input.id)) throw new Error("Invalid fixture ID");
  const dates = [input.createdAt, ...(input.publishedAt === undefined ? [] : [input.publishedAt])];
  if (!dates.every(date => Number.isSafeInteger(date) && date <= Date.now())) throw new Error("Invalid fixture date");
  const published = input.publishedAt === undefined ? "body" : "json_set(body, '$.publishedAt', ?)";
  // RETURNING counts the post itself; D1's `changes` also counts the rows its triggers write.
  const { results } = await editorialDatabase
    .prepare(`UPDATE editorial_records SET version=?, body=json_set(${published}, '$.createdAt', ?, '$.updatedAt', ?) WHERE kind='article' AND namespace='' AND id=? RETURNING id`)
    .bind(randomUUID(), ...dates.slice(1), input.createdAt, Math.max(...dates), input.id).all();
  if (results.length !== 1) throw new Error("Fixture post missing");
  return { success: true };
}

function fixtureRoutes(fixture) {
  const routes = new Map([
    ["/create", input => input.migrated === true ? createMigratedAccount(fixture, input) : createAccount(fixture, input)],
    ["/find", input => findAccount(fixture, input)],
    ["/verify", input => verifyAccount(fixture, input)],
    ["/delete", input => deleteAccount(fixture, input)],
    ["/mail", input => latestMail(fixture, input)],
  ]);
  if (fixture.editorialDatabase) routes.set("/backdate-post", input => backdatePost(fixture, input));
  if (!fixture.classifiedsQualification) return routes;
  routes.set("/set-profile-owner", input => setProfileOwner(fixture, input));
  routes.set("/ad-photo-cleanup", input => adPhotoCleanup(fixture, input));
  routes.set("/delete-category", input => deleteCategory(fixture, input));
  routes.set("/delete-ad", input => deleteAd(fixture, input));
  routes.set("/delete-profile", input => deleteProfile(fixture, input));
  routes.set("/backdate", input => backdateRecord(fixture, input));
  return routes;
}

export function createFixtureController(fixture) {
  const routes = fixtureRoutes(fixture);
  return createServer(async (request, response) => {
    try {
      if (request.method !== "POST") {
        response.writeHead(405).end();
        return;
      }
      const input = await readInput(request);
      const route = routes.get(request.url);
      if (!route) {
        response.writeHead(404).end();
        return;
      }
      const result = await route(input);
      response
        .writeHead(200, {
          "content-type": "application/json",
          "cache-control": "no-store",
        })
        .end(JSON.stringify(result));
    }
    catch {
      response
        .writeHead(500)
        .end(JSON.stringify({ error: "Fixture operation failed" }));
    }
  });
}
