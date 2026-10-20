"use client";
import { Button } from "@tudomacae/react-primitives/button";

interface AdminAdvertiserProfileSubmitButtonProps {
  disabled: boolean;
  uploadingPhoto: boolean;
  loading: boolean;
  hasPendingPhotoUpload: boolean;
  hasPhotoFile: boolean;
  mode: "edit" | "create-claimable";
}

export function AdminAdvertiserProfileSubmitButton({
  disabled,
  uploadingPhoto,
  loading,
  hasPendingPhotoUpload,
  hasPhotoFile,
  mode,
}: AdminAdvertiserProfileSubmitButtonProps) {
  return (
    <Button
      type="submit"
      className="w-full"
      disabled={disabled}
    >
      {uploadingPhoto
        ? "Enviando foto..."
        : loading
          ? "Salvando..."
          : hasPendingPhotoUpload
            ? hasPhotoFile
              ? "Tentar enviar foto novamente"
              : "Concluir sem foto"
            : mode === "create-claimable"
              ? "Criar perfil público"
              : "Salvar Alterações"}
    </Button>
  );
}
