"use client";

import type { RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import type { usePublicationJourney } from "../../hooks/usePublicationJourney";
import { MAX_TITLE_LENGTH, MAX_TEXT_LENGTH } from "../../schemas/adFormSchema";
import { AdFormCategorySelect } from "../form/AdFormCategorySelect";
import { AdFormImageSection } from "../form/AdFormImageSection";
import { JourneyBlock } from "./JourneyBlock";

interface PublicationAdStepProps {
  journey: ReturnType<typeof usePublicationJourney>;
  isProcessingPhoto: boolean;
  photoProcessingMessage: string;
  onPhotoProcessingChange: (processing: boolean) => void;
  continueButton: RefObject<HTMLButtonElement | null>;
}

export function PublicationAdStep({ journey, isProcessingPhoto, photoProcessingMessage, onPhotoProcessingChange, continueButton }: PublicationAdStepProps) {
  const { form, step, goTo, busy, values } = journey;
  return (
    <JourneyBlock name="ad" title="Seu anúncio" summary={journey.saved ? values.title || "Confira as informações" : "Conte o que você está oferecendo"} open={step === "ad"} disabled={!!journey.locked} onOpen={goTo}>
      <form onSubmit={journey.continueAd} className="space-y-5">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between gap-4">
                <FormLabel>Título do anúncio</FormLabel>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {values.title?.length ?? 0}
                  /
                  {MAX_TITLE_LENGTH}
                </span>
              </div>
              <FormControl><Input {...field} maxLength={MAX_TITLE_LENGTH} placeholder="Ex.: Honda Civic 2020 em ótimo estado" /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <AdFormCategorySelect form={form} activeCategories={journey.activeCategories} activeSubcategories={journey.activeSubcategories} selectedCategoryId={values.categoryId ?? ""} />
        <FormField
          control={form.control}
          name="text"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between gap-4">
                <FormLabel>Texto do anúncio</FormLabel>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {values.text?.length ?? 0}
                  /
                  {MAX_TEXT_LENGTH}
                </span>
              </div>
              <FormControl>
                <Textarea
                  {...field}
                  className="min-h-40 resize-y leading-relaxed"
                  maxLength={MAX_TEXT_LENGTH}
                  rows={7}
                  placeholder="Descreva os detalhes e as condições da oferta."
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <AdFormImageSection maxOutputSize={950 * 1024} showSaveStatus onProcessingChange={onPhotoProcessingChange} captureCurrentPublication={journey.captureCurrentPublication} />
        <p
          role="status"
          aria-label="Processamento das fotos"
          className={isProcessingPhoto
            ? `text-sm`
            : `sr-only`}
        >
          {photoProcessingMessage}
        </p>
        <Button ref={continueButton} type="submit">{continueLabel(isProcessingPhoto, busy)}</Button>
      </form>
    </JourneyBlock>
  );
}

function continueLabel(isProcessingPhoto: boolean, busy: boolean) {
  if (isProcessingPhoto) return "Processando foto...";
  return busy ? "Salvando..." : "Continuar";
}
