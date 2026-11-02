/**
 * Loopback stand-in for the AI Search Worker and the PostHog endpoints the app
 * reaches. The e2e stack serves it so Playwright controls the provider without
 * depending on an external ranking.
 *
 * - PostHog: `/flags` enables `business-registration-visibility`; event capture
 *   is accepted and discarded.
 * - Search: tests script one reply per query through `PUT /__replies`; any other
 *   query returns no chunks.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage } from "node:http";
import { dirname } from "node:path";
import { LOOPBACK, repositoryRoot } from "../../../bin/appPorts.ts";

export const SITE_SEARCH_FAKE_ADDRESS_PATH = `${repositoryRoot}/tests/e2e/test-results/e2e-logs/site-search-fake.json`;
export const SITE_SEARCH_FAKE_TOKEN = "phc_e2e_site_search";

export interface SiteSearchFakeReply {
  status: number;
  body: unknown;
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  let body = "";
  for await (const chunk of request) body += chunk;
  try {
    const value: unknown = JSON.parse(body);
    return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  }
  catch {
    return {};
  }
}

interface FakeState {
  replies: Map<string, SiteSearchFakeReply>;
}

interface FakeRequest {
  body: Record<string, unknown>;
  send(status: number, body: unknown): void;
}

type FakeRoute = (state: FakeState, request: FakeRequest) => void;

function evaluateFlags(_state: FakeState, { body, send }: FakeRequest) {
  if (body.api_key !== SITE_SEARCH_FAKE_TOKEN) return send(401, {});
  send(200, { flags: { "business-registration-visibility": { enabled: true } } });
}

function search(state: FakeState, { body, send }: FakeRequest) {
  const reply = state.replies.get(String(body.query));
  if (reply) send(reply.status, reply.body);
  else send(200, { chunks: [], durationMs: 1 });
}

function scriptReply(state: FakeState, { body, send }: FakeRequest) {
  if (typeof body.query !== "string") return send(404, {});
  state.replies.set(body.query, body.reply as SiteSearchFakeReply);
  send(204, {});
}

function resetFake(state: FakeState, { send }: FakeRequest) {
  state.replies.clear();
  send(204, {});
}

const routes: Record<string, FakeRoute> = {
  "POST /flags": evaluateFlags,
  "POST /i/v0/e": (_state, { send }) => send(200, {}),
  "POST /search": search,
  "PUT /__replies": scriptReply,
  "DELETE /__replies": resetFake,
};

export async function startSiteSearchFake() {
  const state: FakeState = { replies: new Map() };
  const server = createServer(async (request, response) => {
    const send = (status: number, body: unknown) => {
      response.writeHead(status, {
        "content-type": "application/json",
        "access-control-allow-origin": request.headers.origin ?? "*",
        "access-control-allow-headers": "content-type",
        "access-control-allow-methods": "POST, OPTIONS",
      });
      response.end(JSON.stringify(body));
    };
    if (request.method === "OPTIONS") return send(204, {});
    const url = new URL(request.url ?? "/", "http://fake");
    const path = url.pathname.replace(/\/$/u, "");
    const body = request.method === "POST" || request.method === "PUT" ? await readJson(request) : {};
    const route = routes[`${request.method} ${path}`];
    if (route) return route(state, { body, send });
    send(404, {});
  });
  await new Promise<void>(resolve => server.listen(0, LOOPBACK, resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Site search fake has no TCP address");
  const url = `http://${LOOPBACK}:${address.port}`;
  mkdirSync(dirname(SITE_SEARCH_FAKE_ADDRESS_PATH), { recursive: true });
  writeFileSync(SITE_SEARCH_FAKE_ADDRESS_PATH, JSON.stringify({ url }));
  // Never keeps the stack alive on its own; the supervised children do.
  server.unref();
  return {
    url,
    env: {
      SITE_SEARCH_URL: url,
      NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: SITE_SEARCH_FAKE_TOKEN,
      NEXT_PUBLIC_POSTHOG_HOST: url,
    },
  };
}
