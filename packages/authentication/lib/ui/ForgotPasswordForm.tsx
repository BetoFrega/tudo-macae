"use client";

import { useState } from "react";
import { Button } from "@tudomacae/react-primitives/button";
import { Input } from "@tudomacae/react-primitives/input";
import { Label } from "@tudomacae/react-primitives/label";
import { useAuthenticationIntegration } from "./integration";
import { useHumanChallenge } from "./humanChallenge";

interface ForgotPasswordFormProps {
  email: string;
  onEmailChange: (email: string) => void;
  onSwitchToLogin: () => void;
  autoFocus?: boolean;
}

export function ForgotPasswordForm({
  email,
  onEmailChange,
  onSwitchToLogin,
  autoFocus = false,
}: ForgotPasswordFormProps) {
  const { requestPasswordResetEmail } = useAuthenticationIntegration();
  const { challenge, ready, challengeToken, renew } = useHumanChallenge("password-reset");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");
    setLoading(true);
    try {
      const result = await requestPasswordResetEmail({ email, ...(challengeToken === undefined ? {} : { challengeToken }) });
      if (result.success)
        setSuccessMessage(
          "Email de recuperação enviado! Verifique sua caixa de entrada.",
        );
      else setError(result.error || "Erro ao enviar email de recuperação. Tente novamente.");
    }
    catch {
      setError("Erro ao enviar email de recuperação. Tente novamente.");
    }
    finally {
      renew();
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      aria-busy={loading}
      className="space-y-4 py-4"
    >
      <div className="space-y-2">
        <Label htmlFor="reset-email">Email</Label>
        <Input
          id="reset-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="seu@email.com"
          value={email}
          onChange={e => onEmailChange(e.target.value)}
          autoFocus={autoFocus}
          required
        />
      </div>

      {challenge}

      {error && (
        <div
          role="alert"
          className="text-sm text-destructive"
        >
          {error}
        </div>
      )}
      {successMessage && (
        <div
          role="status"
          className="text-sm text-primary"
        >
          {successMessage}
        </div>
      )}

      <div className="flex flex-col gap-2 pt-2">
        <Button type="submit" disabled={loading || !ready}>
          {loading ? "Enviando..." : "Enviar email de recuperação"}
        </Button>

        <Button
          type="button"
          variant="link"
          onClick={onSwitchToLogin}
          className="text-sm"
        >
          Voltar para o login
        </Button>
      </div>
    </form>
  );
}
