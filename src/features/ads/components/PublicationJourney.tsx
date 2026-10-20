"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLoginModal } from "@/features/authentication/LoginModalContext";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { hasPublishableProfile, type PendingAdPublication } from "@tudomacae/ads/client";
import { usePublicationJourney } from "../hooks/usePublicationJourney";
import { AdFormProfileSelect } from "./form/AdFormProfileSelect";
import { JourneyBlock } from "./publication-journey/JourneyBlock";
import { PublicationAdStep } from "./publication-journey/PublicationAdStep";
import { PublicationProfile } from "./publication-journey/PublicationProfile";
import { PublicationReview } from "./publication-journey/PublicationReview";
import { PublicationSuccess } from "./publication-journey/PublicationSuccess";

type Journey = ReturnType<typeof usePublicationJourney>;

export default function PublicationJourney({ initial, identityTypes = false }: { initial?: PendingAdPublication | undefined; identityTypes?: boolean }) {
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  const [photoProcessingMessage, setPhotoProcessingMessage] = useState("");
  const processingFocus = useRef<HTMLElement | null>(null);
  const continueButton = useRef<HTMLButtonElement | null>(null);
  function handlePhotoProcessing(processing: boolean) {
    if (processing) processingFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setIsProcessingPhoto(processing);
    setPhotoProcessingMessage(processing
      ? "Processando foto. Aguarde para continuar."
      : "Processamento encerrado. Confira as fotos antes de continuar.");
  }
  useLayoutEffect(() => {
    if (isProcessingPhoto || !processingFocus.current) return;
    const target = processingFocus.current.isConnected ? processingFocus.current : continueButton.current;
    if (document.activeElement === document.body) target?.focus({ preventScroll: true });
    processingFocus.current = null;
  }, [isProcessingPhoto]);
  const journey = usePublicationJourney(initial);
  const { form, busy, values } = journey;
  return (
    <div className="
      mx-auto max-w-3xl overflow-hidden rounded-xl border bg-background
    "
    >
      <header className="
        space-y-3 border-b p-5
        sm:p-8
      "
      >
        <h1 className="
          text-2xl font-bold tracking-tight
          sm:text-3xl
        "
        >
          Publicar anúncio
        </h1>
        <p className="text-muted-foreground">Preencha seu anúncio, confira quem anuncia e publique. Tudo nesta página.</p>
        <PublicationSaveStatus journey={journey} />
      </header>
      {journey.recovering && (
        <p
          role="status"
          aria-label="Retomada da publicação"
          className="m-5 text-sm"
        >
          Retomando sua publicação. Aguarde para continuar.
        </p>
      )}
      {journey.error && (
        <p
          id="publication-error"
          tabIndex={-1}
          role="alert"
          className="
            m-5 rounded-lg bg-destructive/10 p-4 text-sm text-destructive
          "
        >
          {journey.error}
        </p>
      )}
      {journey.published
        ? (
            <PublicationSuccess published={journey.published} title={values.title} />
          )
        : (
            <Form {...form}>
              <fieldset disabled={busy || journey.recoveryUnavailable || isProcessingPhoto} aria-busy={busy || journey.recovering || isProcessingPhoto}>
                <PublicationAdStep
                  journey={journey}
                  isProcessingPhoto={isProcessingPhoto}
                  photoProcessingMessage={photoProcessingMessage}
                  onPhotoProcessingChange={handlePhotoProcessing}
                  continueButton={continueButton}
                />
                <PublicationAccountStep journey={journey} />
                <PublicationProfileStep journey={journey} identityTypes={identityTypes} />
                <PublicationReviewStep journey={journey} />
              </fieldset>
            </Form>
          )}
    </div>
  );
}

function PublicationSaveStatus({ journey }: { journey: Journey }) {
  if (!journey.saved || journey.published) return null;
  return (
    <p
      role="status"
      aria-label="Salvamento da publicação"
      className="text-sm"
    >
      {saveStatusText(journey)}
    </p>
  );
}

function saveStatusText({ locked, photoUnavailable, photoChangesPending, savedPhotoCount }: Journey) {
  if (locked) return "Suas fotos foram salvas. Conclua a confirmação da publicação.";
  if (photoUnavailable) return "Seu anúncio está salvo e ainda não foi publicado. Revise a foto indisponível antes de continuar.";
  const photos = savedPhotoCount === 1 ? "foto salva" : "fotos salvas";
  if (photoChangesPending) return `Seu anúncio está salvo e ainda não foi publicado. ${savedPhotoCount} ${photos}; as alterações nas fotos ainda não foram salvas. Continue para salvá-las.`;
  return `Seu anúncio está salvo e ainda não foi publicado. ${savedPhotoCount} de ${savedPhotoCount} ${photos}.`;
}

function PublicationAccountStep({ journey }: { journey: Journey }) {
  return (
    <>
      {journey.user && (
        <section className="
          space-y-1 border-b p-5
          sm:p-8
        "
        >
          <h2 className="text-lg font-semibold">Sua identificação</h2>
          <p className="text-sm text-muted-foreground">
            {journey.user.email ?? "Conta conectada"}
          </p>
        </section>
      )}
      {journey.step === "auth" && (
        <JourneyBlock name="auth" title="Sua identificação" summary="Entre para salvar e continuar" open onOpen={journey.goTo}>
          <p className="text-sm text-muted-foreground">Entre ou crie sua conta. Seu anúncio continua preenchido.</p>
          <Button type="button" onClick={journey.continueAd}>Entrar ou criar conta</Button>
        </JourneyBlock>
      )}
    </>
  );
}

// Remounts the profile editor whenever the account, draft or selected profile data changes.
function profileEditorKey({ user, publicationId, profile }: Journey) {
  return `${user?.uid ?? "guest"}:${publicationId.current ?? "new"}:${profile?.id ?? "new"}:${JSON.stringify({ title: profile?.title, contacts: profile?.contacts })}`;
}

function PublicationProfileStep({ journey, identityTypes }: { journey: Journey; identityTypes: boolean }) {
  return (
    <JourneyBlock name="profile" title="Quem anuncia e como entrar em contato" summary={journey.profile?.title || "Complete seu perfil de anunciante"} open={journey.step === "profile"} disabled={!journey.saved || !!journey.locked} onOpen={journey.goTo}>
      <AdFormProfileSelect form={journey.form} profiles={journey.profiles} />
      <PublicationProfile key={profileEditorKey(journey)} journey={journey} identityTypes={identityTypes} />
    </JourneyBlock>
  );
}

function PublicationReviewStep({ journey }: { journey: Journey }) {
  const { locked, saved, profileEditing, profile } = journey;
  return (
    <JourneyBlock name="publication" title="Publicação" summary="Confira e publique seu anúncio" open={journey.step === "publication"} disabled={!locked && (!saved || profileEditing || !profile || !hasPublishableProfile(profile))} onOpen={journey.goTo}>
      <PublicationReview journey={journey} />
    </JourneyBlock>
  );
}

export function PublicationRecoveryLogin() {
  const { openLoginModal } = useLoginModal();
  const router = useRouter();
  return (
    <section className="
      mx-auto max-w-3xl space-y-5 rounded-xl border bg-background p-8
    "
    >
      <h1 className="text-2xl font-bold">Continue a publicação</h1>
      <p>Entre na conta usada para salvar este anúncio.</p>
      <Button onClick={() => openLoginModal(() => router.refresh())}>Entrar ou criar conta</Button>
    </section>
  );
}
