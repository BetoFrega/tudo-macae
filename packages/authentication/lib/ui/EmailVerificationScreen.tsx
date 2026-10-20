"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@tudomacae/react-primitives/button";
import { Input } from "@tudomacae/react-primitives/input";
import { Label } from "@tudomacae/react-primitives/label";
import { useAuth, type AuthContextType } from "./authState";
import { useLoginModal } from "./LoginModalContext";
import type { VerificationResult } from "../../emailVerification";
import { useAuthenticationIntegration, type EmailVerificationValue } from "./integration";

export interface EmailVerificationOperations {
  read(): Promise<EmailVerificationValue>;
  send(): Promise<VerificationResult>;
  correct(input: { email: string; password: string }): Promise<VerificationResult>;
}
export interface EmailVerificationContent {
  verifiedMessage: string;
  unverifiedMessage: string;
  defaultDestination: string;
  destinationLabel(destination: string): string;
}
type VerificationUser = AuthContextType["user"];
type CorrectionField = { value: string; onChange: (value: string) => void };

function secondsUntil(nextSendAt: number | undefined) {
  return Math.max(0, Math.ceil(((nextSendAt ?? 0) - Date.now()) / 1000));
}

function isVerified(state: EmailVerificationValue, user: VerificationUser) {
  return Boolean(state?.emailVerified || user?.emailVerified);
}

function sendButtonLabel(busy: boolean, remaining: number, nextSendAt: number | undefined) {
  if (busy) return "Aguarde...";
  if (remaining > 0) return `Reenviar em ${remaining}s`;
  return nextSendAt ? "Reenviar e-mail" : "Enviar e-mail";
}

function SignedOutPanel({ loading, onLogin }: { loading: boolean; onLogin: () => void }) {
  return (
    <>
      <p>{loading ? "Consultando sua conta..." : "Entre na sua conta para consultar ou enviar a verificação de e-mail."}</p>
      <Button disabled={loading} onClick={onLogin}>Entrar na minha conta</Button>
    </>
  );
}

function VerifiedPanel({ state, content }: { state: EmailVerificationValue; content: EmailVerificationContent }) {
  const { Link } = useAuthenticationIntegration();
  const destination = state?.destination ?? content.defaultDestination;
  return (
    <>
      <p>{content.verifiedMessage}</p>
      <Button asChild>
        <Link href={destination}>
          {content.destinationLabel(destination)}
        </Link>
      </Button>
    </>
  );
}

function SendStatus({ state }: { state: EmailVerificationValue }) {
  if (state?.pendingEmail) {
    return (
      <p role="status" className="text-sm">
        Aguardando confirmação de
        {" "}
        <strong className="break-all">
          {state.pendingEmail}
        </strong>
        . Até lá, entre com o endereço atual.
      </p>
    );
  }
  if (!state?.nextSendAt || state.error) return null;
  return (
    <p
      role="status"
      className="text-sm"
    >
      E-mail enviado. Confira também a pasta de spam.
    </p>
  );
}

