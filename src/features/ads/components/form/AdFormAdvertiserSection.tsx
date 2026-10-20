import { UserRound } from "lucide-react";
import Link from "next/link";
import { useFormState, useWatch, type UseFormReturn } from "react-hook-form";
import { formatPhoneNumber } from "@/lib/formatters";
import type { AdvertiserProfileData } from "@tudomacae/advertiser-identity/model";
import type { AdFormSchema } from "../../schemas/adFormSchema";
import { AdFormProfileSelect } from "./AdFormProfileSelect";
import { AdFormSection } from "./AdFormSection";

interface AdFormAdvertiserSectionProps {
  form: UseFormReturn<AdFormSchema>;
  profiles: AdvertiserProfileData[];
  profileManagementHref?: string | undefined;
  adId?: string | undefined;
  isProcessingPhoto: boolean;
}

export function AdFormAdvertiserSection({ form, profiles, profileManagementHref, adId, isProcessingPhoto }: AdFormAdvertiserSectionProps) {
  const isEditing = !!adId;
  const selectedProfileId = useWatch({ control: form.control, name: "advertiserProfileId" });
  const { isDirty } = useFormState({ control: form.control });
  const selectedProfile = profiles.find(profile => profile.id === selectedProfileId);

  const confirmProfileExit = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!isDirty && !isProcessingPhoto && !form.getValues("images").some(image => Boolean(image.file))) return;
    if (!window.confirm("Há alterações não salvas neste anúncio, incluindo fotos. Salve o anúncio antes de sair. Sair agora e descartar essas alterações?")) event.preventDefault();
  };

  return (
    <AdFormSection
      icon={UserRound}
      title="Quem está anunciando"
      description={isEditing ? "Confira a identidade e o contato que aparecerão no anúncio." : "Escolha o perfil que aparecerá no anúncio."}
    >
      {profiles.length > 1 && <AdFormProfileSelect form={form} profiles={profiles} profileManagementHref={isEditing ? undefined : profileManagementHref} contactSummaryId={isEditing ? "selected-advertiser-contact" : undefined} />}
      {isEditing && (
        <SelectedAdvertiser
          profile={selectedProfile}
          announceSelection={profiles.length > 1}
          editProfileHref={editProfileHref(adId, selectedProfile, profileManagementHref)}
          onEditProfile={confirmProfileExit}
        />
      )}
    </AdFormSection>
  );
}

interface SelectedAdvertiserProps {
  profile: AdvertiserProfileData | undefined;
  announceSelection: boolean;
  editProfileHref: string | null;
  onEditProfile: (event: React.MouseEvent<HTMLAnchorElement>) => void;
}

function SelectedAdvertiser({ profile, announceSelection, editProfileHref, onEditProfile }: SelectedAdvertiserProps) {
  const contactSummary = selectedContactSummary(profile);
  return (
    <div className="space-y-3 rounded-lg border p-4">
      {announceSelection && (
        <p
          id="selected-advertiser-contact"
          role="status"
          className="sr-only"
        >
          {`Anunciante ${profile?.title || "Perfil não encontrado"}. Contato exibido no anúncio: ${contactSummary}.`}
        </p>
      )}
      <dl className="space-y-2 text-sm">
        <div>
          <dt className="font-medium">Anunciante</dt>
          <dd>{profile?.title || "Perfil não encontrado"}</dd>
        </div>
        <div>
          <dt className="font-medium">Contato exibido no anúncio</dt>
          <dd>{contactSummary}</dd>
        </div>
      </dl>
      {editProfileHref && (
        <Link
          className="
            inline-block text-sm font-medium text-primary underline
            underline-offset-4
          "
          href={editProfileHref}
          onClick={onEditProfile}
        >
          Corrigir contato do anunciante
        </Link>
      )}
    </div>
  );
}

function selectedContactSummary(profile: AdvertiserProfileData | undefined) {
  if (!profile?.contacts?.length) return "Nenhum contato cadastrado";
  return profile.contacts.map(contact => `${formatPhoneNumber(contact.number)}${contact.isWhatsapp ? " (WhatsApp)" : ""}`).join(" · ");
}

function editProfileHref(adId: string, profile: AdvertiserProfileData | undefined, profileManagementHref: string | undefined) {
  if (!profile || !profileManagementHref) return null;
  return `${profileManagementHref}/${profile.id}/editar?returnTo=${encodeURIComponent(`/anuncio/${adId}/editar`)}`;
}
