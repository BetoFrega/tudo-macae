"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@tudomacae/react-primitives/button";
import { useAuth } from "./authState";
import { useAuthenticationIntegration } from "./integration";

export function EmailVerificationAction({ code, continuation, confirmationMessage }: { code: string; continuation: { href: string; label: string }; confirmationMessage: string }) {
  const { refreshSession, getSessionRefreshOperationId } = useAuth();
  const { Link, applyEmailVerification, reportSessionWaitExpired } = useAuthenticationIntegration();
  const [result, setResult] = useState<Awaited<ReturnType<typeof applyEmailVerification>> | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // The one-use code is consumed only by this explicit page visit, never by a link prefetch.
    // Preserve the router's history state so action and session updates keep
    // this confirmation view while its sensitive URL parameters are removed.
    window.history.replaceState(window.history.state, "", window.location.pathname);
    startTransition(async () => {
      try {
        const confirmation = await applyEmailVerification(code);
        if (confirmation.status === "confirmed") {
          let deadline: ReturnType<typeof setTimeout> | undefined;
          try {
            await Promise.race([
              refreshSession?.(),
              new Promise<never>((_, reject) => {
                deadline = setTimeout(() => {
                  reportSessionWaitExpired(getSessionRefreshOperationId?.() ?? crypto.randomUUID());
                  reject(new Error("Session synchronization wait expired"));
                }, 15_000);
              }),
            ]);
          }
          catch {
            setSessionError("Não foi possível atualizar sua sessão. Ao continuar, a página será carregada novamente.");
          }
          finally {
            clearTimeout(deadline);
          }
        }
        setResult(confirmation);
      }
      catch { setResult({ status: "error", error: "Não foi possível confirmar agora. Volte à verificação e tente novamente." }); }
    });
  }, [code, refreshSession, getSessionRefreshOperationId, applyEmailVerification, reportSessionWaitExpired]);
  return (
    <section
      className="
        mx-auto max-w-xl space-y-6 rounded-xl border bg-background p-6
        sm:p-8
      "
      aria-labelledby="email-action-title"
    >
      <h1 id="email-action-title" className="text-2xl font-bold tracking-tight">{!result ? "Confirmando seu e-mail..." : result.status === "confirmed" ? "E-mail confirmado" : "Não foi possível confirmar"}</h1>
      {!result
        ? <p role="status">Aguarde enquanto verificamos o link.</p>
        : result.status === "confirmed"
          ? (
              <>
                <p role="status">
                  O endereço
                  {" "}
                  <strong className="break-all">{result.email}</strong>
                  {" "}
                  foi confirmado.
                </p>
                <p>{confirmationMessage}</p>
                {sessionError && (
                  <p
                    role="alert"
                    className="text-sm text-destructive"
                  >
                    {sessionError}
                  </p>
                )}
                <Button asChild>
                  {sessionError
                    ? <a href={continuation.href}>{continuation.label}</a>
                    : <Link href={continuation.href}>{continuation.label}</Link>}
                </Button>
              </>
            )
          : (
              <>
                <p role="alert" className="text-sm text-destructive">{result.error}</p>
                <Button asChild><Link href={continuation.href}>Voltar à verificação</Link></Button>
              </>
            )}
    </section>
  );
}
