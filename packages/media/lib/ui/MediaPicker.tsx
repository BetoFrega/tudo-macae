"use client";

import { useMediaIntegrations } from "./MediaProvider";
import { useState, type ReactNode } from "react";
import { Button } from "@tudomacae/react-primitives/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@tudomacae/react-primitives/dialog";
import type { MediaOption, MediaOptionsResult } from "../../options";
import {
  type CreateMediaResult,
} from "../mediaForm";
import { mediaKindLabels, type MediaKind } from "@tudomacae/media/model";
import { MediaForm } from "./MediaForm";
import { MediaPickerOptions } from "./MediaPickerOptions";

interface MediaPickerProps {
  /** What the context that opened the picker can use. Nothing else is offered. */
  kind: MediaKind;
  loadAction: (kind: MediaKind, cursor?: string) => Promise<MediaOptionsResult>;
  onCreateAction: (formData: FormData) => Promise<CreateMediaResult>;
  onSelectAction: (media: MediaOption) => void;
  resolveAction?: (mediaId: string) => Promise<MediaOption | null>;
  triggerLabel?: string;
}

function PoliteStatus({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="text-sm text-muted-foreground"
    >
      {children}
    </p>
  );
}

function LibraryStatus({ options, loadError, isLoadingMore }: {
  options: MediaOption[] | null;
  loadError: string | null;
  isLoadingMore: boolean;
}) {
  return (
    <>
      {loadError && (
        <p
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
          className="text-sm font-medium text-destructive"
        >
          {loadError}
        </p>
      )}

      {options === null && !loadError && (
        <PoliteStatus>Carregando o acervo...</PoliteStatus>
      )}

      {options?.length === 0 && (
        <PoliteStatus>Nenhuma mídia desta espécie no acervo.</PoliteStatus>
      )}

      {isLoadingMore && <PoliteStatus>Carregando mais mídias...</PoliteStatus>}
    </>
  );
}

/**
 * Chooses a media the acervo already holds, so the same photograph is not
 * uploaded twice — and registers one right here when the acervo does not have
 * it yet, so nobody has to leave what they were writing to go and fill the
 * library first.
 */
export function MediaPicker({
  kind,
  loadAction,
  onCreateAction,
  onSelectAction,
  resolveAction,
  triggerLabel = "Escolher mídia",
}: MediaPickerProps) {
  const { resolve: resolveDefault, reportFailure: logPickerFailure } = useMediaIntegrations();
  const resolve = resolveAction ?? resolveDefault;
  const [open, setOpen] = useState(false);
  // `null` while the acervo has not answered yet — distinct from an acervo
  // that answered with nothing.
  const [options, setOptions] = useState<MediaOption[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  /**
   * A refusal from the acervo — no permission, or the read failed — is said out
   * loud. Swallowing it would leave "Carregando o acervo..." on screen forever.
   */
  const requestOptions = async (cursor?: string): Promise<MediaOptionsResult> => {
    try {
      return await loadAction(kind, cursor);
    }
    catch {
      logPickerFailure(
        "media.picker.read.failed",
        cursor ? "media.options.next_page" : "media.options.read",
      );
      return { success: false, error: "Não foi possível ler o acervo." };
    }
  };

  const resolveRegistered = async (mediaId: string): Promise<MediaOption | null> => {
    try {
      return await resolve(mediaId);
    }
    catch {
      logPickerFailure("media.picker.resolve.failed", "media.options.resolve");
      return null;
    }
  };

  const load = async () => {
    setOptions(null);
    setNextCursor(null);
    setLoadError(null);

    const result = await requestOptions();
    if (!result.success) {
      setLoadError(result.error);
      return;
    }

    setOptions(result.options);
    setNextCursor(result.nextCursor ?? null);
  };

  const loadMore = async () => {
    if (!nextCursor) return;
    setIsLoadingMore(true);
    setLoadError(null);
    const result = await requestOptions(nextCursor);
    setIsLoadingMore(false);
    if (!result.success) {
      setLoadError(result.error);
      return;
    }
    setOptions(current => current
      ? [...new Map([...current, ...result.options].map(media => [media.id, media])).values()]
      : result.options);
    setNextCursor(result.nextCursor ?? null);
  };

  const openPicker = async () => {
    setOpen(true);
    await load();
  };

  const choose = (media: MediaOption) => {
    onSelectAction(media);
    setOpen(false);
  };

  /**
   * Registering here is choosing: the person came to pick a media and now the
   * acervo has the one they wanted. If the fresh read somehow does not carry
   * it, the picker stays open showing what it did read rather than handing
   * back a media it never saw.
   */
  const handleCreate = async (formData: FormData): Promise<CreateMediaResult> => {
    const creation = await onCreateAction(formData);
    if (!creation.success) return creation;

    const reload = await requestOptions();
    if (!reload.success) {
      const registered = await resolveRegistered(creation.mediaId);
      if (registered) {
        setOptions(current => current
          ? [...new Map([...current, registered].map(media => [media.id, media])).values()]
          : [registered]);
        setNextCursor(null);
        setLoadError(null);
        choose(registered);
        return creation;
      }
      setOptions(null);
      const resolutionError = {
        success: false as const,
        error: "A mídia foi cadastrada, mas não foi possível carregá-la para seleção. Tente escolher novamente no acervo.",
      };
      setLoadError(resolutionError.error);
      return creation;
    }

    setOptions(reload.options);
    setNextCursor(reload.nextCursor ?? null);

    const registered = reload.options.find(media => media.id === creation.mediaId)
      ?? await resolveRegistered(creation.mediaId);
    if (registered) choose(registered);

    if (!registered) {
      setLoadError("A mídia foi cadastrada, mas não foi possível carregá-la para seleção. Tente escolher novamente no acervo.");
    }
    return creation;
  };

  return (
    <>
      <Button type="button" variant="outline" onClick={openPicker}>
        {triggerLabel}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="
            max-h-[85vh] overflow-y-auto
            sm:max-w-2xl
          "
          data-testid="media-picker"
        >
          <DialogHeader>
            <DialogTitle>Escolher mídia</DialogTitle>
            <DialogDescription>
              Mídias da espécie
              {" "}
              {mediaKindLabels[kind].toLowerCase()}
              . Escolha uma do acervo ou cadastre outra sem sair daqui.
            </DialogDescription>
          </DialogHeader>

          <section className="space-y-3">
            <h3 className="text-sm font-medium">Do acervo</h3>

            <LibraryStatus
              options={options}
              loadError={loadError}
              isLoadingMore={isLoadingMore}
            />

            {options && options.length > 0 && (
              <MediaPickerOptions options={options} onChoose={choose} />
            )}

            {nextCursor && (
              <Button
                type="button"
                variant="outline"
                onClick={loadMore}
                disabled={isLoadingMore}
              >
                {isLoadingMore ? "Carregando..." : "Carregar mais mídias"}
              </Button>
            )}
          </section>

          <section className="space-y-3 border-t pt-4">
            <h3 className="text-sm font-medium">Cadastrar nova mídia</h3>
            <MediaForm
              onSubmitAction={handleCreate}
              kind={kind}
              submitLabel="Cadastrar e escolher"
            />
          </section>
        </DialogContent>
      </Dialog>
    </>
  );
}
