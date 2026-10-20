import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const flagsUrl = "https://eu.posthog.com/api/projects/108331/feature_flags/";
/** Only Workers journey flags; any other release flag stays a PostHog dashboard decision. */
const journeyFlagKey = /^[a-z][a-z0-9-]*-workers-(route|canary)$/u;
/** The edge router evaluates flags for one fixed identity, so "on" means everyone. */
const everyone = { groups: [{ properties: [], rollout_percentage: 100 }] };
/** `/flags?v=2` only evaluates flags available to every runtime. */
const edgeEvaluated = { filters: everyone, evaluation_runtime: "all" };

function assertRequest({ POSTHOG_FLAGS_API_KEY: apiKey, FLAG_KEY: key, FLAG_ACTIVE: active }) {
  if (!apiKey) throw new Error("Release flag change requires POSTHOG_FLAGS_API_KEY.");
  if (!journeyFlagKey.test(key ?? "")) throw new Error(`Not a Workers journey flag: ${key}`);
  if (active !== "true" && active !== "false") throw new Error("FLAG_ACTIVE must be true or false.");
  return { apiKey, key, active: active === "true" };
}

async function call(fetchImpl, apiKey, url, init = {}) {
  const response = await fetchImpl(url, {
    ...init,
    headers: { "authorization": `Bearer ${apiKey}`, "content-type": "application/json" },
  });
  if (!response.ok) throw new Error(`PostHog ${init.method ?? "GET"} ${new URL(url).pathname} answered ${response.status}.`);
  return response.json();
}

async function findFlag(fetchImpl, apiKey, key) {
  const page = await call(fetchImpl, apiKey, `${flagsUrl}?search=${encodeURIComponent(key)}`);
  return page.results.find(flag => flag.key === key && !flag.deleted);
}

/** PostHog adds its own fields to stored filters, so compare what decides the audience. */
function isAlready(flag, active) {
  const groups = flag?.filters?.groups ?? [];
  return flag?.active === active && flag.evaluation_runtime === "all" && groups.length === 1
    && [100, null].includes(groups[0].rollout_percentage) && !groups[0].properties?.length;
}

/** Creates the flag on first use; turning one off never creates it, since a missing flag already reads as off. */
export async function setReleaseFlag(environment = process.env, fetchImpl = fetch) {
  const { apiKey, key, active } = assertRequest(environment);
  const existing = await findFlag(fetchImpl, apiKey, key);
  if (!existing && !active) return { key, active: false, changed: false };
  const flag = existing
    ? await call(fetchImpl, apiKey, `${flagsUrl}${existing.id}/`, { method: "PATCH", body: JSON.stringify({ active, ...edgeEvaluated }) })
    : await call(fetchImpl, apiKey, flagsUrl, { method: "POST", body: JSON.stringify({ key, name: key, active, ...edgeEvaluated }) });
  const stored = await findFlag(fetchImpl, apiKey, key);
  if (stored?.id !== flag.id || !isAlready(stored, active)) throw new Error(`PostHog did not keep ${key} active=${active}.`);
  return { key, active, changed: !isAlready(existing, active) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await setReleaseFlag();
  console.log(`${result.key} active=${result.active}${result.changed ? "" : " (unchanged)"}`);
}
