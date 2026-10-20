import { z } from "zod";
import type { EditorialPersistence } from "@tudomacae/editorial-persistence";
import { createEditorialPersistence } from "../editorial";
import { createEditorialMedia, createEditorialMediaOperations, type MediaBytes } from "../lib/editorialMedia";
import { firstPartyEditorialCaller, mcpEditorialCaller } from "@tudomacae/editorial-access/caller";
import { administrativeMediaCaller } from "@tudomacae/editorial-media/caller";

const inputSchema = z.object({
  action: z.enum(["register", "ensure", "get", "byIds", "revisions", "update", "search", "unreferenced", "prepare", "finalize", "metadata", "readFinalized", "sweep", "plan", "transition", "record", "ingestPrepare", "ingestFinalize", "ingestGet", "ingestReconcile", "ingestSearch", "correct"]),
  input: z.any().optional(),
  ownerId: z.string().default("a".repeat(64)),
  operationId: z.string().default("operation"),
  /** Pauses the first decision that creates Media, after its reads and before its commit, until the test releases the gate. */
  barrier: z.string().optional(),
  now: z.number().default(1_800_000_000_000),
  /** Editorial caller of the ingestion and correction actions. */
  caller: z.object({ channel: z.enum(["administration", "newsroom", "mcp"]), editorId: z.string(), editorialClientId: z.string().default("client") }).default({ channel: "administration", editorId: "admin", editorialClientId: "client" }),
  requestId: z.string().optional(),
  /** Source Permissions that authorize Media use. */
  permissions: z.array(z.string()).default([]),
  /** Refuses the live editor role of every caller. */
  denied: z.boolean().default(false),
});
type FixtureInput = z.infer<typeof inputSchema>;
type FixtureEnv = { EDITORIAL_DB: D1Database; GATE: Fetcher };

async function sha256(bytes: Uint8Array) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)))].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

/** Uploads hold their declared size as text, so equal sizes sanitize to one digest. */
function bytes(removed: string[]): MediaBytes {
  return {
    assertPrivate: async () => {},
    sign: async reservation => ({ reservationId: reservation.id, expiresAt: reservation.expiresAt, upload: { url: `https://upload.test/${reservation.id}`, headers: {} } }) as never,
    readUpload: async reservation => new TextEncoder().encode(String(reservation.input.size)),
    sanitize: async content => ({ bytes: content, digest: await sha256(content) }),
    storeMedia: async (_content, digest) => `media-staged/sha256-${digest}.webp`,
    removeUpload: async (id) => {
      removed.push(id);
    },
  };
}

function held(persistence: EditorialPersistence, barrier: string | undefined, env: FixtureEnv): EditorialPersistence {
  if (!barrier) return persistence;
  let paused = false;
  return {
    ...persistence,
    transact: (intent, decide) => persistence.transact(intent, async (tx) => {
      const value = await decide(tx);
      if (!paused && (value as { status?: string } | null)?.status === "created") {
        paused = true;
        await env.GATE.fetch(`http://gate/${barrier}`);
      }
      return value;
    }),
  };
}

function editorialCaller({ channel, editorId, editorialClientId }: FixtureInput["caller"]) {
  if (channel === "administration") return administrativeMediaCaller(editorId);
  return channel === "mcp" ? mcpEditorialCaller({ editorId, editorialClientId }) : firstPartyEditorialCaller(editorId);
}

async function run(input: FixtureInput, env: FixtureEnv) {
  const removed: string[] = [];
  const persistence = held(createEditorialPersistence({ database: env.EDITORIAL_DB }), input.barrier, env);
  const media = createEditorialMedia({ persistence, bytes: bytes(removed), now: () => input.now });
  const operations = createEditorialMediaOperations({ persistence, media, now: () => input.now, access: {
    authorize: async () => {
      if (input.denied) throw new Error("Papel editorial inativo.");
    },
    hasMediaUsePermission: async id => input.permissions.includes(id),
  } });
  const caller = editorialCaller(input.caller);
  const value = input.input;
  const actions: Record<FixtureInput["action"], () => Promise<unknown>> = {
    register: () => media.catalog.register(value),
    ensure: () => media.catalog.ensureDemo(value),
    get: () => media.catalog.get(value),
    byIds: () => media.catalog.byIds(value),
    revisions: () => media.catalog.listRevisions(value),
    transition: () => media.catalog.transitionLegacy(value),
    update: () => media.revisions.update(value),
    search: () => media.search.search(value),
    unreferenced: () => media.search.reportUnreferenced(value, { hasReference: async id => id.endsWith("used") }),
    prepare: () => media.preparation.prepare(input.ownerId, input.operationId, value),
    finalize: () => media.finalization.finalize(input.ownerId, input.operationId, value),
    metadata: () => media.queries.metadata(input.ownerId, value),
    readFinalized: () => media.queries.readFinalized(input.ownerId, input.operationId, value),
    sweep: async () => ({ ...await media.quarantine.sweep(value), removed }),
    plan: () => media.quarantine.plan(value),
    record: () => persistence.read(value.kind, value.id, value.namespace),
    ingestPrepare: () => operations.ingestion.prepare(caller, value),
    ingestFinalize: () => operations.ingestion.finalize(caller, value),
    ingestGet: () => operations.ingestion.get(caller, value),
    ingestReconcile: () => operations.ingestion.reconcile(caller, value),
    ingestSearch: () => operations.ingestion.search(caller, value, input.requestId),
    correct: () => operations.correction.correct(firstPartyEditorialCaller(input.caller.editorId), value),
  };
  return actions[input.action]();
}

const worker = {
  async fetch(request: Request, env: FixtureEnv) {
    try {
      return Response.json({ value: await run(inputSchema.parse(await request.json()), env) ?? null });
    }
    catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      return Response.json({ error: failure.name, message: failure.message, code: (failure as { code?: string }).code, details: (failure as { details?: unknown }).details });
    }
  },
};

export default worker;
