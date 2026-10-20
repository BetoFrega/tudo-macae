import { connection } from "next/server";
import { isRuntimeName } from "@tudomacae/www-origin-routing/release";

export async function GET(request: Request): Promise<Response> {
  await connection();
  const nonce = new URL(request.url).searchParams.get("nonce");
  const service = process.env.K_SERVICE ?? "";
  const revision = process.env.K_REVISION ?? "";
  const headers = { "cache-control": "no-store" };
  if (!nonce || !/^[a-f0-9]{32}$/u.test(nonce)) return new Response(null, { status: 400, headers });
  if (!isRuntimeName(service) || !isRuntimeName(revision) || !revision.startsWith(`${service}-`)) {
    return new Response(null, { status: 503, headers });
  }
  return Response.json({ service, revision, nonce }, { headers });
}
