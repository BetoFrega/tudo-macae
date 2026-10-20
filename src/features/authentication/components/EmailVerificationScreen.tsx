"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { EmailVerificationScreen as SharedEmailVerificationScreen, type EmailVerificationContent, type EmailVerificationOperations } from "@tudomacae/authentication/ui";
import { readEmailVerificationFromBrowser } from "../readAccountStatus";
import { correctEmailAddress, sendEmailVerification } from "../actions/emailVerification";

const content: EmailVerificationContent = {
  verifiedMessage: "Seu e-mail está confirmado. Você já pode publicar ou reativar anúncios.",
  unverifiedMessage: "Você pode preparar seu anúncio agora. Para publicá-lo, confirme que tem acesso a este e-mail.",
  defaultDestination: "/minha-conta/anuncios",
  destinationLabel: destination => destination.startsWith("/publicar?") ? "Continuar publicação" : destination.startsWith("/anuncio/") ? "Voltar ao anúncio" : "Ir para minha conta",
};
export function EmailVerificationScreen() {
  const params = useSearchParams();
  const publication = params.get("publication") ?? undefined;
  const ad = params.get("ad") ?? undefined;
  const operations = useMemo<EmailVerificationOperations>(() => ({
    read: () => readEmailVerificationFromBrowser({ publication, ad }),
    send: () => sendEmailVerification({ publication, ad }),
    correct: input => correctEmailAddress(input, { publication, ad }),
  }), [publication, ad]);
  return <SharedEmailVerificationScreen operations={operations} content={content} />;
}
