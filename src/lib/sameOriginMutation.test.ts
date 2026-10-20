import { expect, test } from "vitest";
import { hasEmptyBody, isSameOriginMutation, readBoundedJson } from "./sameOriginMutation";

const mutationRequest = (headers: Record<string, string> = {}) => new Request("https://internal.invalid/api", {
  method: "POST",
  headers: { "origin": "https://www.tudomacae.com.br", "host": "www.tudomacae.com.br", "x-forwarded-host": "www.tudomacae.com.br", "x-forwarded-proto": "https", ...headers },
});

test("compares browser Origin with the trusted public proxy origin", () => {
  expect(isSameOriginMutation(mutationRequest())).toBe(true);
  expect(isSameOriginMutation(mutationRequest({ origin: "https://attacker.example" }))).toBe(false);
  expect(isSameOriginMutation(mutationRequest({ host: "attacker.example" }))).toBe(false);
  expect(isSameOriginMutation(mutationRequest({ "x-forwarded-proto": "https,http" }))).toBe(false);
});

test("bounds JSON stream bytes even when length is omitted", async () => {
  const tooLarge = new Request("https://www.tudomacae.com.br/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(9));
        controller.close();
      },
    }),
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  expect(await readBoundedJson(tooLarge, 8)).toBeNull();
  expect(await readBoundedJson(mutationRequest({ "content-type": "application/json" }), 8)).toBeNull();
});

test("allows only a truly empty synchronization body", async () => {
  expect(await hasEmptyBody(mutationRequest())).toBe(true);
  expect(await hasEmptyBody(new Request("https://www.tudomacae.com.br/api", { method: "POST", body: "x", duplex: "half" } as RequestInit & { duplex: "half" }))).toBe(false);
});
