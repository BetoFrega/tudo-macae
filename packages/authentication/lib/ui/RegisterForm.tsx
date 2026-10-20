"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Button } from "@tudomacae/react-primitives/button";
import { Checkbox } from "@tudomacae/react-primitives/checkbox";
import { Input } from "@tudomacae/react-primitives/input";
import { Label } from "@tudomacae/react-primitives/label";
import { useAuth } from "./authState";
import { useHumanChallenge } from "./humanChallenge";

interface RegisterFormProps {
  email: string;
  onEmailChange: (email: string) => void;
  onSuccess: () => void;
  onSwitchToLogin: () => void;
}

export function RegisterForm({
  email,
  onEmailChange,
  onSuccess,
  onSwitchToLogin,
}: RegisterFormProps) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { challenge, ready, challengeToken, renew } = useHumanChallenge("signup");
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!agreedToTerms) {
      setError(
        "Você precisa concordar com os Termos de Uso e Política de Privacidade.",
      );
      return;
    }

    setLoading(true);

    try {
      const result = await login({
        method: "email-password",
        action: "register",
        data: { email, password, challengeToken },
      });
      if (!result.success) {
        renew();
        setError(result.error || "Erro desconhecido ao criar a conta.");
        return;
      }
      setPassword("");
      onSuccess();
    }
    catch {
      renew();
      setError("Erro desconhecido ao criar a conta.");
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
        <Label htmlFor="register-email">Email</Label>
        <Input
          id="register-email"
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
        <Label htmlFor="register-password">Senha</Label>
        <div className="relative">
          <Input
            id="register-password"
            name="new-password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
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

      <div className="flex items-start gap-3 py-1">
        <Checkbox
          id="terms"
          className="mt-1 size-5 cursor-pointer border-muted-foreground"
          checked={agreedToTerms}
          onCheckedChange={checked => setAgreedToTerms(!!checked)}
        />
        <Label
          htmlFor="terms"
          className="
            block cursor-pointer text-sm/6 font-normal text-muted-foreground
          "
        >
          <span>
            Concordo com os
            {" "}
            <a
              href="/termos-e-condicoes"
              target="_blank"
              rel="noopener noreferrer"
              className={`
                inline font-medium text-primary underline-offset-4
                hover:underline
              `}
            >
              Termos de Uso
            </a>
            {" "}
            e com a
            {" "}
            <a
              href="/politica-de-privacidade"
              target="_blank"
              rel="noopener noreferrer"
              className={`
                font-medium text-primary underline-offset-4
                hover:underline
              `}
            >
              Política de Privacidade
            </a>
            .
          </span>
        </Label>
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
          {loading ? "Criando conta..." : "Criar conta"}
        </Button>

        <Button
          type="button"
          variant="link"
          onClick={onSwitchToLogin}
          className="text-sm"
        >
          Já tem conta? Fazer login
        </Button>
      </div>
    </form>
  );
}
