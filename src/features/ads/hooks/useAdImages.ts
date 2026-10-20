import { useState, useEffect, useRef } from "react";
import { useFormContext, useFieldArray } from "react-hook-form";
import {
  validateImageFile,
  processImage,
} from "@tudomacae/media/imageProcessing";
import { AdFormSchema } from "../schemas/adFormSchema";

export interface ImageState {
  id?: string;
  path?: string;
  pending?: boolean;
  url: string;
  file?: File;
  originalFileName?: string;
  title: string;
  description: string;
  order: number;
}

export function useAdImages(maxOutputSize?: number, onProcessingChange?: (processing: boolean) => void, captureCurrentPublication?: () => () => boolean) {
  const { control, setError } = useFormContext<AdFormSchema>();
  const { append, remove, update, fields } = useFieldArray({
    control,
    name: "images",
    keyName: "fieldId",
  });

  const images = fields;
  const [uploadError, setUploadError] = useState<string | null>(null);
  const processingCount = useRef(0);

  // Cleanup object URLs on unmount
  const imagesRef = useRef(images);
  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => {
    return () => {
      imagesRef.current?.forEach((image) => {
        if (image.file && image.url) {
          URL.revokeObjectURL(image.url);
        }
      });
    };
  }, []);

  const acceptImageFile = (file: File) => {
    const validation = validateImageFile(file);
    setUploadError(null);
    if (!validation.isValid) setUploadError(validation.error || "Arquivo inválido");
    return validation.isValid;
  };

  const reportProcessingError = (error: unknown) => {
    console.error("Error processing image:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro ao processar a imagem.";
    setUploadError(errorMessage);
    setError("root", { message: errorMessage });
  };

  // Returns false when the publication changed during processing; the caller then leaves the input untouched.
  const addProcessedImage = async (originalFile: File, order: number) => {
    const isCurrent = captureCurrentPublication?.();
    const isStale = () => Boolean(isCurrent && !isCurrent());
    try {
      processingCount.current += 1;
      onProcessingChange?.(true);
      const processedFile = await processImage(originalFile, maxOutputSize, "image/jpeg");
      if (isStale()) return false;
      append({
        url: URL.createObjectURL(processedFile),
        file: processedFile,
        originalFileName: originalFile.name,
        title: "",
        description: "",
        order,
      });
    }
    catch (error) {
      if (isStale()) return false;
      reportProcessingError(error);
    }
    finally {
      processingCount.current -= 1;
      if (processingCount.current === 0) onProcessingChange?.(false);
    }
    return true;
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const originalFile = e.target.files?.[0];
    if (originalFile) {
      if (images.length >= 3) return;
      if (acceptImageFile(originalFile)) {
        const stillCurrent = await addProcessedImage(originalFile, images.length);
        if (!stillCurrent) return;
      }
    }
    e.target.value = "";
  };

  const handleRemoveImage = (index: number) => {
    const imageToRemove = images[index];
    if (imageToRemove?.file && imageToRemove?.url) {
      URL.revokeObjectURL(imageToRemove.url);
    }
    remove(index);
  };

  const handleImageMetadataChange = (
    index: number,
    field: "title" | "description",
    value: string,
  ) => {
    if (images && images[index]) {
      update(index, { ...images[index], [field]: value });
    }
  };

  return {
    images: images || [],
    uploadError,
    handleImageSelect,
    handleRemoveImage,
    handleImageMetadataChange,
  };
}
