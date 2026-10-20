import { describe, expect, it, vi } from "vitest";
import { setReleaseFlag } from "./set-release-flag.mjs";

const flagsUrl = "https://eu.posthog.com/api/projects/108331/feature_flags/";
const request = { NODE_ENV: "production" as const, POSTHOG_FLAGS_API_KEY: "test-key", FLAG_KEY: "site-workers-canary", FLAG_ACTIVE: "true" };

function posthog(initial: { id: number; key: string; active: boolean; filters?: unknown; evaluation_runtime?: string }[]) {
  const flags = [...initial];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    if (init.method === "POST") flags.push({ id: 99, key: body.key, active: body.active, filters: body.filters, evaluation_runtime: body.evaluation_runtime });
    if (init.method === "PATCH") {
      const flag = flags.find(candidate => url === `${flagsUrl}${candidate.id}/`)!;
      Object.assign(flag, { active: body.active, filters: body.filters, evaluation_runtime: body.evaluation_runtime });
    }
    const changed = init.method ? flags.find(flag => flag.key === (body.key ?? request.FLAG_KEY)) : undefined;
    return Response.json(changed ?? { results: flags.map(flag => ({ ...flag })) });
  });
  return { flags, fetchImpl };
}

describe("Workers journey flag changes", () => {
  it("creates a missing flag on for everyone, authenticated with the key", async () => {
    const { flags, fetchImpl } = posthog([]);
    await expect(setReleaseFlag(request, fetchImpl)).resolves.toEqual({ key: "site-workers-canary", active: true, changed: true });
    expect(flags).toMatchObject([{ id: 99, key: "site-workers-canary", active: true }]);
    const create = fetchImpl.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(JSON.parse(String(create[1]!.body))).toMatchObject({ filters: { groups: [{ properties: [], rollout_percentage: 100 }] }, evaluation_runtime: "all" });
    expect(new Headers(create[1]!.headers).get("authorization")).toBe("Bearer test-key");
  });

  it("turns an existing flag off without creating anything", async () => {
    const { flags, fetchImpl } = posthog([{ id: 7, key: "site-workers-canary", active: true }]);
    await setReleaseFlag({ ...request, FLAG_ACTIVE: "false" }, fetchImpl);
    expect(flags).toMatchObject([{ id: 7, key: "site-workers-canary", active: false }]);
    const { fetchImpl: emptyFetch } = posthog([]);
    await expect(setReleaseFlag({ ...request, FLAG_ACTIVE: "false" }, emptyFetch)).resolves.toMatchObject({ changed: false });
    expect(emptyFetch.mock.calls.every(([, init]) => !init?.method)).toBe(true);
  });

  it("reports a rollout narrowed to some users as changed when it becomes global", async () => {
    const narrowed = { groups: [{ properties: [], rollout_percentage: 10 }] };
    const { fetchImpl } = posthog([{ id: 7, key: "site-workers-canary", active: true, filters: narrowed }]);
    await expect(setReleaseFlag(request, fetchImpl)).resolves.toMatchObject({ changed: true });
    const stored = { groups: [{ properties: [], rollout_percentage: 100, variant: null }], payloads: {}, multivariate: null };
    const { fetchImpl: globalFetch } = posthog([{ id: 7, key: "site-workers-canary", active: true, filters: stored, evaluation_runtime: "all" }]);
    await expect(setReleaseFlag(request, globalFetch)).resolves.toMatchObject({ changed: false });
    const { fetchImpl: clientOnlyFetch } = posthog([{ id: 7, key: "site-workers-canary", active: true, filters: stored, evaluation_runtime: "client" }]);
    await expect(setReleaseFlag(request, clientOnlyFetch)).resolves.toMatchObject({ changed: true });
  });

  it("refuses flags outside the Workers journeys and missing credentials", async () => {
    const { fetchImpl } = posthog([]);
    await expect(setReleaseFlag({ ...request, FLAG_KEY: "new-checkout" }, fetchImpl)).rejects.toThrow("Not a Workers journey flag");
    await expect(setReleaseFlag({ ...request, POSTHOG_FLAGS_API_KEY: "" }, fetchImpl)).rejects.toThrow("POSTHOG_FLAGS_API_KEY");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails when PostHog does not keep the requested state", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init: RequestInit = {}) =>
      Response.json(init.method ? { id: 7 } : { results: [{ id: 7, key: "site-workers-canary", active: false }] }));
    await expect(setReleaseFlag(request, fetchImpl)).rejects.toThrow("did not keep");
    const narrowed = { groups: [{ properties: [{ key: "email" }], rollout_percentage: 100 }] };
    const narrowedFetch = vi.fn(async (_input: RequestInfo | URL, init: RequestInit = {}) =>
      Response.json(init.method ? { id: 7 } : { results: [{ id: 7, key: "site-workers-canary", active: true, filters: narrowed, evaluation_runtime: "all" }] }));
    await expect(setReleaseFlag(request, narrowedFetch)).rejects.toThrow("did not keep");
  });
});
