/**
 * Loopback stand-in for the two external dependencies of the site search: the
 * PostHog `/flags` evaluation and the AI Search Worker. The e2e stack serves it
 * so Playwright controls the provider without depending on an external ranking.
 *
 * - Search flag: the synthetic maintainer and test-enrolled authenticated UIDs
 *   are enabled; the failure identity gets a 500; the shared public audience is off.
 * - Search: tests script one reply per query through `PUT /__replies`; any other
 *   query returns no chunks.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage } from "node:http";
import { dirname } from "node:path";
import { LOOPBACK, repositoryRoot } from "../../../bin/appPorts.ts";

export const SITE_SEARCH_FAKE_ADDRESS_PATH = `${repositoryRoot}/tests/e2e/test-results/e2e-logs/site-search-fake.json`;
export const SITE_SEARCH_FAKE_TOKEN = "phc_e2e_site_search";
export const SITE_SEARCH_FAKE_MAINTAINER = "e2e-site-search-maintainer";
export const SITE_SEARCH_FAKE_FLAG_FAILURE = "e2e-site-search-flag-failure";

export interface SiteSearchFakeReply {
  status: number;
  body: unknown;
  delayMs?: number;
  held?: boolean;
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

interface ReplyProgress {
  started: number;
  completed: number;
  businessStarted: number;
}

interface HeldReply {
  wait: Promise<void>;
  release(): void;
}

interface FakeState {
  replies: Map<string, SiteSearchFakeReply>;
  replyProgress: Map<string, ReplyProgress>;
  heldReplies: Map<string, HeldReply>;
  searchAudience: Set<string>;
}

interface FakeRequest {
  body: Record<string, unknown>;
  url: URL;
  send(status: number, body: unknown): void;
}

type FakeRoute = (state: FakeState, request: FakeRequest) => Promise<void> | void;

const emptyProgress = (): ReplyProgress => ({ started: 0, completed: 0, businessStarted: 0 });

function releaseHeldReply(state: FakeState, query: string) {
  state.heldReplies.get(query)?.release();
  state.heldReplies.delete(query);
}

function holdReply(state: FakeState, query: string) {
  let release = () => {};
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  state.heldReplies.set(query, { wait, release });
}

function evaluateFlags(state: FakeState, { body, send }: FakeRequest) {
  if (body.api_key !== SITE_SEARCH_FAKE_TOKEN) return send(401, {});
  if (body.distinct_id === SITE_SEARCH_FAKE_FLAG_FAILURE) return send(500, {});
  send(200, { flags: {
    "business-registration-visibility": { enabled: true },
    "site-search": { enabled: body.distinct_id === SITE_SEARCH_FAKE_MAINTAINER || state.searchAudience.has(String(body.distinct_id)) },
  } });
}

function trackSearchStart(state: FakeState, query: string, types: unknown): ReplyProgress {
  const progress = state.replyProgress.get(query) ?? emptyProgress();
  state.replyProgress.set(query, progress);
  progress.started += 1;
  if (Array.isArray(types) && types.includes("business")) progress.businessStarted += 1;
  return progress;
}

async function search(state: FakeState, { body, send }: FakeRequest) {
  const query = String(body.query);
  const reply = state.replies.get(query);
  const progress = trackSearchStart(state, query, body.types);
  if (reply?.held) await state.heldReplies.get(query)?.wait;
  if (reply?.delayMs) await new Promise(resolve => setTimeout(resolve, reply.delayMs));
  if (reply) send(reply.status, reply.body);
  else send(200, { chunks: [], durationMs: 1 });
  progress.completed += 1;
}

function readReplyProgress(state: FakeState, { url, send }: FakeRequest) {
  send(200, state.replyProgress.get(url.searchParams.get("query") ?? "") ?? emptyProgress());
}

function scriptReply(state: FakeState, { body, send }: FakeRequest) {
  if (typeof body.query !== "string") return send(404, {});
  releaseHeldReply(state, body.query);
  const reply = body.reply as SiteSearchFakeReply;
  state.replies.set(body.query, reply);
  if (reply.held) holdReply(state, body.query);
  send(204, {});
}

function releaseReply(state: FakeState, { body, send }: FakeRequest) {
  if (typeof body.query !== "string") return send(404, {});
  releaseHeldReply(state, body.query);
  send(204, {});
}

function enrollSearchAudience(state: FakeState, { body, send }: FakeRequest) {
  const uid = body.uid;
  if (typeof uid !== "string" || uid.length === 0 || uid.length > 200) return send(404, {});
  state.searchAudience.add(uid);
  send(204, {});
}

function resetFake(state: FakeState, { send }: FakeRequest) {
  for (const held of state.heldReplies.values()) held.release();
  state.heldReplies.clear();
  state.replies.clear();
  state.replyProgress.clear();
  state.searchAudience.clear();
  send(204, {});
}

const routes: Record<string, FakeRoute> = {
  "POST /flags": evaluateFlags,
  "POST /i/v0/e": (_state, { send }) => send(200, {}),
  "POST /search": search,
  "GET /__replies": readReplyProgress,
  "PUT /__replies": scriptReply,
  "POST /__replies/release": releaseReply,
  "PUT /__search-audience": enrollSearchAudience,
  "DELETE /__replies": resetFake,
};

export async function startSiteSearchFake() {
  const state: FakeState = {
    replies: new Map(),
    replyProgress: new Map(),
    heldReplies: new Map(),
    searchAudience: new Set(),
  };
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
    if (route) return route(state, { body, url, send });
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
      SITE_SEARCH_FLAGS_ORIGIN: url,
      SITE_SEARCH_FLAGS_TOKEN: SITE_SEARCH_FAKE_TOKEN,
      NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: SITE_SEARCH_FAKE_TOKEN,
      NEXT_PUBLIC_POSTHOG_HOST: url,
    },
  };
}
