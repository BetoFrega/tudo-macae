"use client";
import { authenticationRetryMessage } from "../../passwordLogin";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Button } from "@tudomacae/react-primitives/button";
import { Input } from "@tudomacae/react-primitives/input";
import { Label } from "@tudomacae/react-primitives/label";
import { useAuth } from "./authState";
import { useAuthenticationIntegration } from "./integration";
import { useLoginModal } from "./LoginModalContext";

interface NewPasswordFormProps {
  oobCode: string;
}

export function ResetPasswordForm({ oobCode }: NewPasswordFormProps) {
  const { Link, resetPassword, navigation: { redirect, authenticatedDestination } } = useAuthenticationIntegration();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [successEmail, setSuccessEmail] = useState<string | null>(null);
  const loginModal = useLoginModal();
  const { user } = useAuth();
  if (user) {
    redirect(authenticatedDestination);
  }
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await resetPassword(oobCode, password);
      if (!result.success) {
        setError(
          result.retryAfter !== undefined
            ? authenticationRetryMessage(result.retryAfter)
            : result.error === "INVALID_OOB_CODE"
              ? "Código inválido ou expirado."
              : "Não foi possível redefinir a senha. Tente novamente.",
        );
        return;
      }
      setPassword("");
      setSuccessEmail(result.email || null);
    }
    catch {
      setError("Não foi possível redefinir a senha. Tente novamente.");
    }
    finally {
      setLoading(false);
    }
  };

  if (successEmail)
    return (
      <div
        role="status"
        className="w-full max-w-md text-sm text-success"
      >
        <p>
          Senha redefinida com sucesso para
          {successEmail}
          !
        </p>
        <p>Você já pode entrar com sua nova senha.</p>
        <Button onClick={() => loginModal.openLoginModal()}>Entrar</Button>
      </div>
    );

  return (
    <form
      method="post"
      onSubmit={handleSubmit}
      aria-busy={loading}
      className="w-full max-w-md space-y-4 py-4"
    >
      <div className="space-y-2">
        <Label htmlFor="new-password">Nova Senha</Label>
        <div className="relative">
          <Input
            id="new-password"
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

      {error && (
        <div
          role="alert"
          className="text-sm text-destructive"
        >
          {error}
          {error === "Código inválido ou expirado." && (
            <Link
              href="/minha-conta/recuperar-senha"
              className="block underline"
            >
              Solicitar um novo link de recuperação
            </Link>
          )}
        </div>
      )}

      <div className="pt-2">
        <Button type="submit" disabled={loading}>
          {loading ? "Redefinindo senha..." : "Redefinir senha"}
        </Button>
      </div>
    </form>
  );
}
