"use client";
import { Upload, User, X } from "lucide-react";
import type { ChangeEvent, RefObject } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@tudomacae/react-primitives/avatar";
import { Button } from "@tudomacae/react-primitives/button";
import { VALID_IMAGE_TYPES_ACCEPT } from "@tudomacae/media/imageProcessing";

interface AdminAdvertiserProfilePhotoFieldProps {
  fileInputRef: RefObject<HTMLInputElement | null>;
  handlePhotoChange: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  photoFile: File | null;
  photoPreview: string | null;
  removePhoto: () => void;
  uploadError: string | null;
  disabled: boolean;
}

export function AdminAdvertiserProfilePhotoField({
  fileInputRef,
  handlePhotoChange,
  photoFile,
  photoPreview,
  removePhoto,
  uploadError,
  disabled,
}: AdminAdvertiserProfilePhotoFieldProps) {
  return (
    <div className="flex flex-col items-center gap-4">
      <Avatar className="size-24">
        <AvatarImage
          src={photoPreview || undefined}
          alt="Foto do perfil"
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
          disabled={disabled}
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
            disabled={disabled}
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