function CorrectEmailForm({ email, password, disabled, onSubmit }: {
  email: CorrectionField;
  password: CorrectionField;
  disabled: boolean;
  onSubmit: () => void;
}) {
  return (
    <details className="border-t pt-5">
      <summary className="cursor-pointer py-2 font-medium text-primary">
        Corrigir meu e-mail
      </summary>
      <form
        className="mt-4 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <p className="text-sm text-muted-foreground">Confirme sua senha e informe o endereço correto. A troca só acontece quando você confirmar o novo e-mail.</p>
        <div className="space-y-2">
          <Label htmlFor="correct-email">Novo e-mail</Label>
          <Input id="correct-email" type="email" autoComplete="email" required value={email.value} onChange={e => email.onChange(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="correct-password">Senha atual</Label>
          <Input id="correct-password" type="password" autoComplete="current-password" required value={password.value} onChange={e => password.onChange(e.target.value)} />
        </div>
        <Button type="submit" disabled={disabled}>Enviar para o novo e-mail</Button>
      </form>
    </details>
  );
}

function UnverifiedPanel({ state, userEmail, content, busy, remaining, email, password, onSend, onCheck, onCorrect }: {
  state: EmailVerificationValue;
  userEmail: string | null;
  content: EmailVerificationContent;
  busy: boolean;
  remaining: number;
  email: CorrectionField;
  password: CorrectionField;
  onSend: () => void;
  onCheck: () => void;
  onCorrect: () => void;
}) {
  return (
    <>
      <div className="space-y-2">
        <p>Confirme que você tem acesso a:</p>
        <p className="text-lg font-semibold break-all">{state?.email ?? userEmail}</p>
        <p className="text-sm text-muted-foreground">{content.unverifiedMessage}</p>
      </div>
      <SendStatus state={state} />
      <div className="
        flex flex-col gap-3
        sm:flex-row sm:flex-wrap
      "
      >
        <Button disabled={busy || remaining > 0} onClick={onSend}>{sendButtonLabel(busy, remaining, state?.nextSendAt)}</Button>
        <Button variant="outline" disabled={busy} onClick={onCheck}>Já confirmei</Button>
      </div>
      <p className="text-sm text-muted-foreground">Não encontrou a mensagem? Confira o spam ou solicite um novo envio.</p>
      <CorrectEmailForm email={email} password={password} disabled={busy || remaining > 0} onSubmit={onCorrect} />
    </>
  );
}

function Feedback({ error, message }: { error: string; message: string }) {
  return (
    <>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {message && <p role="status" className="text-sm">{message}</p>}
    </>
  );
}

export function EmailVerificationScreen({ operations, content }: { operations: EmailVerificationOperations; content: EmailVerificationContent }) {
  const { correct: correctEmailAddress, send: sendEmailVerification, read: readEmailVerificationFromBrowser } = operations;
  const { user, loading, refreshSession, clearVerificationError } = useAuth();
  const { openLoginModal } = useLoginModal();
  const [state, setState] = useState<EmailVerificationValue>(null);
  const [busy, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    let active = true;
    startTransition(async () => {
      try {
        const result = await readEmailVerificationFromBrowser();
        if (active) {
          setState(result);
          setError(result?.error ?? "");
        }
      }
      catch { if (active) setError("Não foi possível consultar a verificação. Tente novamente."); }
    });
    return () => {
      active = false;
    };
  }, [user?.uid, user?.emailVerified, readEmailVerificationFromBrowser]);
  const nextSendAt = state?.nextSendAt;
  useEffect(() => {
    const update = () => setRemaining(secondsUntil(nextSendAt));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [nextSendAt]);
  const check = () => startTransition(async () => {
    setError("");
    try {
      const result = await readEmailVerificationFromBrowser();
      setState(result);
      await refreshSession?.();
      setMessage(result?.emailVerified ? "" : "A confirmação ainda não apareceu. Abra o link recebido e tente novamente.");
    }
    catch { setError("Não foi possível consultar a verificação. Tente novamente."); }
  });
  const applySendResult = (result: VerificationResult, correct: boolean) => {
    if (result.status === "error") {
      setError(result.error);
      return;
    }
    if (result.status !== "sent") return;
    clearVerificationError?.();
    setMessage(correct
      ? `Enviamos a confirmação para ${email}. O novo endereço só valerá após confirmar.`
      : "");
  };
  const send = (correct = false) => startTransition(async () => {
    setError("");
    setMessage("");
    try {
      const result = correct
        ? await correctEmailAddress({ email, password })
        : await sendEmailVerification();
      setPassword("");
      applySendResult(result, correct);
      setState(await readEmailVerificationFromBrowser());
      await refreshSession?.();
    }
    catch { setError("Não foi possível concluir. Tente novamente."); }
  });
  const verified = isVerified(state, user);
  return (
    <section
      className="
        mx-auto max-w-xl space-y-6 rounded-xl border bg-background p-6
        sm:p-8
      "
      aria-labelledby="verification-title"
    >
      <h1 id="verification-title" className="text-2xl font-bold tracking-tight">{verified ? "E-mail confirmado" : "Confirme seu e-mail"}</h1>
      {!user
        ? <SignedOutPanel loading={loading} onLogin={() => openLoginModal()} />
        : verified
          ? <VerifiedPanel state={state} content={content} />
          : (
              <UnverifiedPanel
                state={state}
                userEmail={user.email}
                content={content}
                busy={busy}
                remaining={remaining}
                email={{ value: email, onChange: setEmail }}
                password={{ value: password, onChange: setPassword }}
                onSend={() => send()}
                onCheck={check}
                onCorrect={() => send(true)}
              />
            )}
      <Feedback error={error} message={message} />
    </section>
  );
}
