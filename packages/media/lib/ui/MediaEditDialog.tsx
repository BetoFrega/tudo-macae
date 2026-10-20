"use client";

import { useMediaIntegrations } from "./MediaProvider";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { Button } from "@tudomacae/react-primitives/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@tudomacae/react-primitives/dialog";
import { Form } from "@tudomacae/react-primitives/form";
import { mediaKindLabels } from "@tudomacae/media/model";
import type { MediaOption } from "../../options";
import {
  mediaFormFromMetadata,
  mediaFormSchema,
  type MediaFormInput,
} from "../mediaForm";
import { MediaMetadataFields } from "./MediaMetadataFields";
import { Textarea } from "@tudomacae/react-primitives/textarea";

export function MediaEditDialog({
  media,
  requiresCorrectionReason,
}: {
  media: MediaOption;
  requiresCorrectionReason: boolean;
}) {
  const { update: updateMedia } = useMediaIntegrations();
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const form = useForm<MediaFormInput>({
    resolver: zodResolver(mediaFormSchema) as Resolver<MediaFormInput>,
    defaultValues: mediaFormFromMetadata(media),
  });

  const onSubmit = async (input: MediaFormInput) => {
    setServerError(null);
    const result = await updateMedia({
      id: media.id,
      expectedRevision: media.revision,
      ...(requiresCorrectionReason ? { reason } : {}),
      form: input,
    });
    if (!result.success) {
      setServerError(result.error);
      return;
    }
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          setReason("");
          setServerError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label={`Editar mídia: ${media.alt}`}>Editar</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar mídia</DialogTitle>
          <DialogDescription>
            {mediaKindLabels[media.kind]}
            . O arquivo não muda: para trocar a imagem, cadastre outra mídia.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
            data-testid="media-edit-form"
          >
            <MediaMetadataFields form={form} fixedKind={media.kind} />
            {requiresCorrectionReason && (
              <label className="grid gap-2 text-sm font-medium" htmlFor={`media-correction-reason-${media.id}`}>
                Motivo da correção
                <Textarea id={`media-correction-reason-${media.id}`} value={reason} onChange={event => setReason(event.target.value)} required maxLength={1_000} />
              </label>
            )}
            {serverError && (
              <p
                role="alert"
                aria-live="polite"
                className="text-sm font-medium text-destructive"
              >
                {serverError}
              </p>
            )}
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Salvando..." : "Salvar alterações"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
