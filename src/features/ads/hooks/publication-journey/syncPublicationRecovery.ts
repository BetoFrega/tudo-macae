import type { Dispatch, RefObject, SetStateAction } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { AdvertiserProfileData } from "@tudomacae/advertiser-identity/model";
import { hasPublishableProfile } from "@tudomacae/ads/client";
import { readPendingPublication } from "../../client/readPendingPublication";
import type { AdFormSchema } from "../../schemas/adFormSchema";
import { focusJourneyTarget } from "./focusJourneyTarget";

type SavedPhoto = { id: string; title: string; description: string; order: number };

export type PublicationRecoverySync = {
  recoveryId: string | null;
  authLoading: boolean;
  userId: string | undefined;
  form: UseFormReturn<AdFormSchema>;
  currentUserId: RefObject<string | undefined>;
  publicationId: RefObject<string | undefined>;
  publicationOwner: RefObject<string | undefined>;
  recoveryReady: RefObject<boolean>;
  recoveryTarget: RefObject<string | null>;
  recoveryEpoch: RefObject<number>;
  savedMetadata: RefObject<string>;
  setProfiles: Dispatch<SetStateAction<AdvertiserProfileData[]>>;
  setStep: Dispatch<SetStateAction<string>>;
  setLocked: Dispatch<SetStateAction<boolean>>;
  setEditingProfileId: Dispatch<SetStateAction<string | null>>;
  setRecovering: Dispatch<SetStateAction<boolean>>;
  setRecoveryUnavailable: Dispatch<SetStateAction<boolean>>;
  setErrorState: Dispatch<SetStateAction<string>>;
  setSaved: Dispatch<SetStateAction<boolean>>;
  setSavedPhotoCount: Dispatch<SetStateAction<number>>;
  setPublished: Dispatch<SetStateAction<{ adId: string; slug: string } | undefined>>;
  setSavedPhotos: Dispatch<SetStateAction<SavedPhoto[]>>;
};

// Effect body for the `?publication=` recovery target; returns the effect cleanup.
export function syncPublicationRecovery({
  recoveryId, authLoading, userId, form, currentUserId, publicationId, publicationOwner, recoveryReady, recoveryTarget, recoveryEpoch, savedMetadata,
  setProfiles, setStep, setLocked, setEditingProfileId, setRecovering, setRecoveryUnavailable, setErrorState, setSaved, setSavedPhotoCount, setPublished, setSavedPhotos,
}: PublicationRecoverySync): (() => void) | undefined {
  if (!recoveryId) {
    if (!recoveryTarget.current) return;
    let active = true;
    recoveryTarget.current = null;
    recoveryReady.current = false;
    recoveryEpoch.current++;
    void Promise.resolve().then(() => {
      if (!active) return;
      publicationId.current = undefined;
      publicationOwner.current = currentUserId.current;
      savedMetadata.current = "";
      form.reset({ title: "", text: "", categoryId: "", subcategoryId: "", advertiserProfileId: "", images: [] });
      setProfiles([]);
      setSaved(false);
      setSavedPhotos([]);
      setSavedPhotoCount(0);
      setPublished(undefined);
      setLocked(false);
      setEditingProfileId(null);
      setStep("ad");
      setErrorState("");
      setRecovering(false);
      setRecoveryUnavailable(false);
      recoveryReady.current = true;
      focusJourneyTarget("publication-ad");
    });
    return () => {
      active = false;
    };
  }
  recoveryTarget.current = recoveryId;
  if (authLoading || (recoveryReady.current && recoveryId === publicationId.current && userId === publicationOwner.current)) return;
  if (!userId && !publicationOwner.current) return;
  let active = true;
  recoveryReady.current = false;
  recoveryEpoch.current++;
  setRecovering(true);
  setRecoveryUnavailable(true);
  setErrorState("");
  form.reset({ title: "", text: "", categoryId: "", subcategoryId: "", advertiserProfileId: "", images: [] });
  setProfiles([]);
  setSaved(false);
  setSavedPhotos([]);
  setSavedPhotoCount(0);
  setPublished(undefined);
  setLocked(false);
  setEditingProfileId(null);
  setStep("ad");
  void (userId ? readPendingPublication(recoveryId) : Promise.reject(new Error("Entre na sua conta para retomar a publicação.")))
    .then(({ publication, profiles: recoveredProfiles }) => {
      if (!active) return;
      if (!publication) throw new Error("Publicação não encontrada nesta conta.");
      const selected = recoveredProfiles.find(profile => profile.id === publication.advertiserProfileId) ?? recoveredProfiles[0];
      const images = (publication.images ?? []).map(image => ({ ...image, title: image.title ?? "", description: image.description ?? "", url: image.url ?? "" }));
      publicationId.current = publication.id;
      publicationOwner.current = userId;
      setProfiles(recoveredProfiles);
      form.reset({ title: publication.title, text: publication.text, categoryId: publication.categoryId, subcategoryId: publication.subcategoryId, advertiserProfileId: selected?.id ?? "", images });
      savedMetadata.current = JSON.stringify({ title: publication.title, text: publication.text, categoryId: publication.categoryId, subcategoryId: publication.subcategoryId, advertiserProfileId: publication.advertiserProfileId ?? "" });
      setSavedPhotos(images.map(image => ({ id: image.id, title: image.title, description: image.description, order: image.order })));
      setSavedPhotoCount(images.length);
      setLocked(!!publication.published);
      setSaved(true);
      recoveryReady.current = true;
      setRecoveryUnavailable(false);
      const next = publication.published || hasPublishableProfile(selected) ? "publication" : "profile";
      setStep(next);
      focusJourneyTarget(`publication-${next}`);
    })
    .catch((error: unknown) => {
      if (active) setErrorState(error instanceof Error ? error.message : "Não foi possível retomar a publicação. Recarregue a página e tente novamente.");
    })
    .finally(() => {
      if (active) setRecovering(false);
    });
  return () => {
    active = false;
  };
}
