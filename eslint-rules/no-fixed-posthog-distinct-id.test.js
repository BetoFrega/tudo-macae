import tsParser from "@typescript-eslint/parser";
import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import rule from "./no-fixed-posthog-distinct-id.js";

RuleTester.describe = describe;
// RuleTester validates rule options with ajv, which compiles code from strings; the Workers
// runtime (quality-flare's Tests check) forbids that.
const inWorkers = globalThis.navigator?.userAgent === "Cloudflare-Workers";
RuleTester.it = inWorkers ? it.skip : it;

const ruleTester = new RuleTester({
  languageOptions: { parser: tsParser },
});

const fixed = [{ messageId: "fixed" }];

ruleTester.run("no-fixed-posthog-distinct-id", rule, {
  valid: [
    // No real visitor: PostHog still evaluates property and 0/100% conditions.
    "JSON.stringify({ api_key: token, distinct_id: \"\" });",
    // A real identity supplied by the caller.
    "async function evaluate(distinctId) { return fetch(url, { body: JSON.stringify({ distinct_id: distinctId }) }); }",
    "JSON.stringify({ distinct_id: user.uid });",
    "JSON.stringify({ distinct_id: readCookie().distinct_id });",
    // Reading the field is not writing it.
    "const { distinct_id: distinctId } = value;",
    "if (body.distinct_id === expected) send();",
    // A mutable binding is not followed.
    "let id = \"a\"; id = user.uid; JSON.stringify({ distinct_id: id });",
    // Another key.
    "JSON.stringify({ token: \"phc_x\", person_properties: { environment: \"production\" } });",
    // Interpolation-only templates and fallbacks between real identities.
    "JSON.stringify({ distinct_id: `${user.uid}` });",
    "JSON.stringify({ distinct_id: visitorId ?? user.uid });",
    "JSON.stringify({ distinct_id: visitorId ?? \"\" });",
    // A computed key that is not `distinct_id`.
    "const key = \"token\"; JSON.stringify({ [key]: \"phc_x\" });",
    "JSON.stringify({ [field]: \"x\" });",
    // A local binding named `undefined` is an ordinary value.
    "function f(undefined) { return { distinct_id: undefined }; }",
    // Later writes of an empty or real identity.
    "const body = {}; body.distinct_id = \"\";",
    "const body = {}; body.distinct_id = user.uid;",
  ],
  invalid: [
    { code: "JSON.stringify({ distinct_id: \"public-image-canary-production\" });", errors: fixed },
    { code: "JSON.stringify({ \"distinct_id\": \"x\" });", errors: fixed },
    { code: "JSON.stringify({ distinct_id: `${serviceName}:${environment}` });", errors: fixed },
    { code: "JSON.stringify({ distinct_id: `business:${businessId}` });", errors: fixed },
    { code: "JSON.stringify({ distinct_id: \"business:\" + businessId });", errors: fixed },
    {
      code: "const distinctId = canary ? \"terms-workers-canary\" : \"terms-workers-global\"; JSON.stringify({ distinct_id: distinctId });",
      errors: fixed,
    },
    {
      code: "const base = \"svc\"; function f() { const id = base; return { distinct_id: id }; }",
      errors: fixed,
    },
    { code: "JSON.stringify({ distinct_id: \"svc\" as const });", errors: fixed },
    { code: "JSON.stringify({ distinct_id: 123 });", errors: fixed },
    { code: "JSON.stringify({ distinct_id: true });", errors: fixed },
    { code: "JSON.stringify({ distinct_id: null });", errors: fixed },
    { code: "JSON.stringify({ distinct_id: undefined });", errors: fixed },
    { code: "JSON.stringify({ distinct_id: void 0 });", errors: fixed },
    { code: "JSON.stringify({ distinct_id: -1 });", errors: fixed },
    { code: "JSON.stringify({ distinct_id: !visitorId });", errors: fixed },
    { code: "const id = \"fixed\"; JSON.stringify({ distinct_id: id! });", errors: fixed },
    { code: "JSON.stringify({ distinct_id: <string>\"fixed\" });", errors: fixed },
    { code: "JSON.stringify({ [`distinct_id`]: \"fixed-service\" });", errors: fixed },
    { code: "const body = {}; body[`distinct_id`] = \"fixed-service\";", errors: fixed },
    { code: "const key = \"distinct_id\"; const body = {}; body[key] = \"fixed-service\";", errors: fixed },
    { code: "const key = \"distinct_id\"; JSON.stringify({ [key]: \"fixed-service\" });", errors: fixed },
    { code: "const id = undefined; JSON.stringify({ distinct_id: id });", errors: fixed },
    { code: "JSON.stringify({ distinct_id: visitorId ?? \"fixed-service\" });", errors: fixed },
    { code: "JSON.stringify({ distinct_id: visitorId || `svc:${environment}` });", errors: fixed },
    { code: "const base = \"svc\"; JSON.stringify({ distinct_id: `${base}` });", errors: fixed },
    { code: "const body = {}; body.distinct_id = \"fixed-service\";", errors: fixed },
    { code: "const body = {}; body[\"distinct_id\"] = `svc:${environment}`;", errors: fixed },
  ],
});
