import { createArticleIndexTestIdentity, createArticleIndexTestRuntime, TEST_ARTICLE_INDEX_ORIGIN } from "../../../bin/articleIndexTestRuntime.ts";

if (process.env.NEXT_PUBLIC_APP_ENV !== "test"
  || !/^http:\/\/127\.0\.0\.1:\d+\/?$/.test(process.env.AUTHENTICATION_API_URL ?? "")
  || process.env.PUBLIC_ARTICLE_INDEX_URL !== TEST_ARTICLE_INDEX_ORIGIN) {
  throw new Error("Article index test transport requires the disposable E2E environment");
}

const originalFetch = globalThis.fetch;
let identity;
let runtime;
function testIdentity() {
  return identity ??= createArticleIndexTestIdentity();
}
function index() {
  return runtime ??= testIdentity().then(value => createArticleIndexTestRuntime(value));
}

globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input);
  if (url.origin === TEST_ARTICLE_INDEX_ORIGIN) {
    const request = new Request(input, init);
    // Newsroom journeys retain their warning/retry contract under an external write outage.
    if (request.method !== "GET") return Response.json({ error: "index_unavailable" }, { status: 503 });
    return (await index()).request(request);
  }
  if (url.origin === "http://metadata.google.internal"
    && url.pathname === "/computeMetadata/v1/instance/service-accounts/default/identity") {
    const request = new Request(input, init);
    if (request.headers.get("Metadata-Flavor") !== "Google") return new Response(null, { status: 403 });
    return new Response(await (await testIdentity()).identityToken(url.searchParams.get("audience")));
  }
  return originalFetch(input, init);
};

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    void runtime?.then(value => value.dispose());
  });
}
