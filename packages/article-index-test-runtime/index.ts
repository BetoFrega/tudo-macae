import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { Miniflare, Response as MiniflareResponse } from "miniflare";

export const TEST_ARTICLE_INDEX_ORIGIN = "https://article-index.test";
const serviceAccount = "article-index-test@example.iam.gserviceaccount.com";
const callerScript = "export default { async fetch(request, env) { const { binding, method, args } = await request.json(); try { return Response.json({ value: await env[binding][method](...args) }); } catch (error) { return Response.json({ error: String(error) }); } } };";

export async function createArticleIndexTestIdentity() {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwks = { keys: [{ ...await exportJWK(publicKey), kid: "article-index-test", alg: "RS256" }] };
  return {
    jwks,
    async identityToken(audience: string) {
      if (audience !== TEST_ARTICLE_INDEX_ORIGIN) throw new Error("Unexpected test identity audience");
      return new SignJWT({ email: serviceAccount, email_verified: true })
        .setProtectedHeader({ alg: "RS256", kid: "article-index-test" })
        .setIssuer("https://accounts.google.com").setAudience(audience)
        .setSubject("article-index-test").setIssuedAt().setExpirationTime("5m").sign(privateKey);
    },
  };
}

export async function createArticleIndexTestRuntime(
  options: {
    build: (directory: string) => void;
    identity?: Awaited<ReturnType<typeof createArticleIndexTestIdentity>>;
    withoutMigrations?: boolean;
  },
) {
  const testIdentity = options.identity ?? await createArticleIndexTestIdentity();
  const directory = await mkdtemp(join(tmpdir(), "article-index-test-"));
  let runtime: Miniflare | undefined;
  try {
    options.build(directory);
    const bundle = (await readdir(directory)).find(name => name.endsWith(".js"));
    if (!bundle) throw new Error("Article index Worker bundle missing");
    runtime = new Miniflare({ workers: [{ config: {
      name: "article-index-test", compatibilityDate: "2026-09-22",
      env: { DB: { type: "d1", id: "article-index-test" },
        OIDC_AUDIENCE: { type: "json", value: TEST_ARTICLE_INDEX_ORIGIN },
        OIDC_SERVICE_ACCOUNT: { type: "json", value: serviceAccount } },
      manifest: { mainModule: bundle, modules: { [bundle]: { contents: await readFile(join(directory, bundle), "utf8"), type: "esm" } }, modulesRoot: directory },
    }, dev: { outboundService: { type: "fetcher", handler: async (request) => {
      if (request.url !== "https://www.googleapis.com/oauth2/v3/certs") throw new Error("Unexpected Worker network request");
      return MiniflareResponse.json(testIdentity.jwks);
    } } } }, { config: {
      // A bound caller reaches the writer entrypoint the way the API Worker's service binding does.
      name: "article-index-caller", compatibilityDate: "2026-09-22",
      env: { INDEX: { type: "worker", worker: "article-index-test", exportName: "ArticleIndexWriter" },
        READER: { type: "worker", worker: "article-index-test", exportName: "ArticleIndexReader" } },
      manifest: { mainModule: "caller.js", modulesRoot: directory, modules: { "caller.js": { type: "esm", contents: callerScript } } },
    } }] });
    const database = await runtime.getD1Database("DB");
    for (const migration of options.withoutMigrations ? [] : (await readdir(join(directory, "migrations"))).filter(name => name.endsWith(".sql")).sort()) {
      const statements = await readFile(join(directory, "migrations", migration), "utf8");
      for (const sql of statements.split(";").filter(sql => sql.trim())) await database.prepare(sql).run();
    }
    const worker = runtime;
    async function call(binding: "INDEX" | "READER", method: string, args: unknown[]) {
      const caller = await worker.getWorker("article-index-caller");
      const response = await caller.fetch("http://caller/", { method: "POST", body: JSON.stringify({ binding, method, args }) });
      return await response.json() as { value?: unknown; error?: string };
    }
    return {
      identityToken: testIdentity.identityToken,
      /** Calls the writer entrypoint through a service binding; storage failures surface as `error`. */
      async rpc(method: "publish" | "retire" | "summaries", ...args: unknown[]): Promise<{ value?: unknown; error?: string }> {
        return call("INDEX", method, args);
      },
      /** Calls the read-only entrypoint the web Worker binds for its sitemap. */
      async readerRpc(method: "summaries", ...args: unknown[]): Promise<{ value?: unknown; error?: string }> {
        return call("READER", method, args);
      },
      async request(input: string | URL | Request, init?: RequestInit): Promise<Response> {
        const request = new Request(input, init);
        if (new URL(request.url).origin !== TEST_ARTICLE_INDEX_ORIGIN) throw new Error("Unexpected test Worker origin");
        const response = await worker.dispatchFetch(request.url, {
          method: request.method, headers: Object.fromEntries(request.headers),
          ...(request.body ? { body: await request.arrayBuffer() } : {}),
        });
        return new Response(await response.arrayBuffer(), { status: response.status, headers: Object.fromEntries(response.headers) });
      },
      async dispose() {
        try {
          await worker.dispose();
        }
        finally {
          await rm(directory, { recursive: true, force: true });
        }
      },
    };
  }
  catch (error) {
    await runtime?.dispose();
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
