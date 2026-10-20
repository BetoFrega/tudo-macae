"use client";

import {
  AlertCircle,
  Images,
  Loader2,
} from "lucide-react";
import type { FieldErrors } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { useState } from "react";
import type { AdImage, AdStatus } from "@tudomacae/ads/types";
import { useAuth } from "@/features/authentication/AuthContext";
import { useAdFormContext } from "../contexts/AdFormContext";
import { useAdFormLogic } from "../hooks/useAdFormLogic";
import type { AdFormSchema } from "../schemas/adFormSchema";
import { AdFormAdvertiserSection } from "./form/AdFormAdvertiserSection";
import { AdFormDetailsSection } from "./form/AdFormDetailsSection";
import { AdFormHeader } from "./form/AdFormHeader";
import { AdFormImageSection } from "./form/AdFormImageSection";
import { AdFormMissingProfileCard } from "./form/AdFormMissingProfileCard";
import { AdFormPartialUploadCard } from "./form/AdFormPartialUploadCard";
import { AdFormSection } from "./form/AdFormSection";
import { AdFormVisibilitySection } from "./form/AdFormVisibilitySection";
import { AdActivationFeedback } from "./AdActivationFeedback";

interface AdFormProps {
  initialData?: {
    categoryId: string;
    subcategoryId: string;
    title?: string;
    text: string;
    advertiserProfileId?: string;
    status?: AdStatus;
    images?: (AdImage & { url: string })[];
  };
  adId?: string;
}

export default function AdForm({ initialData, adId }: AdFormProps) {
  const { user } = useAuth();
  const { profiles, profileManagementHref } = useAdFormContext();

  const {
    form,
    loading,
    loginRequired,
    submissionIssue,
    partialUpload,
    retryPendingUploads,
    onSubmit,
    activeCategories,
    activeSubcategories,
    selectedCategoryId,
  } = useAdFormLogic({
    initialData,
    adId,
  });

  const isEditing = !!adId;
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);

  if (user && profiles.length === 0) {
    return <AdFormMissingProfileCard profileManagementHref={profileManagementHref} />;
  }

  if (partialUpload) {
    return (
      <AdFormPartialUploadCard
        partialUpload={partialUpload}
        isEditing={isEditing}
        loading={loading}
        retryPendingUploads={retryPendingUploads}
      />
    );
  }

  return (
    <Card className="
      mx-auto max-w-3xl gap-0 overflow-hidden bg-background py-0 shadow-md
    "
    >
      <AdFormHeader isEditing={isEditing} />
      <CardContent className="
        px-5 py-6
        sm:p-8
      "
      >
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            {(isEditing || profiles.length > 1) && profiles.length > 0 && (
              <AdFormAdvertiserSection
                form={form}
                profiles={profiles}
                profileManagementHref={profileManagementHref}
                adId={adId}
                isProcessingPhoto={isProcessingPhoto}
              />
            )}

            <AdFormDetailsSection
              form={form}
              activeCategories={activeCategories}
              activeSubcategories={activeSubcategories}
              selectedCategoryId={selectedCategoryId}
            />

            <AdFormSection
              icon={Images}
              title="Fotos"
              description="Boas fotos ajudam a mostrar os detalhes do anúncio."
            >
              <AdFormImageSection onProcessingChange={setIsProcessingPhoto} />
            </AdFormSection>

            {isEditing && <AdFormVisibilitySection form={form} />}

            <AdFormFeedback
              rootError={form.formState.errors.root}
              submissionIssue={submissionIssue}
              loginRequired={loginRequired}
            />
            <div className="border-t pt-6">
              <AdFormSubmitButton loading={loading} isEditing={isEditing} />
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

interface AdFormFeedbackProps {
  rootError: FieldErrors<AdFormSchema>["root"];
  submissionIssue: ReturnType<typeof useAdFormLogic>["submissionIssue"];
  loginRequired: boolean;
}

function AdFormFeedback({ rootError, submissionIssue, loginRequired }: AdFormFeedbackProps) {
  return (
    <>
      {rootError && (
        <div
          role="alert"
          className="
            flex gap-3 rounded-lg bg-destructive/10 p-4 text-sm font-medium
            text-destructive
          "
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {rootError.message}
        </div>
      )}
      {submissionIssue && (
        <AdActivationFeedback issue={submissionIssue} />
      )}
      {loginRequired && (
        <p
          role="status"
          className="
            flex gap-3 rounded-lg bg-secondary p-4 text-sm
            text-secondary-foreground
          "
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Você precisa entrar para publicar. Seus dados continuam aqui enquanto você estiver nesta página.
        </p>
      )}
    </>
  );
}

function AdFormSubmitButton({ loading, isEditing }: { loading: boolean; isEditing: boolean }) {
  return (
    <Button
      type="submit"
      size="lg"
      className="
        w-full
        sm:w-auto sm:min-w-52
      "
      disabled={loading}
    >
      {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
      {submitLabel(loading, isEditing)}
    </Button>
  );
}

function submitLabel(loading: boolean, isEditing: boolean) {
  if (loading) return isEditing ? "Salvando..." : "Publicando...";
  return isEditing ? "Salvar Alterações" : "Publicar Anúncio";
}
