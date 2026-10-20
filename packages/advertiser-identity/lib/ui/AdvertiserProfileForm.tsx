"use client";
import type { BusinessCreationSurface } from "../../businessCreation";
import { useIdentityIntegrations, useProfileCommands } from "./context";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Card, CardContent, CardHeader, CardTitle } from "@tudomacae/react-primitives/card";
import { Form } from "@tudomacae/react-primitives/form";

import type { ActivityArea } from "../../model";
import { hasUnavailableActivityAreas, type ActivityAreaCategory } from "./ActivityAreaSelector";
import { AdvertiserProfileFormAlerts, type ProfileOperationError } from "./AdvertiserProfileFormAlerts";
import { AdvertiserProfilePhotoPicker } from "./AdvertiserProfilePhotoPicker";
import { AdvertiserProfileSharedFields } from "./AdvertiserProfileSharedFields";
import { AdvertiserProfileSubmitButton } from "./AdvertiserProfileSubmitButton";
import {
  invalidFieldLabels,
  profileDefaultValues,
  profileFormData,
  profileFormSchema,
  profileFormTitle,
  identityTypeCreationChoice, type IdentityTypes,
  submittedContacts,
  type FormValues,
} from "./advertiserProfileFormValues";
import { useProfilePhoto } from "./useProfilePhoto";
import { IdentityTypeChoiceField, useIdentityTypeChoice } from "./IdentityTypeField";
import { IdentityTypeClassification } from "./IdentityTypeClassification";

interface AdvertiserProfileFormProps {
  initialData?: {
    title: string;
    description?: string;
    photoURL?: string;
    contacts?: { number: string; isWhatsapp: boolean }[];
    activityAreas?: ActivityArea[];
    revision?: number;
  };
  profileId?: string;
  returnTo?: string;
  creationSource?: "catalog";
  entrySurface?: BusinessCreationSurface;
  categories: ActivityAreaCategory[];
  /** Present only where the composition guarantees one personal profile per account. */
  identityTypes?: IdentityTypes;
}

