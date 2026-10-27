"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hasPublishableProfile, personalProfileExistsMessage } from "@tudomacae/ads/client";
import type { AdvertiserIdentityType } from "@tudomacae/advertiser-identity/model";
import { IdentityTypeChoiceField, useIdentityTypeChoice } from "@tudomacae/advertiser-identity/ui";
import { getUserAdvertiserProfiles } from "@/features/advertiser-profile/actions/getUserAdvertiserProfiles";
import { notifyAccountReminderChanged } from "@/features/authentication/accountReminderEvents";
import { savePublicationProfile } from "../../actions/publication";
import type { usePublicationJourney } from "../../hooks/usePublicationJourney";

type Journey = ReturnType<typeof usePublicationJourney>;

function initialContacts(profile: Journey["profile"]) {
  return profile?.contacts?.length ? profile.contacts : [{ number: "", isWhatsapp: true }];
}

function ProfileSummary({ journey, onEdit }: { journey: Journey; onEdit: () => void }) {
  return (
    <>
      <p>{journey.profile?.title}</p>
      <p className="text-sm">{journey.profile?.contacts?.map(c => c.number).join(" · ")}</p>
      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={() => journey.goTo("publication")}>Continuar</Button>
        <Button type="button" variant="outline" onClick={onEdit}>
          Editar perfil
        </Button>
      </div>
    </>
  );
}

/** The ad's subcategory, offered as an Área de atuação while the profile lacks it and still has room for one. */
function suggestedActivityArea(journey: Journey) {
  const subcategory = journey.activeSubcategories.find(candidate => candidate.id === journey.values.subcategoryId);
  const areas = journey.profile?.activityAreas ?? [];
  if (!subcategory || areas.length >= 3 || areas.some(area => area.subcategoryId === subcategory.id && area.categoryId === journey.values.categoryId)) return null;
  return subcategory;
}

function useActivityAreaSuggestion(journey: Journey) {
  const area = suggestedActivityArea(journey);
  const [checked, setChecked] = useState(true);
  return { area, checked, setChecked, field: area && checked ? { declareActivityArea: true } : {} };
}

function ActivityAreaSuggestion({ suggestion }: { suggestion: ReturnType<typeof useActivityAreaSuggestion> }) {
  if (!suggestion.area) return null;
  return (
    <div className="space-y-1">
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" checked={suggestion.checked} onChange={e => suggestion.setChecked(e.target.checked)} aria-describedby="publication-activity-area-hint" />
        {`Incluir ${suggestion.area.name} nas áreas de atuação do perfil`}
      </label>
      <p
        id="publication-activity-area-hint"
        className="text-sm text-muted-foreground"
      >
        Com uma área de atuação, o perfil aparece no catálogo de negócios do Tudo Macaé.
      </p>
    </div>
  );
}

function identityTypeField(value: AdvertiserIdentityType | null) {
  return value ? { identityType: value } : {};
}

/** `identityTypes` is true only where the composition guarantees one personal profile per account. */
export function PublicationProfile({ journey, identityTypes }: { journey: Journey; identityTypes: boolean }) {
  const profile = journey.profile;
  const [editing, setEditing] = useState(!profile || !hasPublishableProfile(profile));
  const [title, setTitle] = useState(profile?.title ?? "");
  const [contacts, setContacts] = useState(() => initialContacts(profile));
  const activityArea = useActivityAreaSuggestion(journey);
  const identityType = useIdentityTypeChoice({ enabled: identityTypes && !profile, personalAvailable: !journey.profiles.some(candidate => candidate.identityType === "personal") });
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!identityType.confirm()) return;
    const isCurrent = journey.captureCurrentPublication();
    await journey.run(async () => {
      await journey.persist();
      if (!isCurrent()) return;
      const result = await savePublicationProfile({ publicationId: journey.publicationId.current!, ...(profile ? { profileId: profile.id } : {}), ...identityTypeField(identityType.value), ...activityArea.field, title, contacts: contacts.map(c => ({ ...c, number: c.number.replace(/\D/g, "") })) });
      if (!isCurrent()) return;
      if (!result.success) {
        journey.setError(result.error);
        if (result.error === personalProfileExistsMessage) identityType.personalTaken();
        return;
      }
      notifyAccountReminderChanged();
      const profiles = await getUserAdvertiserProfiles();
      if (!isCurrent()) return;
      journey.setProfiles(profiles);
      journey.form.setValue("advertiserProfileId", result.profileId);
      setEditing(false);
      journey.setProfileEditing(false);
      journey.goTo("publication");
    });
  };
  if (!editing) {
    return (
      <ProfileSummary
        journey={journey}
        onEdit={() => {
          setEditing(true);
          journey.setProfileEditing(true);
        }}
      />
    );
  }
  return (
    <form onSubmit={save} className="space-y-5">
      {profile && <p className="text-sm text-muted-foreground">As alterações no perfil também aparecerão nos outros anúncios que usam este perfil.</p>}
      <IdentityTypeChoiceField choice={identityType} />
      <div className="space-y-2">
        <Label htmlFor="publication-profile-title">Nome do anunciante</Label>
        <Input id="publication-profile-title" value={title} onChange={e => setTitle(e.target.value)} required />
      </div>
      {contacts.map((contact, index) => (
        <div key={index} className="space-y-2">
          <Label htmlFor={`publication-contact-${index}`}>
            {`Telefone ${index + 1}`}
          </Label>
          <Input id={`publication-contact-${index}`} type="tel" autoComplete="tel-national" value={contact.number} onChange={e => setContacts(contacts.map((c, i) => i === index ? { ...c, number: e.target.value } : c))} required />
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={contact.isWhatsapp} onChange={e => setContacts(contacts.map((c, i) => i === index ? { ...c, isWhatsapp: e.target.checked } : c))} />
            Este número tem WhatsApp
          </label>
          {contacts.length > 1 && (
            <Button type="button" variant="ghost" onClick={() => setContacts(contacts.filter((_, i) => i !== index))}>
              {`Remover telefone ${index + 1}`}
            </Button>
          )}
        </div>
      ))}
      {contacts.length < 3 && <Button type="button" variant="outline" onClick={() => setContacts([...contacts, { number: "", isWhatsapp: false }])}>Adicionar telefone</Button>}
      <ActivityAreaSuggestion suggestion={activityArea} />
      <div><Button type="submit">{journey.busy ? "Salvando..." : profile ? "Salvar perfil" : "Criar perfil"}</Button></div>
    </form>
  );
}
