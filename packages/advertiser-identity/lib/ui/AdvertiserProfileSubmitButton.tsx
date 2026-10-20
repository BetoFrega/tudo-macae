"use client";
import { Button } from "@tudomacae/react-primitives/button";

import type { ProfileOperationError } from "./AdvertiserProfileFormAlerts";

interface AdvertiserProfileSubmitButtonProps {
  loading: boolean;
  uploadingPhoto: boolean;
  hasPendingPhotoUpload: boolean;
  hasPhotoFile: boolean;
  hasUnavailableActivityAreasSelected: boolean;
  operationError: ProfileOperationError | null;
  isEditing: boolean;
  creationSource: "catalog" | undefined;
}

type SubmitLabelState = Omit<AdvertiserProfileSubmitButtonProps, "hasUnavailableActivityAreasSelected">;

function editingLabel(operationError: ProfileOperationError | null) {
  if (operationError === "conflict") return "Salvar minhas alterações sobre a versão atual";
  if (operationError === "technical") return "Tentar salvar novamente";
  return "Salvar Alterações";
}

function creationLabel(creationSource: "catalog" | undefined, operationError: ProfileOperationError | null) {
  if (creationSource !== "catalog") return "Criar Perfil";
  return operationError === "technical" ? "Tentar salvar novamente" : "Criar negócio";
}

function submitLabel(state: SubmitLabelState) {
  if (state.uploadingPhoto) return "Enviando foto...";
  if (state.loading) return state.isEditing ? "Salvando..." : "Criando...";
  if (state.hasPendingPhotoUpload) return state.hasPhotoFile ? "Tentar enviar foto novamente" : "Concluir sem foto";
  return state.isEditing ? editingLabel(state.operationError) : creationLabel(state.creationSource, state.operationError);
}

export function AdvertiserProfileSubmitButton({
  loading,
  uploadingPhoto,
  hasPendingPhotoUpload,
  hasPhotoFile,
  hasUnavailableActivityAreasSelected,
  operationError,
  isEditing,
  creationSource,
}: AdvertiserProfileSubmitButtonProps) {
  return (
    <Button
      type="submit"
      className="w-full"
      disabled={
        loading
        || uploadingPhoto
        || (!hasPendingPhotoUpload && hasUnavailableActivityAreasSelected)
        || operationError === "already_created"
      }
    >
      {submitLabel({ loading, uploadingPhoto, hasPendingPhotoUpload, hasPhotoFile, operationError, isEditing, creationSource })}
    </Button>
  );
}
