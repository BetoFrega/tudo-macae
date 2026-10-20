"use client";

import { Fragment, useCallback, useState } from "react";
import { useHumanChallengeRenderer, type HumanChallengeAction } from "./integration";

/**
 * Renders the integration's challenge for one form. Tokens are single-use: call renew()
 * after every submission so the next attempt mounts a fresh widget. Without a
 * configured challenge, or when it cannot load, the form stays submittable without a
 * token and the server decides; that keeps the server's enforcement switch effective.
 * While submit waits for a token, a status line says why, since a disabled button
 * cannot explain itself.
 */
export function useHumanChallenge(action: HumanChallengeAction) {
  const renderChallenge = useHumanChallengeRenderer();
  const [attempt, setAttempt] = useState(0);
  const [token, setToken] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  // Stable so the widget effect does not re-render Turnstile on every form render.
  const onUnavailable = useCallback(() => setUnavailable(true), []);
  // Turnstile retries errors itself; a token after an error means it recovered, so a
  // later expiry must block submit again.
  const onToken = useCallback((value: string | null) => {
    setToken(value);
    if (value !== null) setUnavailable(false);
  }, []);
  const ready = !renderChallenge || token !== null || unavailable;
  return {
    challenge: renderChallenge
      ? (
          <>
            <Fragment key={attempt}>{renderChallenge({ action, onToken, onUnavailable })}</Fragment>
            <p role="status" className="text-sm text-muted-foreground">
              {ready ? "" : "Aguarde a verificação de segurança para continuar."}
            </p>
          </>
        )
      : null,
    ready,
    challengeToken: token ?? undefined,
    renew() {
      setToken(null);
      setUnavailable(false);
      setAttempt(value => value + 1);
    },
  };
}
