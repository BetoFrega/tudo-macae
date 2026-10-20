"use client";

import { useMediaIntegrations } from "./MediaProvider";
import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { Button } from "@tudomacae/react-primitives/button";
import { Form } from "@tudomacae/react-primitives/form";
import { Input } from "@tudomacae/react-primitives/input";
import { Label } from "@tudomacae/react-primitives/label";
import type { MediaKind } from "@tudomacae/media/model";
import {
  VALID_IMAGE_TYPES_ACCEPT,
  processImage,
  validateImageFile,
} from "@tudomacae/media/imageProcessing";
import {
  mediaFormSchema,
  type CreateMediaResult,
  type MediaFormInput,
} from "../mediaForm";
import { MediaMetadataFields } from "./MediaMetadataFields";

interface MediaFormProps {
  onSubmitAction?: (formData: FormData) => Promise<CreateMediaResult>;
  kind?: MediaKind;
  submitLabel?: string;
}

const emptyMediaForm = (kind: MediaKind): MediaFormInput => ({
  kind,
  alt: "",
  caption: "",
  origin: "own-production",
  creator: "",
  credit: "",
  acquiredAt: "",
  displayBasis: "own-production",
  provider: "",
  sourceUrl: "",
  license: "",
  permissionReference: "",
});

function AlertMessage({ id, message }: { id: string; message: string | null }) {
  if (!message) return null;
  return (
    <p
      id={id}
      role="alert"
      className="text-sm font-medium text-destructive"
    >
      {message}
    </p>
  );
}

function DuplicateMatches({ matches, onUse, onPrepareNew }: {
  matches: Array<{ id: string; alt: string }>;
  onUse: (mediaId: string) => Promise<void>;
  onPrepareNew: () => void;
}) {
  if (matches.length === 0) return null;
  return (
    <div className="space-y-2">
      {matches.map(match => (
        <Button
          key={match.id}
          type="button"
          variant="outline"
          onClick={() => onUse(match.id)}
        >
          Usar
          {" "}
          {match.alt}
        </Button>
      ))}
      <Button type="button" variant="outline" onClick={onPrepareNew}>
        Preparar novo envio
      </Button>
    </div>
  );
}

function mediaFormData(file: File, confirmNew: boolean, input: MediaFormInput): FormData {
  const formData = new FormData();
  formData.append("file", file);
  if (confirmNew) formData.append("confirmNew", "true");
  for (const [name, value] of Object.entries(input)) {
    formData.append(name, value);
  }
  return formData;
}

export function MediaForm({
  onSubmitAction: suppliedSubmit,
  kind: fixedKind,
  submitLabel = "Cadastrar mídia",
}: MediaFormProps) {
  const { create, capture } = useMediaIntegrations();
  const onSubmitAction = suppliedSubmit ?? create;
  const fileInputId = useId();
  const fileErrorId = `${fileInputId}-error`;
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [matches, setMatches] = useState<Array<{ id: string; alt: string }>>([]);
  const [confirmNew, setConfirmNew] = useState(false);
  const defaultKind = fixedKind ?? "article-image";
  const form = useForm<MediaFormInput>({
    resolver: zodResolver(mediaFormSchema) as Resolver<MediaFormInput>,
    defaultValues: emptyMediaForm(defaultKind),
  });
  const isBusy = isProcessing || form.formState.isSubmitting;
  const hasFileError = Boolean(fileError || serverError);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(null);
    setServerError(null);
    setMatches([]);
    setConfirmNew(false);
    const selected = event.target.files?.[0];
    if (!selected) {
      setFile(null);
      return;
    }
    const validation = validateImageFile(selected);
    if (!validation.isValid) {
      setFileError(validation.error ?? null);
      setFile(null);
      event.target.value = "";
      return;
    }
    setIsProcessing(true);
    try {
      setFile(await processImage(selected));
    }
    catch (error) {
      setFileError(
        error instanceof Error ? error.message : "Não foi possível processar a imagem.",
      );
      setFile(null);
      event.target.value = "";
    }
    finally {
      setIsProcessing(false);
    }
  };

  const onSubmit = async (input: MediaFormInput) => {
    setServerError(null);
    if (!file) {
      setFileError("Escolha o arquivo da mídia.");
      return;
    }
    const result = await onSubmitAction(mediaFormData(file, confirmNew, input));
    if (!result.success) {
      setServerError(result.error);
      setMatches(result.matches ?? []);
      return;
    }
    capture("media_registered", {
      media_kind: input.kind,
      registration_source: "upload",
    });
    form.reset(emptyMediaForm(defaultKind));
    setFile(null);
    setFileError(null);
    setMatches([]);
    setConfirmNew(false);
  };

  const selectExistingMedia = async (mediaId: string) => {
    const selection = new FormData();
    selection.set("existingMediaId", mediaId);
    const result = await onSubmitAction(selection);
    if (!result.success) setServerError(result.error);
    else {
      capture("media_registered", {
        registration_source: "existing_media",
      });
      setMatches([]);
      setServerError(null);
      form.reset();
      setFile(null);
      setConfirmNew(false);
    }
  };

  const prepareNewUpload = () => {
    setConfirmNew(true);
    setMatches([]);
    setServerError(null);
  };

  return (
    <Form {...form}>
      <form
        onSubmit={(event) => {
          event.stopPropagation();
          void form.handleSubmit(onSubmit)(event);
        }}
        className="space-y-4"
        data-testid="media-form"
      >
        <div className="grid gap-2">
          <Label htmlFor={fileInputId}>Arquivo</Label>
          <Input
            id={fileInputId}
            type="file"
            accept={VALID_IMAGE_TYPES_ACCEPT}
            onChange={handleFileChange}
            disabled={isBusy}
            aria-invalid={hasFileError}
            aria-describedby={hasFileError ? fileErrorId : undefined}
          />
          <AlertMessage id={fileErrorId} message={fileError} />
        </div>

        <MediaMetadataFields
          form={form}
          allowPermission={false}
          {...(fixedKind ? { fixedKind } : {})}
        />

        <AlertMessage id={fileErrorId} message={serverError} />
        <DuplicateMatches
          matches={matches}
          onUse={selectExistingMedia}
          onPrepareNew={prepareNewUpload}
        />
        <Button type="submit" disabled={isBusy}>
          {form.formState.isSubmitting ? "Cadastrando..." : submitLabel}
        </Button>
      </form>
    </Form>
  );
}
