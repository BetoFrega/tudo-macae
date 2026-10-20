import handler from "vinext/server/fetch-handler";

interface WebEnv {
  CF_VERSION_METADATA: { id: string };
}

const worker = {
  async fetch(request: Request, env: WebEnv, context: ExecutionContext) {
    const response = await handler.fetch(request, env, context);
    const headers = new Headers(response.headers);
    headers.set("x-terms-worker-version", env.CF_VERSION_METADATA.id);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};

export default worker;
