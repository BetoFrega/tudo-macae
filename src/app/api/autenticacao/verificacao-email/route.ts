import { readEmailVerificationState } from "@/features/authentication/emailVerificationReads";
import { accountStatusHeaders, reportAccountStatusFailure } from "@/features/authentication/accountStatusHttp";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  const headers = accountStatusHeaders(requestId);
  try {
    const params = new URL(request.url).searchParams;
    return Response.json(await readEmailVerificationState({
      publication: params.get("publication") ?? undefined,
      ad: params.get("ad") ?? undefined,
    }), { headers });
  }
  catch (error) {
    reportAccountStatusFailure("authentication.verification.read_failed", "/api/autenticacao/verificacao-email", requestId, error);
    return Response.json({ error: "Não foi possível consultar a verificação." }, { status: 503, headers });
  }
}
