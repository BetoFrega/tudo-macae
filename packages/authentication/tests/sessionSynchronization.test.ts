import { expect, test } from "vitest";
import { createSessionSynchronizer } from "../sessionSynchronization";

test("session synchronization clears invalid cookies and returns the resolved user", async () => {
  let cleared = 0;
  const invalid = createSessionSynchronizer({
    async resolve() { return { status: "invalid" }; },
    async clearInvalidCookies() { cleared += 1; },
  });
  expect(await invalid.synchronize("expired")).toBeNull();
  expect(cleared).toBe(1);

  const valid = createSessionSynchronizer({
    async resolve() { return { status: "valid", user: { uid: "ana", email: undefined, emailVerified: false, isAdmin: false, isEditor: false } }; },
    async clearInvalidCookies() { cleared += 1; },
  });
  expect(await valid.synchronize("valid-cookie")).toMatchObject({ uid: "ana" });
  expect(cleared).toBe(1);
});
