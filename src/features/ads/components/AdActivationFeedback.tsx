import { AlertCircle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { AdActivationIssueDetails } from "../activationRecovery";

interface AdActivationFeedbackProps {
  issue: AdActivationIssueDetails;
  onRetry?: () => void;
  busy?: boolean;
}

export function AdActivationFeedback({ issue, onRetry, busy = false }: AdActivationFeedbackProps) {
  const returnTo = `/anuncio/${issue.adId}/editar`;
  const recoveryHref = issue.reason === "profile"
    ? issue.advertiserProfileId
      ? `/minha-conta/perfis/${issue.advertiserProfileId}/editar?returnTo=${encodeURIComponent(returnTo)}`
      : "/minha-conta/perfis"
    : `/minha-conta/verificar-email?ad=${encodeURIComponent(issue.adId)}`;

  return (
    <div
      role="alert"
      className="
        space-y-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4
        text-sm
      "
    >
      <div className="flex gap-3 font-medium text-destructive">
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p>{issue.error}</p>
      </div>
      {issue.reason === "profile" && (
        <p className="text-muted-foreground">
          Corrija o perfil associado a este anúncio. Salvar o perfil não ativa nenhum anúncio.
        </p>
      )}
      {issue.reason === "email" && (
        <p className="text-muted-foreground">
          Confirmar o e-mail libera uma nova tentativa, mas não ativa o anúncio automaticamente.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {issue.reason !== "technical" && (
          <Button asChild size="sm" variant="outline">
            <Link href={recoveryHref} target="_blank" rel="noreferrer">
              {issue.reason === "profile" ? "Corrigir perfil" : "Verificar e-mail"}
            </Link>
          </Button>
        )}
        {onRetry && (
          <Button size="sm" variant="outline" disabled={busy} onClick={onRetry}>
            {busy ? "Tentando..." : "Tentar novamente"}
          </Button>
        )}
      </div>
    </div>
  );
}
