"use client";
import { useAdminCommands } from "./context";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRef, useState, type ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Button } from "@tudomacae/react-primitives/button";
import { Card, CardContent, CardHeader, CardTitle } from "@tudomacae/react-primitives/card";
import { Form } from "@tudomacae/react-primitives/form";

import {
  hasUnavailableActivityAreas,
  type ActivityAreaCategory,
} from "./ActivityAreaSelector";
import { AdminAdvertiserProfileDuplicates } from "./AdminAdvertiserProfileDuplicates";
import { AdminAdvertiserProfilePhotoField } from "./AdminAdvertiserProfilePhotoField";
import { AdminAdvertiserProfileSourceFields } from "./AdminAdvertiserProfileSourceFields";
import { AdminAdvertiserProfileSubmitButton } from "./AdminAdvertiserProfileSubmitButton";
import {
  editorFormSchema,
  type AdminAdvertiserProfileFormValues,
} from "./adminAdvertiserProfileEditorForm";
import {
  adminProfileDefaultValues,
  adminProfileFormData,
  parseClaimableValues,
  saveAdminProfile,
  type AdminProfileFormMode,
  type AdminProfileInitialData,
} from "./adminAdvertiserProfileSubmission";
import { AdvertiserProfileSharedFields } from "./AdvertiserProfileSharedFields";
import { useProfilePhoto } from "./useProfilePhoto";

type FormValues = AdminAdvertiserProfileFormValues;

interface AdminAdvertiserProfileFormProps {
  initialData: AdminProfileInitialData;
  profileId?: string;
  categories: ActivityAreaCategory[];
  mode?: AdminProfileFormMode;
  renderDeletion?: (disabled: boolean) => ReactNode;
}

const formTitles: Record<AdminProfileFormMode, string> = {
  "create-claimable": "Criar perfil reivindicável",
  "edit": "Editar Perfil de Anunciante",
};

function AdminProfileDeletionControl({
  mode,
  profileId,
  isClaimable,
  disabled,
  renderDeletion,
  onDelete,
}: {
  mode: AdminProfileFormMode;
  profileId: string | undefined;
  isClaimable: boolean;
  disabled: boolean;
  renderDeletion: ((disabled: boolean) => ReactNode) | undefined;
  onDelete: () => void;
}) {
  if (mode !== "edit") return null;
  if (profileId && renderDeletion) return renderDeletion(disabled);
  if (!isClaimable) return null;
  return (
    <Button
      type="button"
      variant="destructive"
      className="w-full"
      disabled={disabled}
      onClick={onDelete}
    >
      Excluir perfil
    </Button>
  );
}

