import { expect, test } from "vitest";
import { createEmailVerification } from "../emailVerification";

test("a verified account does not request another message", async () => {
  const messages: string[] = [];
  const verification = createEmailVerification({
    now: () => 1000,
    provider: {
      async readAccount(uid) { return { uid, email: "ana@example.com", emailVerified: true }; },
      async send(uid) { messages.push(uid); },
      async correct() {},
      async confirm() { return { email: "ana@example.com" }; },
    },
    attempts: {
      async read() { return { nextSendAt: 0 }; },
      async reserve() { return { allowed: true, nextSendAt: 61000 }; },
      async finish() {},
    },
  });
  expect(await verification.send("ana")).toEqual({ status: "verified" });
  expect(messages).toEqual([]);
});

function setup() {
  let time = 1000;
  let nextSendAt = 0;
  let sent = 0;
  let fail = false;
  const verification = createEmailVerification({
    now: () => time,
    provider: {
      async readAccount(uid) { return { uid, email: "ana@example.com", emailVerified: false }; },
      async send() {
        if (fail) throw new Error("private provider details");
        sent++;
      },
      async correct() {},
      async confirm() { return { email: "ana@example.com" }; },
    },
    attempts: {
      async read() { return { nextSendAt }; },
      async reserve(_uid, decide) {
        const result = decide(nextSendAt);
        if (result.allowed) nextSendAt = result.nextSendAt;
        return result;
      },
      async finish() {},
    },
  });
  return { verification, advance() {
    time += 60000;
  }, sent: () => sent, fail() {
    fail = true;
  } };
}

test("sending respects a server-side minute shared by overlapping requests", async () => {
  const { verification, advance, sent } = setup();
  const results = await Promise.all([verification.send("ana"), verification.send("ana")]);
  expect(results.map(r => r.status)).toEqual(["sent", "error"]);
  expect(sent()).toBe(1);
  advance();
  expect(await verification.send("ana")).toEqual({ status: "sent", nextSendAt: 121000 });
  expect(sent()).toBe(2);
});

test("a send failure stays recoverable without leaking provider errors", async () => {
  const { verification, fail } = setup();
  fail();
  expect(await verification.send("ana")).toEqual({ status: "error", error: "Não foi possível enviar o e-mail. Tente novamente em um minuto.", nextSendAt: 61000 });
});

test("correction validates the address and password before accepting a new destination", async () => {
  const { verification } = setup();
  expect(await verification.correct("ana", { email: "invalid", password: "" })).toMatchObject({ status: "error" });
  expect(await verification.correct("ana", { email: "nova@example.com", password: "secret" })).toEqual({ status: "sent", nextSendAt: 61000, pendingEmail: "nova@example.com" });
  expect(await verification.read("ana")).toMatchObject({ email: "ana@example.com", emailVerified: false });
});

test("confirmation consumes a native code and does not invent success for missing codes", async () => {
  const { verification } = setup();
  expect(await verification.confirm("")).toMatchObject({ status: "error" });
  expect(await verification.confirm("native-code")).toEqual({ status: "confirmed", email: "ana@example.com" });
});
