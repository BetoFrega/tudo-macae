import { loginPassword } from "@/integrations/authentication/passwordLoginCommand";
import { isSameOriginMutation, readBoundedJson } from "@/lib/sameOriginMutation";

const headers = { "Cache-Control": "private, no-store", "Vary": "Cookie" };
const operationIdPattern = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u;

function resolveOperationId(suppliedId: string | null) {
  return suppliedId && operationIdPattern.test(suppliedId) ? suppliedId : crypto.randomUUID();
}

function failureCategory(error: unknown) {
  if (error instanceof TypeError) return "type_error";
  return error instanceof SyntaxError ? "syntax_error" : "unexpected";
}

export async function POST(request: Request) {
  const operationId = resolveOperationId(request.headers.get("x-auth-operation-id"));
  if (!isSameOriginMutation(request)) {
    return Response.json({ success: false, error: "Não foi possível entrar. Tente novamente." }, { status: 403, headers });
  }
  const input = await readBoundedJson(request);
  if (input === null) {
    return Response.json({ success: false, error: "Não foi possível entrar. Tente novamente." }, { status: 400, headers });
  }
  try {
    const result = await loginPassword(input);
    return Response.json(result, { headers });
  }
  catch (error) {
    console.error(JSON.stringify({
      event: "authentication.login.failed",
      service: process.env.K_SERVICE ?? "next",
      environment: process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV,
      release: process.env.K_REVISION ?? process.env.GITHUB_SHA ?? "unknown",
      outcome: "failed",
      failureCategory: failureCategory(error),
      route: "/api/autenticacao/entrar",
      statusClass: "5xx",
      operationId,
    }));
    return Response.json({ success: false, error: "Não foi possível entrar. Tente novamente." }, {
      status: 503,
      headers: { ...headers, "x-auth-error-reported": "1" },
    });
  }
}