export default function AdminAdvertiserProfileForm({
  initialData,
  profileId,
  categories,
  mode = "edit",
  renderDeletion,
}: AdminAdvertiserProfileFormProps) {
  const isClaimable = mode === "create-claimable" || initialData.claimable === true;
  const [loading, setLoading] = useState(false);
  const [pendingAreaSelection, setPendingAreaSelection] = useState(false);
  const [pendingAreaSelectionError, setPendingAreaSelectionError] = useState(false);
  const {
    fileInputRef,
    handlePhotoChange,
    hasPendingPhotoUpload,
    photoFile,
    photoPreview,
    removePhoto,
    retryPhotoUpload,
    uploadingPhoto,
    uploadError,
    uploadPhoto,
  } = useProfilePhoto(initialData.photoURL);
  const [duplicates, setDuplicates] = useState<{ id: string; title: string }[]>([]);
  const [duplicateConfirmationToken, setDuplicateConfirmationToken] = useState<string>();
  const [verifySource, setVerifySource] = useState(mode === "create-claimable");
  const operationKey = useRef(crypto.randomUUID());
  const commands = useAdminCommands();
  const router = commands.navigation;

  const form = useForm<FormValues>({
    resolver: zodResolver(editorFormSchema),
    defaultValues: adminProfileDefaultValues(initialData),
  });

  const activityAreas = useWatch({
    control: form.control,
    name: "activityAreas",
  });
  const hasUnavailableActivityAreasSelected = hasUnavailableActivityAreas(
    activityAreas,
    categories,
  );

  const finishSuccessfulSubmission = () => {
    router.push("/admin/perfis");
    router.refresh();
  };

  function blockPendingAreaSelection() {
    if (hasPendingPhotoUpload || !pendingAreaSelection) return false;
    setPendingAreaSelectionError(true);
    document.getElementById("activity-area-add")?.focus();
    return true;
  }

  async function submit(confirmDuplicate = false) {
    if (blockPendingAreaSelection()) return;
    if (await retryPhotoUpload(finishSuccessfulSubmission)) return;
    const isValid = await form.trigger();
    if (!isValid) return;

    setLoading(true);
    const values = isClaimable
      ? parseClaimableValues(form.getValues(), form.setError)
      : form.getValues();
    if (!values) {
      setLoading(false);
      return;
    }
    await persist(values, confirmDuplicate);
  }

  async function persist(values: FormValues, confirmDuplicate: boolean) {
    const formData = adminProfileFormData(values, {
      isClaimable,
      idempotencyKey: operationKey.current,
      revision: initialData.revision,
      verifySource,
      duplicateConfirmationToken: confirmDuplicate ? duplicateConfirmationToken : undefined,
    });

    try {
      const result = await saveAdminProfile(commands, mode, profileId, formData);
      if (!result.saved) {
        setDuplicates(result.duplicates);
        setDuplicateConfirmationToken(result.confirmationToken);
        return;
      }

      if (photoFile) {
        const target = { profileId: result.profileId, revision: result.revision };
        if (!await uploadPhoto(target)) return;
      }

      finishSuccessfulSubmission();
    }
    catch (error) {
      console.error("Error submitting form:", error);
      alert("Erro ao salvar perfil");
    }
    finally {
      setLoading(false);
    }
  }

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submit();
  }

  async function deleteProfile() {
    if (!profileId || !window.confirm("Excluir este perfil de informações públicas? Esta ação não pode ser desfeita.")) return;
    setLoading(true);
    try {
      const result = await commands.adminDeleteClaimableAdvertiserProfile(
        profileId,
        initialData.revision ?? 1,
        crypto.randomUUID(),
      );
      if (!result.success) {
        alert(result.error);
        setLoading(false);
        return;
      }
      router.push("/admin/perfis");
      router.refresh();
    }
    catch (error) {
      alert(error instanceof Error ? error.message : "Erro ao excluir perfil");
      setLoading(false);
    }
  }

  const busy = loading || uploadingPhoto;

  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <CardTitle className="text-2xl font-bold">
          {formTitles[mode]}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={handleFormSubmit} className="space-y-6">
            {mode === "edit" && (
              <AdminAdvertiserProfilePhotoField
                fileInputRef={fileInputRef}
                handlePhotoChange={handlePhotoChange}
                photoFile={photoFile}
                photoPreview={photoPreview}
                removePhoto={removePhoto}
                uploadError={uploadError}
                disabled={busy}
              />
            )}

            {hasPendingPhotoUpload && (
              <p className="text-sm text-muted-foreground">Os dados do perfil já foram salvos. Conclua o envio da foto para voltar à edição.</p>
            )}
            <fieldset className="space-y-6" disabled={hasPendingPhotoUpload}>
              <AdvertiserProfileSharedFields
                categories={categories}
                onPendingAreaSelectionChange={(pending) => {
                  setPendingAreaSelection(pending);
                  setPendingAreaSelectionError(false);
                }}
                pendingAreaSelectionError={pendingAreaSelectionError}
              />
            </fieldset>
            {isClaimable && (
              <AdminAdvertiserProfileSourceFields
                control={form.control}
                disabled={hasPendingPhotoUpload}
                showVerifySource={mode === "edit"}
                verifySource={verifySource}
                onVerifySourceChange={setVerifySource}
              />
            )}

            {duplicates.length > 0 && (
              <AdminAdvertiserProfileDuplicates
                duplicates={duplicates}
                disabled={loading}
                onConfirm={() => submit(true)}
              />
            )}

            <AdminAdvertiserProfileSubmitButton
              disabled={busy || (!hasPendingPhotoUpload && hasUnavailableActivityAreasSelected)}
              uploadingPhoto={uploadingPhoto}
              loading={loading}
              hasPendingPhotoUpload={hasPendingPhotoUpload}
              hasPhotoFile={photoFile !== null}
              mode={mode}
            />

            <AdminProfileDeletionControl
              mode={mode}
              profileId={profileId}
              isClaimable={isClaimable}
              disabled={busy}
              renderDeletion={renderDeletion}
              onDelete={deleteProfile}
            />
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
