"use client";

import { EmailVerificationAction as SharedEmailVerificationAction } from "@tudomacae/authentication/ui";

export function EmailVerificationAction({ code, publication, ad }: { code: string; publication?: string; ad?: string }) {
  const params = new URLSearchParams();
  if (publication) params.set("publication", publication);
  if (ad) params.set("ad", ad);
  const continuation = {
    href: `/minha-conta/verificar-email${params.size ? `?${params}` : ""}`,
    label: publication ? "Continuar publicação" : ad ? "Voltar ao anúncio" : "Ir para minha conta",
  };
  return <SharedEmailVerificationAction code={code} continuation={continuation} confirmationMessage="Seu anúncio continua como você deixou. A publicação só acontece quando você decidir publicar." />;
}