export default function AdvertiserProfileForm({
  initialData,
  profileId,
  returnTo,
  creationSource,
  entrySurface = "catalog",
  categories,
  identityTypes,
}: AdvertiserProfileFormProps) {
  const [loading, setLoading] = useState(false);
  const [pendingAreaSelection, setPendingAreaSelection] = useState(false);
  const [pendingAreaSelectionError, setPendingAreaSelectionError] = useState(false);
  const [operationError, setOperationError] = useState<ProfileOperationError | null>(null);
  const [conflictRevision, setConflictRevision] = useState<number | null>(null);
  const [alreadyCreatedProfileId, setAlreadyCreatedProfileId] = useState<string | null>(null);
  const [invalidFields, setInvalidFields] = useState<string[]>([]);
  const identityType = useIdentityTypeChoice(identityTypeCreationChoice(identityTypes, profileId, creationSource));
  const operationErrorRef = useRef<HTMLDivElement>(null);
  const creationOperationId = useRef(crypto.randomUUID());
  const {
    fileInputRef,
    handlePhotoChange,
    hasPendingPhotoUpload,
    photoFile,
    photoPreview,
    removePhoto,
    retryPhotoUpload,
    setPhotoFile,
    setPhotoPreview,
    uploadingPhoto,
    uploadError,
    uploadPhoto,
  } = useProfilePhoto(initialData?.photoURL);
  const { capture } = useIdentityIntegrations();
  const commands = useProfileCommands();
  const router = commands.navigation;
  const startTracked = useRef(false);
  const createdProfileId = useRef<string | null>(null);

  useEffect(() => {
    if (profileId || creationSource !== "catalog" || startTracked.current) return;
    startTracked.current = true;
    capture("business_creation_form_started", {
      source_surface: entrySurface,
      cta_variant: "create_business",
    });
  }, [capture, creationSource, entrySurface, profileId]);

  useEffect(() => {
    if (operationError) operationErrorRef.current?.focus();
  }, [operationError]);

  const form = useForm<FormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: profileDefaultValues(initialData, profileId),
  });

  const activityAreas = useWatch({
    control: form.control,
    name: "activityAreas",
  });

  const finishSuccessfulSubmission = () => {
    router.push(
      returnTo?.match(/^\/anuncio\/[a-zA-Z0-9_-]+\/editar$/)
        ? returnTo
        : creationSource === "catalog" && !profileId && createdProfileId.current
          ? `/minha-conta/perfis/${createdProfileId.current}/concluido`
          : "/minha-conta/perfis",
    );
    setPhotoFile(null);
    setPhotoPreview(null);
    if (!profileId) form.reset();
  };

  function blockPendingAreaSelection() {
    if (hasPendingPhotoUpload || !pendingAreaSelection) return false;
    setPendingAreaSelectionError(true);
    document.getElementById("activity-area-add")?.focus();
    return true;
  }

  function creationIdentityType() {
    if (!identityTypes) return {};
    return { identityType: creationSource === "catalog" ? "business" as const : identityType.value! };
  }

  function submissionTarget() {
    if (!profileId) return { operationId: creationOperationId.current, ...creationIdentityType() };
    return { expectedRevision: conflictRevision ?? initialData?.revision ?? 1 };
  }

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (blockPendingAreaSelection()) return;
    if (await retryPhotoUpload(finishSuccessfulSubmission)) return;
    if (!identityType.confirm()) return;
    const isValid = await form.trigger(undefined, { shouldFocus: true });
    if (!isValid) {
      const labels = invalidFieldLabels(form.getValues(), creationSource);
      if (labels) setInvalidFields(labels);
      return;
    }
    setInvalidFields([]);
    setOperationError(null);

    setLoading(true);
    const values = form.getValues();
    const contacts = submittedContacts(values.contacts);
    const formData = profileFormData(values, contacts, submissionTarget());

    try {
      await persist(formData, contacts.length);
    }
    catch (error) {
      console.error("Error submitting form:", error);
      setOperationError("technical");
    }
    finally {
      setLoading(false);
    }
  }

  async function saveProfile(formData: FormData) {
    if (profileId) {
      const result = await commands.updateAdvertiserProfile(profileId, formData);
      if (result.success) return { profileId, revision: result.revision };
      if (result.outcome === "conflict") setConflictRevision(result.currentRevision);
      setOperationError(result.outcome);
      return null;
    }
    const created = await commands.createAdvertiserProfile(formData);
    if (!created.success) {
      if (created.outcome === "personal_exists") identityType.personalTaken();
      if (created.outcome === "already_created") setAlreadyCreatedProfileId(created.profileId);
      setOperationError(created.outcome);
      return null;
    }
    createdProfileId.current = created.profileId;
    return { profileId: created.profileId, revision: created.revision };
  }

  function catalogCreationProperties() {
    if (profileId || creationSource !== "catalog") return {};
    return { source_surface: entrySurface, cta_variant: "create_business" };
  }

  async function persist(formData: FormData, contactCount: number) {
    const saved = await saveProfile(formData);
    if (!saved) return;
    let photoUploadFailed = false;
    if (photoFile && saved.profileId) {
      photoUploadFailed = !await uploadPhoto({ profileId: saved.profileId, revision: saved.revision });
    }

    commands.notifyAccountReminderChanged();
    capture(
      profileId
        ? "advertiser_profile_updated"
        : "advertiser_profile_created",
      {
        contact_count: contactCount,
        has_new_photo: Boolean(photoFile),
        ...catalogCreationProperties(),
      },
    );
    if (photoUploadFailed) return;
    finishSuccessfulSubmission();
  }

  const isEditing = !!profileId;
  const hasUnavailableActivityAreasSelected = hasUnavailableActivityAreas(
    activityAreas,
    categories,
  );

  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <CardTitle className="text-2xl font-bold">
          {profileFormTitle(isEditing, creationSource)}
        </CardTitle>
        {creationSource === "catalog" && !isEditing && (
          <p className="mt-2 text-sm/6 text-muted-foreground">
            Você pode começar agora. Para aparecer no catálogo, adicione um contato e uma área de atuação.
          </p>
        )}
      </CardHeader>
      <CardContent>
        <IdentityTypeClassification profileId={profileId} identityTypes={identityTypes} />
        <Form {...form}>
          <form
            onSubmit={handleFormSubmit}
            onChangeCapture={() => setInvalidFields([])}
            className="space-y-6"
          >
            <AdvertiserProfileFormAlerts
              invalidFields={invalidFields}
              operationError={operationError}
              operationErrorRef={operationErrorRef}
              profileId={profileId}
              alreadyCreatedProfileId={alreadyCreatedProfileId}
            />
            <AdvertiserProfilePhotoPicker
              alt={creationSource === "catalog" ? "Foto do negócio" : "Foto do perfil"}
              loading={loading}
              fileInputRef={fileInputRef}
              handlePhotoChange={handlePhotoChange}
              photoFile={photoFile}
              photoPreview={photoPreview}
              removePhoto={removePhoto}
              uploadingPhoto={uploadingPhoto}
              uploadError={uploadError}
            />

            {hasPendingPhotoUpload && (
              <p className="text-sm text-muted-foreground">Os dados do perfil já foram salvos. Conclua o envio da foto para voltar à edição.</p>
            )}
            <fieldset className="space-y-6" disabled={hasPendingPhotoUpload}>
              <IdentityTypeChoiceField choice={identityType} />
              <AdvertiserProfileSharedFields
                categories={categories}
                autofillOwnerPhone
                onProgrammaticChange={() => setInvalidFields([])}
                onPendingAreaSelectionChange={(pending) => {
                  setPendingAreaSelection(pending);
                  setPendingAreaSelectionError(false);
                }}
                pendingAreaSelectionError={pendingAreaSelectionError}
                {...(creationSource === "catalog" ? { terminology: "business" as const } : {})}
              />
            </fieldset>
            <AdvertiserProfileSubmitButton
              loading={loading}
              uploadingPhoto={uploadingPhoto}
              hasPendingPhotoUpload={hasPendingPhotoUpload}
              hasPhotoFile={Boolean(photoFile)}
              hasUnavailableActivityAreasSelected={hasUnavailableActivityAreasSelected}
              operationError={operationError}
              isEditing={isEditing}
              creationSource={creationSource}
            />
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
