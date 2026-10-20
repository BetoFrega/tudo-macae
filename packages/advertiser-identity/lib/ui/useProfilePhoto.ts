"use client";
import { usePhotoUpload } from "./context";

import { useRef, useState } from "react";
import {
  processImage,
  validateImageFile,
} from "@tudomacae/media/imageProcessing";

interface PhotoUploadTarget {
  profileId: string;
  revision: number;
}

export function useProfilePhoto(initialPhotoUrl?: string) {
  const uploadProfilePhoto = usePhotoUpload();
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(initialPhotoUrl ?? null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [pendingPhotoUpload, setPendingPhotoUpload] = useState<PhotoUploadTarget | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadIntent = useRef<{ file: File; id: string } | null>(null);

  const handlePhotoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const validation = validateImageFile(file);
    setUploadError(null);
    if (!validation.isValid) {
      setUploadError(validation.error || "Arquivo inválido");
      return;
    }
    try {
      const processedFile = await processImage(file, undefined, "image/jpeg");
      setPhotoFile(processedFile);
      const reader = new FileReader();
      reader.onloadend = () => setPhotoPreview(reader.result as string);
      reader.readAsDataURL(processedFile);
    }
    catch (error) {
      console.error("Error processing image:", error);
      setUploadError(error instanceof Error ? error.message : "Erro ao processar a imagem. Tente novamente.");
    }
  };

  const removePhoto = () => {
    setPhotoFile(null);
    setPhotoPreview(initialPhotoUrl ?? null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const uploadPhoto = async (target: PhotoUploadTarget) => {
    if (!photoFile) {
      setPendingPhotoUpload(null);
      return true;
    }
    setUploadingPhoto(true);
    setUploadError(null);
    try {
      const photoFormData = new FormData();
      photoFormData.append("photo", photoFile);
      if (uploadIntent.current?.file !== photoFile) uploadIntent.current = { file: photoFile, id: crypto.randomUUID() };
      photoFormData.append("uploadId", uploadIntent.current.id);
      const uploadResult = await uploadProfilePhoto(
        target.profileId,
        target.revision,
        photoFormData,
      );
      if (!uploadResult.success && uploadResult.reason === "invalid_photo") {
        uploadIntent.current = null;
        removePhoto();
        setUploadError(`O Perfil foi salvo, mas a foto não foi enviada: ${uploadResult.error}`);
        setPendingPhotoUpload(null);
        return false;
      }
      if (!uploadResult.success) {
        setUploadError(`O Perfil foi salvo, mas a foto não foi enviada: ${uploadResult.error}`);
        setPendingPhotoUpload(target);
        return false;
      }
      setPendingPhotoUpload(null);
      return true;
    }
    catch (error) {
      console.error("Error uploading profile photo:", error);
      setUploadError("O Perfil foi salvo, mas a foto não foi enviada. Tente novamente.");
      setPendingPhotoUpload(target);
      return false;
    }
    finally {
      setUploadingPhoto(false);
    }
  };

  const retryPhotoUpload = async (onComplete: () => void) => {
    if (!pendingPhotoUpload) return false;
    if (await uploadPhoto(pendingPhotoUpload)) onComplete();
    return true;
  };

  return {
    fileInputRef,
    handlePhotoChange,
    photoFile,
    photoPreview,
    removePhoto,
    hasPendingPhotoUpload: pendingPhotoUpload !== null,
    retryPhotoUpload,
    setPhotoFile,
    setPhotoPreview,
    setUploadError,
    uploadingPhoto,
    uploadPhoto,
    uploadError,
  };
}
