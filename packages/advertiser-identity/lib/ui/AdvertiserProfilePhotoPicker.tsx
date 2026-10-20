"use client";
import { Upload, User, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@tudomacae/react-primitives/avatar";
import { Button } from "@tudomacae/react-primitives/button";
import { VALID_IMAGE_TYPES_ACCEPT } from "@tudomacae/media/imageProcessing";

import type { useProfilePhoto } from "./useProfilePhoto";

type ProfilePhoto = ReturnType<typeof useProfilePhoto>;

interface AdvertiserProfilePhotoPickerProps extends Pick<
  ProfilePhoto,
  | "fileInputRef"
  | "handlePhotoChange"
  | "photoFile"
  | "photoPreview"
  | "removePhoto"
  | "uploadingPhoto"
  | "uploadError"
> {
  alt: string;
  loading: boolean;
}

export function AdvertiserProfilePhotoPicker({
  alt,
  loading,
  fileInputRef,
  handlePhotoChange,
  photoFile,
  photoPreview,
  removePhoto,
  uploadingPhoto,
  uploadError,
}: AdvertiserProfilePhotoPickerProps) {
  return (
    <div className="flex flex-col items-center gap-4">
      <Avatar className="size-24">
        <AvatarImage
          src={photoPreview || undefined}
          alt={alt}
        />
        <AvatarFallback>
          <User className="size-12" />
        </AvatarFallback>
      </Avatar>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={loading || uploadingPhoto}
        >
          <Upload className="mr-2 size-4" />
          {photoPreview ? "Trocar Foto" : "Adicionar Foto"}
        </Button>

        {photoFile && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={removePhoto}
            disabled={loading || uploadingPhoto}
          >
            <X className="mr-2 size-4" />
            Remover
          </Button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={VALID_IMAGE_TYPES_ACCEPT}
        onChange={handlePhotoChange}
        className="hidden"
      />

      <p className="text-center text-xs text-muted-foreground">
        JPEG, PNG, WebP ou GIF. Máximo 20MB.
      </p>
      {uploadError && (
        <p className="text-center text-sm font-medium text-destructive">
          {uploadError}
        </p>
      )}
    </div>
  );
}
