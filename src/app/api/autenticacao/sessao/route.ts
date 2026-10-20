import { synchronizeSessionRequest } from "@/features/authentication/synchronizeSessionRequest";
import { hasEmptyBody, isSameOriginMutation } from "@/lib/sameOriginMutation";

const headers = { "Cache-Control": "private, no-store", "Vary": "Cookie" };

function resolveOperationId(request: Request) {
  const suppliedId = request.headers.get("x-session-operation-id");
  return suppliedId && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u.test(suppliedId)
    ? suppliedId
    : crypto.randomUUID();
}

function failureCategory(error: unknown) {
  if (error instanceof TypeError) return "type_error";
  return error instanceof SyntaxError ? "syntax_error" : "unexpected";
}

async function synchronizeSession(operationId: string) {
  try {
    return Response.json(await synchronizeSessionRequest(), { headers });
  }
  catch (error) {
    console.error(JSON.stringify({
      event: "authentication.session.synchronize_failed",
      service: process.env.K_SERVICE ?? "next",
      environment: process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV,
      release: process.env.K_REVISION ?? process.env.GITHUB_SHA ?? "unknown",
      outcome: "failed",
      failureCategory: failureCategory(error),
      route: "/api/autenticacao/sessao",
      statusClass: "5xx",
      operationId,
    }));
    return Response.json({ error: "Não foi possível sincronizar a sessão." }, {
      status: 503,
      headers: { ...headers, "x-session-error-reported": "1" },
    });
  }
}

export async function POST(request: Request) {
  const operationId = resolveOperationId(request);
  if (!isSameOriginMutation(request) || !(await hasEmptyBody(request))) {
    return Response.json({ error: "Não foi possível sincronizar a sessão." }, { status: 403, headers });
  }
  return synchronizeSession(operationId);
}

export async function GET(request: Request) {
  return synchronizeSession(resolveOperationId(request));
}
