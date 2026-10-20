"use client";

import { useRef, useState, useEffect, useLayoutEffect, type BaseSyntheticEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/features/authentication/AuthContext";
import { useLoginModal } from "@/features/authentication/LoginModalContext";
import { getUserAdvertiserProfiles } from "@/features/advertiser-profile/actions/getUserAdvertiserProfiles";
import { notifyAccountReminderChanged } from "@/features/authentication/accountReminderEvents";
import { hasPublishableProfile, publicationReviewSnapshot, type PendingAdPublication } from "@tudomacae/ads/client";
import { savePendingPublication, publishPendingPublication } from "../actions/publication";
import { savePendingPhotos } from "../client/savePendingPhotos";
import { useAdFormContext } from "../contexts/AdFormContext";
import { adFormSchema, type AdFormSchema } from "../schemas/adFormSchema";
import { focusJourneyTarget } from "./publication-journey/focusJourneyTarget";
import {
  attachSavedPhotos, hasPhotoChanges, initialJourneyState, photoSaveFailure, photoSubmissionPayload, publicationMetadata, recoveredFormImages, savedPhotoSnapshot,
} from "./publication-journey/publicationSnapshots";
import { syncPublicationRecovery } from "./publication-journey/syncPublicationRecovery";

type RejectedPublication = Extract<Awaited<ReturnType<typeof publishPendingPublication>>, { success: false }>;

export function usePublicationJourney(initial?: PendingAdPublication) {
  const context = useAdFormContext();
  const { user, loading: authLoading } = useAuth();
  const userId = user?.uid;
  const currentUserId = useRef(userId);
  const ownershipEpoch = useRef(0);
  useLayoutEffect(() => {
    if (currentUserId.current && currentUserId.current !== userId) ownershipEpoch.current++;
    currentUserId.current = userId;
  }, [userId]);
  const recoveryId = useSearchParams().get("publication");
  const { openLoginModal } = useLoginModal();
  const [profiles, setProfiles] = useState(context.profiles);
  const start = initialJourneyState(initial, profiles, userId);
  const [step, setStep] = useState(start.step);
  const [locked, setLocked] = useState(start.locked);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [recoveryUnavailable, setRecoveryUnavailable] = useState(false);
  const [error, setErrorState] = useState("");
  const [photoUnavailableError, setPhotoUnavailableError] = useState("");
  const photoUnavailable = error !== "" && error === photoUnavailableError;
  const setError = (message: string) => {
    setErrorState(message);
    if (message) focusJourneyTarget("publication-error");
  };
  const [saved, setSaved] = useState(start.saved);
  const [savedPhotoCount, setSavedPhotoCount] = useState(start.savedPhotos.length);
  const [published, setPublished] = useState<{ adId: string; slug: string }>();
  useEffect(() => {
    if (published) focusJourneyTarget("publication-success");
  }, [published]);
  const publicationId = useRef(start.publicationId);
  const publicationOwner = useRef(start.ownerId);
  const recoveryReady = useRef(true);
  const recoveryTarget = useRef(recoveryId);
  const recoveryEpoch = useRef(0);
  const savedMetadata = useRef(start.savedMetadata);
  const [savedPhotos, setSavedPhotos] = useState(start.savedPhotos);
  const lock = useRef(false);
  const photoSubmission = useRef<{ key: string; operationId: string } | null>(null);
  const confirmedPhotoSelection = useRef<string | null>(null);
  const form = useForm<AdFormSchema>({
    resolver: zodResolver(adFormSchema) as Resolver<AdFormSchema>,
    defaultValues: start.values,
  });
  const values = useWatch({ control: form.control });
  const photoChangesPending = hasPhotoChanges(values.images, savedPhotos);
  const profile = profiles.find(p => p.id === values.advertiserProfileId);
  const profileEditing = editingProfileId === (profile?.id ?? "new");
  const setProfileEditing = (editing: boolean) => setEditingProfileId(editing ? (profile?.id ?? "new") : null);
  const activeCategories = context.categories.filter(c => c.isActive);
  const activeSubcategories = activeCategories.find(c => c.id === values.categoryId)?.subcategories.filter(s => s.isActive) ?? [];
  useEffect(() => {
    const category = context.categories.find(c => c.id === values.categoryId);
    if (category && !category.subcategories.some(s => s.isActive && s.id === form.getValues("subcategoryId"))) {
      form.setValue("subcategoryId", "");
    }
  }, [context.categories, values.categoryId, form]);
  const goTo = (next: string) => {
    setStep(next);
    focusJourneyTarget(`publication-${next}`);
  };
  function captureCurrentPublication() {
    const epoch = recoveryEpoch.current;
    const ownerEpoch = ownershipEpoch.current;
    const id = publicationId.current;
    const ownerId = currentUserId.current;
    const ready = recoveryReady.current;
    return () => ready && recoveryReady.current
      && epoch === recoveryEpoch.current && ownerEpoch === ownershipEpoch.current
      && (!id || id === publicationId.current) && (!ownerId || ownerId === currentUserId.current);
  }
  function recoveryPending() {
    return !recoveryReady.current || recoveryUnavailable || recovering
      || (!!recoveryId && (recoveryId !== publicationId.current || currentUserId.current !== publicationOwner.current));
  }
  async function run(action: () => Promise<void>) {
    if (lock.current || recoveryPending()) return;
    lock.current = true;
    const isCurrent = captureCurrentPublication();
    setBusy(true);
    setError("");
    try {
      await action();
    }
    catch (error) {
      if (isCurrent()) setError(error instanceof Error ? error.message : "Não foi possível concluir esta etapa. Seus dados continuam aqui. Tente novamente.");
    }
    finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function consumePublication(publication: PendingAdPublication | null | undefined, recoverImages = false) {
    if (!publication || (!publication.published && !recoverImages)) return;
    setLocked(!!publication.published);
    const images = recoverImages ? recoveredFormImages(publication) : form.getValues("images");
    form.reset({ ...form.getValues(), title: publication.title, text: publication.text, categoryId: publication.categoryId, subcategoryId: publication.subcategoryId, advertiserProfileId: publication.advertiserProfileId ?? "", images });
    savedMetadata.current = publicationMetadata(publication);
    if (recoverImages) {
      setSavedPhotos(savedPhotoSnapshot(publication.images));
      setSavedPhotoCount(images.length);
    }
  }
  useEffect(() => syncPublicationRecovery({
    recoveryId, authLoading, userId, form, currentUserId, publicationId, publicationOwner, recoveryReady, recoveryTarget, recoveryEpoch, savedMetadata,
    setProfiles, setStep, setLocked, setEditingProfileId, setRecovering, setRecoveryUnavailable, setErrorState, setSaved, setSavedPhotoCount, setPublished, setSavedPhotos,
  }), [authLoading, form, recoveryId, userId]);
  async function persist() {
    if (recoveryPending()) throw new Error("Aguarde a recuperação da publicação. Se ela falhou, recarregue a página para tentar novamente.");
    const ownerId = currentUserId.current;
    publicationOwner.current = ownerId;
    publicationId.current ??= crypto.randomUUID().replaceAll("-", "");
    const id = publicationId.current;
    const epoch = recoveryEpoch.current;
    const assertCurrentSave = () => {
      if (epoch !== recoveryEpoch.current || id !== publicationId.current || ownerId !== currentUserId.current) throw new Error("A publicação em edição mudou. Aguarde a retomada antes de salvar.");
    };
    const data = form.getValues();
    await persistMetadata(id, data, assertCurrentSave);
    const images = data.images.map(image => ({ ...image, id: image.id ?? crypto.randomUUID() }));
    form.setValue("images", images);
    const photoSnapshot = images.map((image, order) => ({ id: image.id, title: image.title, description: image.description, order }));
    const photoMetadata = JSON.stringify(photoSnapshot);
    const selection = JSON.stringify([ownerId, id, photoSnapshot]);
    if (images.some(image => image.file) || photoMetadata !== JSON.stringify(savedPhotos) || photoSubmission.current || confirmedPhotoSelection.current !== selection) {
      const key = JSON.stringify([ownerId, id, photoSnapshot, savedPhotos]);
      await persistPhotos({ id, key, images, photoSnapshot, photoMetadata, assertCurrentSave });
      confirmedPhotoSelection.current = selection;
    }
    setSaved(true);
    notifyAccountReminderChanged();
    return photoSnapshot;
  }
  async function persistMetadata(id: string, data: AdFormSchema, assertCurrentSave: () => void) {
    const metadata = publicationMetadata(data);
    if (metadata === savedMetadata.current) return;
    const result = await savePendingPublication({ id, title: data.title, text: data.text, categoryId: data.categoryId, subcategoryId: data.subcategoryId, ...(data.advertiserProfileId ? { advertiserProfileId: data.advertiserProfileId } : {}) });
    assertCurrentSave();
    if (!result.success) throw new Error(result.error);
    consumePublication(result.publication);
    savedMetadata.current = metadata;
    window.history.replaceState(null, "", `/publicar?publication=${id}`);
  }
  async function persistPhotos({ id, key, images, photoSnapshot, photoMetadata, assertCurrentSave }: {
    id: string; key: string; images: AdFormSchema["images"]; photoSnapshot: typeof savedPhotos; photoMetadata: string; assertCurrentSave: () => void;
  }) {
    if (photoSubmission.current?.key !== key) photoSubmission.current = { key, operationId: crypto.randomUUID() };
    const response = await savePendingPhotos(id, photoSubmissionPayload(photoSubmission.current.operationId, images, photoMetadata, savedPhotos));
    assertCurrentSave();
    if (!response.success) throw new Error(photoSaveFailure(images.length, response.error));
    await attachSavedPhotos(images, response.images, assertCurrentSave);
    form.setValue("images", images);
    setSavedPhotos(photoSnapshot);
    setSavedPhotoCount(response.images.length);
    photoSubmission.current = null;
  }
  async function continueAuthenticated() {
    await run(async () => {
      const isCurrent = captureCurrentPublication();
      const refreshed = await getUserAdvertiserProfiles();
      if (!isCurrent()) return;
      setProfiles(refreshed);
      const selected = refreshed.find(p => p.id === form.getValues("advertiserProfileId")) ?? refreshed[0];
      form.setValue("advertiserProfileId", selected?.id ?? "");
      await persist();
      if (!isCurrent()) return;
      goTo(selected && hasPublishableProfile(selected) ? "publication" : "profile");
    });
  }
  const continueAd = (event?: BaseSyntheticEvent) => form.handleSubmit(async () => {
    if (!user) {
      goTo("auth");
      const isCurrent = captureCurrentPublication();
      openLoginModal(() => {
        if (isCurrent()) void continueAuthenticated();
      }, () => {
        if (isCurrent()) setError("Entre ou crie sua conta para continuar. O anúncio continua preenchido nesta página.");
      });
    }
    else await continueAuthenticated();
  })(event);
  function profileStepPending() {
    return !locked && (profileEditing || !profile || !hasPublishableProfile(profile));
  }
  async function publish() {
    await run(async () => {
      const isCurrent = captureCurrentPublication();
      const valid = locked || await form.trigger();
      if (!isCurrent()) return;
      if (!valid) {
        goTo("ad");
        return;
      }
      if (profileStepPending()) {
        goTo("profile");
        return;
      }
      const photos = locked ? savedPhotos : await persist();
      if (!isCurrent()) return;
      const data = form.getValues();
      const result = await publishPendingPublication(publicationId.current!, publicationReviewSnapshot({ ...data, images: photos }, profile));
      if (!isCurrent()) return;
      if (!result.success) {
        await reportRejectedPublication(result, isCurrent);
        return;
      }
      setPublished({ adId: result.adId, slug: result.slug });
      setStep("success");
      notifyAccountReminderChanged();
    });
  }
  async function reportRejectedPublication(result: RejectedPublication, isCurrent: () => boolean) {
    if ("publication" in result) consumePublication(result.publication, true);
    const profileChanged = result.error.startsWith("O perfil foi alterado em outra aba");
    if (profileChanged || result.error.startsWith("Complete o nome e um contato")) {
      try {
        const refreshed = await getUserAdvertiserProfiles();
        if (!isCurrent()) return;
        setProfiles(refreshed);
        goTo(profileChanged ? "publication" : "profile");
      }
      catch {
        if (!isCurrent()) return;
        setError("Não foi possível carregar os dados atuais de quem anuncia. Recarregue esta página e confira o perfil antes de publicar. Seu anúncio continua salvo.");
        return;
      }
    }
    setPhotoUnavailableError(result.photoUnavailable ? result.error : "");
    setError(result.error);
  }
  return { user, locked, profileEditing, setProfileEditing, form, values, profiles, setProfiles, profile, step, goTo, captureCurrentPublication, busy, recovering, recoveryUnavailable, error, setError, photoUnavailable, saved, savedPhotoCount, savedPhotos, photoChangesPending, published, publicationId, activeCategories, activeSubcategories, continueAd, publish, run, persist };
}
