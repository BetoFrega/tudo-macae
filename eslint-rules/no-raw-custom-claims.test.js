import tsParser from "@typescript-eslint/parser";
import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import rule from "./no-raw-custom-claims.js";

RuleTester.describe = describe;
// RuleTester validates rule options with ajv, which compiles code from strings; the Workers
// runtime (quality-flare's Tests check) forbids that.
const inWorkers = globalThis.navigator?.userAgent === "Cloudflare-Workers";
RuleTester.it = inWorkers ? it.skip : it;

const ruleTester = new RuleTester({
  languageOptions: { parser: tsParser },
});

const CALL = "await auth.setCustomUserClaims(uid, { admin: true });";
const ALLOW = [{ allow: ["src/features/users/claims/setUserClaims.ts"] }];

ruleTester.run("no-raw-custom-claims", rule, {
  valid: [
    {
      code: CALL,
      filename: "/repo/src/features/users/claims/setUserClaims.ts",
      options: ALLOW,
    },
    {
      // Going through the wrapper is the whole point.
      code: "await setUserClaims(uid, { editor: true });",
      filename: "/repo/src/features/users/actions/setEditorClaim.ts",
      options: ALLOW,
    },
    {
      // Reading claims is not writing them.
      code: "const claims = (await auth.getUser(uid)).customClaims;",
      filename: "/repo/src/features/users/actions/setEditorClaim.ts",
      options: ALLOW,
    },
    {
      // The allow-list covers the other spellings too — the wrapper is free to
      // reach the method however it likes.
      code: "await auth[\"setCustomUserClaims\"](uid, {});",
      filename: "/repo/src/features/users/claims/setUserClaims.ts",
      options: ALLOW,
    },
    {
      // A name that is only known at runtime cannot be matched statically. The
      // rule says nothing rather than guessing.
      code: "await auth[whichever](uid, {});",
      filename: "/repo/src/features/users/actions/setEditorClaim.ts",
      options: ALLOW,
    },
    {
      // Declaring a stub by that name writes no claims.
      code: "const fake = { setCustomUserClaims: () => {} };",
      filename: "/repo/src/features/users/actions/setEditorClaim.ts",
      options: ALLOW,
    },
    {
      // Naming the method in prose is how this rule gets explained.
      code: "const why = \"setCustomUserClaims replaces everything\";",
      filename: "/repo/src/features/users/actions/setEditorClaim.ts",
      options: ALLOW,
    },
  ],

  invalid: [
    {
      code: CALL,
      filename: "/repo/src/features/users/actions/setEditorClaim.ts",
      options: ALLOW,
      errors: [{ messageId: "raw" }],
    },
    {
      code: CALL,
      filename: "/repo/src/features/users/actions/setAdminClaim.ts",
      options: ALLOW,
      errors: [{ messageId: "raw" }],
    },
    {
      // No allow-list configured means no exceptions.
      code: CALL,
      filename: "/repo/src/features/users/claims/setUserClaims.ts",
      errors: [{ messageId: "raw" }],
    },
    {
      // A different handle is still the same replacing call.
      code: "await adminAuth.setCustomUserClaims(uid, {});",
      filename: "/repo/tests/_helpers/auth/helpers/authentication.ts",
      options: ALLOW,
      errors: [{ messageId: "raw" }],
    },
    {
      // Bracket access is the same call wearing a different hat, and it is what
      // a lint rule keyed on the dotted form quietly waves through.
      code: "await auth[\"setCustomUserClaims\"](uid, {});",
      filename: "/repo/src/features/users/actions/setEditorClaim.ts",
      options: ALLOW,
      errors: [{ messageId: "raw" }],
    },
    {
      // Single quotes reach the same node; the parser normalises the value.
      code: "await auth['setCustomUserClaims'](uid, {});",
      filename: "/repo/src/features/users/actions/setEditorClaim.ts",
      options: ALLOW,
      errors: [{ messageId: "raw" }],
    },
    {
      // Pulling the method off the object defers the write but keeps it raw.
      code: "const { setCustomUserClaims } = auth;",
      filename: "/repo/src/features/users/actions/setEditorClaim.ts",
      options: ALLOW,
      errors: [{ messageId: "raw" }],
    },
    {
      // Renaming on the way out does not launder it either.
      code: "const { setCustomUserClaims: write } = getAuth();",
      filename: "/repo/src/features/users/actions/setEditorClaim.ts",
      options: ALLOW,
      errors: [{ messageId: "raw" }],
    },
  ],
});
