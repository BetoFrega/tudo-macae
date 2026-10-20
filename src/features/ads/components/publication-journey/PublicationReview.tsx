import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { usePublicationJourney } from "../../hooks/usePublicationJourney";

type Journey = ReturnType<typeof usePublicationJourney>;

function ReviewPhotos({ images }: { images: Journey["values"]["images"] }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">Fotos a publicar</dt>
      <dd>
        {images?.length ?? 0}
        {" "}
        de 3
      </dd>
      {!!images?.length && <dd className="text-sm">{images.map((image, index) => image?.title || `Foto ${index + 1}`).join(" · ")}</dd>}
    </div>
  );
}

function EmailVerificationNotice({ publicationId }: { publicationId: string | undefined }) {
  return (
    <div className="space-y-3" role="status">
      <p>Confirme seu e-mail antes de publicar. Seu anúncio está salvo.</p>
      <Button asChild variant="outline"><Link href={`/minha-conta/verificar-email?publication=${publicationId ?? ""}`}>Verificar e-mail</Link></Button>
    </div>
  );
}

export function PublicationReview({ journey }: { journey: Journey }) {
  const { busy, profile, values } = journey;
  const emailUnverified = !!journey.user && !journey.user.emailVerified;
  return (
    <>
      <p role="status" className="font-medium">Perfil pronto. Agora publique seu anúncio.</p>
      <dl className="space-y-4 wrap-break-word">
        <div>
          <dt className="text-sm text-muted-foreground">Anúncio</dt>
          <dd className="font-semibold">
            {values.title}
          </dd>
          <dd className="text-sm whitespace-pre-wrap">{values.text}</dd>
        </div>
        <ReviewPhotos images={values.images} />
        <div>
          <dt className="text-sm text-muted-foreground">Quem anuncia</dt>
          <dd>{profile?.title}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Contatos</dt>
          <dd>{profile?.contacts?.map(c => `${c.number}${c.isWhatsapp ? " (WhatsApp)" : ""}`).join(" · ")}</dd>
        </div>
      </dl>
      {emailUnverified && <EmailVerificationNotice publicationId={journey.publicationId.current} />}
      <Button type="button" disabled={emailUnverified} onClick={() => void journey.publish()}>{busy ? "Publicando..." : journey.locked ? "Concluir publicação" : "Publicar anúncio"}</Button>
    </>
  );
}
