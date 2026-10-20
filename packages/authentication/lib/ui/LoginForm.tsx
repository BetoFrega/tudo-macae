"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Button } from "@tudomacae/react-primitives/button";
import { Input } from "@tudomacae/react-primitives/input";
import { Label } from "@tudomacae/react-primitives/label";
import { useAuth } from "./authState";
import { useHumanChallenge } from "./humanChallenge";

interface LoginFormProps {
  email: string;
  onEmailChange: (email: string) => void;
  onSuccess: () => void;
  onForgotPassword: () => void;
  onSwitchToRegister: () => void;
}

export function LoginForm({
  email,
  onEmailChange,
  onSuccess,
  onForgotPassword,
  onSwitchToRegister,
}: LoginFormProps) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { challenge, ready, challengeToken, renew } = useHumanChallenge("login");
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await login({
        method: "email-password",
        action: "login",
        data: { email, password, challengeToken },
      });
      if (!result.success) {
        renew();
        setError(result.error ?? "Não foi possível entrar. Tente novamente.");
        return;
      }
      setPassword("");
      onSuccess();
    }
    catch {
      renew();
      setError("Não foi possível entrar. Tente novamente.");
    }
    finally {
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
        <Label htmlFor="login-email">Email</Label>
        <Input
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="seu@email.com"
          value={email}
          onChange={e => onEmailChange(e.target.value)}
          autoFocus
          required
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="login-password">Senha</Label>
          <Button
            type="button"
            variant="link"
            className="h-auto px-0 text-xs text-muted-foreground"
            onClick={onForgotPassword}
          >
            Esqueceu a senha?
          </Button>
        </div>
        <div className="relative">
          <Input
            id="login-password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={`
              absolute top-0 right-0 h-full px-3 py-2
              hover:bg-transparent
            `}
            onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword ? "Esconder senha" : "Mostrar senha"}
          >
            {showPassword
              ? (
                  <EyeOff className="size-4 text-muted-foreground" />
                )
              : (
                  <Eye className="size-4 text-muted-foreground" />
                )}
          </Button>
        </div>
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

      <div className="flex flex-col gap-2 pt-2">
        <Button type="submit" disabled={loading || !ready}>
          {loading ? "Entrando..." : "Entrar"}
        </Button>

        <Button
          type="button"
          variant="link"
          onClick={onSwitchToRegister}
          className="text-sm"
        >
          Não tem conta? Criar uma nova conta
        </Button>
      </div>
    </form>
  );
}
