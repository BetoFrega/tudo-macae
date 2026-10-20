import { readAccountReminder } from "@/features/authentication/emailVerificationReads";
import { accountStatusHeaders, reportAccountStatusFailure } from "@/features/authentication/accountStatusHttp";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  const headers = accountStatusHeaders(requestId);
  try {
    const publication = new URL(request.url).searchParams.get("publication") ?? undefined;
    return Response.json(await readAccountReminder(publication), { headers });
  }
  catch (error) {
    reportAccountStatusFailure("authentication.reminder.read_failed", "/api/autenticacao/lembrete", requestId, error);
    return Response.json({ error: "Não foi possível consultar a pendência da conta." }, { status: 503, headers });
  }
}
