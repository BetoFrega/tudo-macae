import { describe, expect, test } from "vitest";
import { mergeClaims, roleChangeError } from "../claims";

describe("mergeClaims", () => {
  test("grants a claim on a user that has none", () => {
    expect(mergeClaims(undefined, { admin: true })).toEqual({ admin: true });
  });

  test("keeps the claims the patch does not mention", () => {
    expect(mergeClaims({ admin: true }, { editor: true })).toEqual({
      admin: true,
      editor: true,
    });
  });

  test("removes a claim the patch turns off", () => {
    expect(mergeClaims({ admin: true, editor: true }, { admin: false }))
      .toEqual({ editor: true });
  });

  test("removing the only claim leaves an empty object", () => {
    expect(mergeClaims({ admin: true }, { admin: false })).toEqual({});
  });

  test("removing a claim the user never had is a no-op", () => {
    expect(mergeClaims({ admin: true }, { editor: false }))
      .toEqual({ admin: true });
  });

  test("an empty patch changes nothing", () => {
    expect(mergeClaims({ admin: true }, {})).toEqual({ admin: true });
  });

  test("invents no key of its own", () => {
    expect(mergeClaims(undefined, {})).toEqual({});
  });

  test("preserves claims outside the known vocabulary", () => {
    // A claim written by an older version of the app, or by hand in the
    // emulator, must survive a grant it has nothing to do with.
    expect(mergeClaims({ legacyRole: "moderator" }, { admin: true })).toEqual({
      legacyRole: "moderator",
      admin: true,
    });
  });

  test("does not mutate the claims it was given", () => {
    const current = { admin: true };
    mergeClaims(current, { admin: false, editor: true });
    expect(current).toEqual({ admin: true });
  });
});

describe("roleChangeError", () => {
  test("refuses a caller without a session or without the admin role", () => {
    expect(roleChangeError(null, "target", { editor: true })).toBe("Não autorizado");
    expect(roleChangeError({ uid: "editor", isAdmin: false }, "target", { editor: true })).toBe("Não autorizado");
  });
  test("refuses an administrator revoking their own admin role", () => {
    expect(roleChangeError({ uid: "admin", isAdmin: true }, "admin", { admin: false }))
      .toBe("Você não pode remover seu próprio status de admin");
  });
  test("lets an administrator change another administrator and their own editor role", () => {
    expect(roleChangeError({ uid: "admin", isAdmin: true }, "other", { admin: false })).toBeUndefined();
    expect(roleChangeError({ uid: "admin", isAdmin: true }, "admin", { editor: false })).toBeUndefined();
  });
});
