import { expect, test, vi } from "vitest";
import { createEditorialImagePurge } from "../editorialPurge";

const key = `editorial/photo/${"a".repeat(64)}`;
const origins = { editorial: "https://qualification.example", images: "https://images.qualification.example" };

test("missing credentials fail as configuration before any request, so the retirement stays pending", async () => {
  const send = vi.fn<typeof fetch>();
  const purge = createEditorialImagePurge({ send, token: undefined, zoneId: undefined, origins });
  expect(await purge([key])).toEqual({ success: false, cause: "configuration" });
  expect(send).not.toHaveBeenCalled();
});

test("the purge and its probes reach only the configured environment's hosts", async () => {
  const send = vi.fn<typeof fetch>(async input => String(input).startsWith("https://api.cloudflare.com/")
    ? Response.json({ success: true, errors: [] })
    : new Response(null, { status: 404 }));
  await createEditorialImagePurge({ send, token: "token", zoneId: "0".repeat(32), origins })([key]);
  const calls = send.mock.calls.map(([input, init]) => ({ url: String(input), body: String(init?.body ?? "") }));
  expect(calls.filter(call => call.url.startsWith("https://api.cloudflare.com/")).map(call => call.body).join()).toContain(origins.editorial);
  const probes = calls.filter(call => !call.url.startsWith("https://api.cloudflare.com/")).map(call => new URL(call.url).origin);
  expect(new Set(probes)).toEqual(new Set([origins.editorial, origins.images]));
});

test("an image origin configured with a trailing slash still probes the images Worker's own path", async () => {
  const send = vi.fn<typeof fetch>(async input => String(input).startsWith("https://api.cloudflare.com/")
    ? Response.json({ success: true, errors: [] })
    : new Response(null, { status: 404 }));
  await createEditorialImagePurge({ send, token: "token", zoneId: "0".repeat(32),
    origins: { ...origins, images: `${origins.images}/` } })([key]);
  const probes = send.mock.calls.map(([input]) => new URL(String(input))).filter(url => url.origin === origins.images);
  expect(new Set(probes.map(url => url.pathname))).toEqual(new Set([`/v1/editorial/hero/750/${encodeURIComponent(key)}`]));
});
