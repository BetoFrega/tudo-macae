import { useState, useMemo, useEffect, useRef } from "react";
import { useForm, useWatch, Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { adFormSchema, AdFormSchema } from "../schemas/adFormSchema";
import { useAuth } from "@/features/authentication/AuthContext";
import { useLoginModal } from "@/features/authentication/LoginModalContext";
import { useAdFormContext } from "@/features/ads/contexts/AdFormContext";
import posthog from "posthog-js";
import type { AdActivationIssueDetails } from "../activationRecovery";
import {
  buildAdFormData,
  buildDefaultValues,
  buildImageUploadData,
  existingImagesPayload,
  pendingImageName,
  type InitialData,
} from "./adFormData";

type UploadFailure = {
  failureKind: "returned_error" | "rejected";
  authenticationRequired: boolean;
  rateLimitError?: string;
  invalidPhoto?: { error: string; editUrl: string };
};

interface UseAdFormLogicProps {
  initialData?: InitialData | undefined;
  adId?: string | undefined;
}

export function useAdFormLogic({ initialData, adId }: UseAdFormLogicProps) {
  const { user } = useAuth();
  const { openLoginModal } = useLoginModal();
  const { profiles, categories, actions } = useAdFormContext();
  const [loading, setLoading] = useState(false);
  const [loginRequired, setLoginRequired] = useState(false);
  const [submissionIssue, setSubmissionIssue] = useState<AdActivationIssueDetails | null>(null);
  const [partialUpload, setPartialUpload] = useState<{ url: string; pendingNames: string[]; retryFailed?: boolean; authenticationRequired?: boolean; rateLimitError?: string; invalidPhoto?: { error: string; editUrl: string } } | null>(null);
  const submissionPending = useRef(false);
  const pendingImages = useRef<{ image: AdFormSchema["images"][number]; uploadId: string }[]>([]);
  const savedAd = useRef<{ id: string; url: string; status: AdFormSchema["status"]; imageCount: number } | null>(null);
  const router = useRouter();

  const activeCategories = useMemo(() => categories.filter(c => c.isActive), [categories]);

  const form = useForm<AdFormSchema>({
    resolver: zodResolver(adFormSchema) as Resolver<AdFormSchema>,
    defaultValues: buildDefaultValues(initialData, profiles[0]?.id || ""),
  });

  const setSubmissionError = () => {
    setSubmissionIssue(null);
    form.setError("root", {
      type: "manual",
      message: "Ocorreu um erro ao enviar o anúncio. Tente novamente.",
    });
  };

  const selectedCategoryId = useWatch({
    control: form.control,
    name: "categoryId",
  });
  const currentCategory = useMemo(
    () => categories.find(c => c.id === selectedCategoryId),
    [categories, selectedCategoryId],
  );

  const activeSubcategories = useMemo(
    () => currentCategory?.subcategories.filter(s => s.isActive) || [],
    [currentCategory],
  );

  // Reset subcategory if not valid for selected category
  useEffect(() => {
    if (
      initialData
      && selectedCategoryId === initialData.categoryId
      && form.getValues("subcategoryId") === initialData.subcategoryId
    ) {
      return;
    }

    const currentSubId = form.getValues("subcategoryId");
    const isValid = activeSubcategories.some(s => s.id === currentSubId);

    if (!isValid && selectedCategoryId) {
      form.setValue("subcategoryId", "");
    }
  }, [selectedCategoryId, activeSubcategories, form, initialData]);

  const uploadQueuedImages = async (savedAdId: string): Promise<UploadFailure | null> => {
    while (pendingImages.current.length > 0) {
      const { image, uploadId } = pendingImages.current[0]!;
      const imageFormData = buildImageUploadData(image, uploadId);
      try {
        const result = await actions.uploadAdImage(savedAdId, imageFormData);
        if (!result.success) {
          return {
            failureKind: "returned_error",
            authenticationRequired: result.reason === "authentication_required",
            ...(result.reason === "rate_limit" && { rateLimitError: result.error }),
            ...(result.reason === "invalid_photo" && { invalidPhoto: { error: result.error, editUrl: `/anuncio/${savedAdId}/editar` } }),
          };
        }
      }
      catch {
        return { failureKind: "rejected", authenticationRequired: false };
      }
      pendingImages.current.shift();
    }
    return null;
  };

  const reportPartialUpload = (url: string, { failureKind, authenticationRequired, rateLimitError, invalidPhoto }: UploadFailure, isRetry: boolean) => {
    posthog.capture("ad_photo_upload_partial", {
      phase: isRetry ? "retry" : "initial",
      failure_kind: failureKind,
      remaining_count: pendingImages.current.length,
    });
    setPartialUpload({
      url,
      pendingNames: pendingImages.current.map(({ image }) => pendingImageName(image)),
      ...(authenticationRequired && { authenticationRequired: true }),
      ...(isRetry && { retryFailed: true }),
      ...(rateLimitError && { rateLimitError }),
      ...(invalidPhoto && { invalidPhoto }),
    });
  };

  const uploadPendingImages = async (isRetry = false) => {
    const saved = savedAd.current;
    if (!saved) return;
    const failure = await uploadQueuedImages(saved.id);
    if (failure) {
      reportPartialUpload(saved.url, failure, isRetry);
      return;
    }

    setPartialUpload(null);
    posthog.capture(adId ? "ad_updated" : "ad_created", {
      ad_status: saved.status,
      image_count: saved.imageCount,
    });
    router.push(saved.url);
  };

  const sendPendingUploads = async () => {
    if (submissionPending.current || !savedAd.current || partialUpload?.invalidPhoto) return;
    submissionPending.current = true;
    setLoading(true);
    setPartialUpload(current => current ? { url: current.url, pendingNames: current.pendingNames } : current);
    try {
      await uploadPendingImages(true);
    }
    finally {
      setLoading(false);
      submissionPending.current = false;
    }
  };

  const retryPendingUploads = async () => {
    if (partialUpload?.authenticationRequired) {
      openLoginModal(() => {
        void sendPendingUploads();
      });
      return;
    }
    await sendPendingUploads();
  };

  const saveExistingAd = async (existingAdId: string, values: AdFormSchema) => {
    const formData = buildAdFormData(values);
    formData.append("images", JSON.stringify(existingImagesPayload(values.images)));
    formData.append("observedImageIds", JSON.stringify(initialData?.images?.map(image => image.id) ?? []));

    const result = await actions.updateAd(existingAdId, formData);
    if (result?.success) return { id: existingAdId, slug: result.slug };
    if ("reason" in result && "adId" in result) {
      const { success: _success, ...issue } = result;
      setSubmissionIssue(issue);
      return null;
    }
    setSubmissionError();
    return null;
  };

  const saveNewAd = async (values: AdFormSchema) => {
    const result = await actions.createAd(buildAdFormData(values));
    if (!result.success) {
      setSubmissionError();
      return null;
    }
    return { id: result.adId, slug: result.slug };
  };

  const executeSubmit = async (values: AdFormSchema) => {
    if (submissionPending.current || partialUpload) return;
    submissionPending.current = true;
    setLoading(true);
    setSubmissionIssue(null);
    form.clearErrors("root");

    try {
      const saved = adId ? await saveExistingAd(adId, values) : await saveNewAd(values);
      if (!saved) return;
      if (!saved.id) throw new Error("Missing saved ad ID");
      savedAd.current = {
        id: saved.id,
        url: `/anuncio/${saved.id}/${saved.slug}`,
        status: values.status,
        imageCount: values.images.length,
      };
      pendingImages.current = values.images.filter(img => img.file).map(image => ({ image, uploadId: crypto.randomUUID() }));
      await uploadPendingImages();
    }
    catch (error) {
      console.error("Submit error:", error);
      setSubmissionError();
    }
    finally {
      setLoading(false);
      submissionPending.current = false;
    }
  };

  const onSubmit = async (values: AdFormSchema) => {
    // Every submit attempt clears the message left by a previously dismissed modal.
    setLoginRequired(false);
    if (!user) {
      openLoginModal(
        () => executeSubmit(values),
        () => setLoginRequired(true),
      );
    }
    else {
      await executeSubmit(values);
    }
  };

  return {
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
  };
}
