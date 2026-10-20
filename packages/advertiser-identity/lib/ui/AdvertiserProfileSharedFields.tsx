"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useFieldArray, type FieldValues, useFormContext } from "react-hook-form";
import { Button } from "@tudomacae/react-primitives/button";
import { Checkbox } from "@tudomacae/react-primitives/checkbox";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@tudomacae/react-primitives/form";
import { Input } from "@tudomacae/react-primitives/input";
import { Textarea } from "@tudomacae/react-primitives/textarea";
import { formatPhoneNumber } from "../../phonePresentation";
import type { ActivityArea } from "../../model";
import { ActivityAreaSelector, type ActivityAreaCategory } from "./ActivityAreaSelector";

export interface AdvertiserProfileSharedValues extends FieldValues {
  title: string;
  description?: string;
  contacts: { number: string; isWhatsapp: boolean }[];
  activityAreas: ActivityArea[];
}

function normalizePhoneInput(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("55") && (digits.length === 13 || digits.length === 12)
    ? digits.slice(2)
    : digits;
}

export function AdvertiserProfileSharedFields({
  categories,
  terminology = "profile",
  onPendingAreaSelectionChange,
  pendingAreaSelectionError,
  autofillOwnerPhone = false,
  onProgrammaticChange,
}: {
  categories: ActivityAreaCategory[];
  terminology?: "profile" | "business";
  onPendingAreaSelectionChange?(pending: boolean): void;
  pendingAreaSelectionError?: boolean;
  autofillOwnerPhone?: boolean;
  onProgrammaticChange?: () => void;
}) {
  const form = useFormContext<AdvertiserProfileSharedValues>();
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "contacts",
  });
  const activityAreas = form.watch("activityAreas");
  const [countryCodeDrafts, setCountryCodeDrafts] = useState<Record<string, boolean>>({});

  return (
    <>
      <FormField
        control={form.control}
        name="title"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{terminology === "business" ? "Nome do negócio" : "Título do Perfil"}</FormLabel>
            <FormControl><Input placeholder="Ex: Coxinhas da Ju" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="description"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Descrição (Opcional)</FormLabel>
            <FormControl>
              <Textarea
                placeholder={terminology === "business"
                  ? "Fale um pouco sobre seu negócio..."
                  : "Fale um pouco sobre este perfil..."}
                className="resize-none"
                rows={3}
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <FormLabel>Contatos</FormLabel>
          {fields.length < 3 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                append({ number: "", isWhatsapp: false });
                onProgrammaticChange?.();
              }}
            >
              <Plus className="mr-2 size-4" />
              {" "}
              Adicionar Contato
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          O número informado poderá aparecer publicamente no catálogo.
          {terminology === "business" && " Sem contato, o cadastro fica salvo, mas ainda não aparece no catálogo."}
        </p>
        {fields.map((field, index) => (
          <div
            key={field.id}
            className="
              grid grid-cols-[minmax(0,1fr)_auto] gap-2
              sm:grid-cols-[minmax(0,1fr)_auto_auto]
            "
          >
            <FormField
              control={form.control}
              name={`contacts.${index}.number`}
              render={({ field: inputField }) => (
                <FormItem className="
                  col-span-2
                  sm:col-span-1
                "
                >
                  <FormControl>
                    <Input
                      {...inputField}
                      type="tel"
                      inputMode="tel"
                      autoComplete={autofillOwnerPhone && index === 0 ? "tel" : "off"}
                      aria-label={`Número de contato ${index + 1}`}
                      placeholder="(00) 00000-0000"
                      onChange={(event) => {
                        const raw = event.target.value;
                        const number = normalizePhoneInput(raw);
                        const keepCountryCode = raw.startsWith("+") && number === raw.replace(/\D/g, "");
                        setCountryCodeDrafts(current => ({ ...current, [field.id]: keepCountryCode }));
                        inputField.onChange(number);
                      }}
                      value={countryCodeDrafts[field.id] ? `+${inputField.value}` : formatPhoneNumber(inputField.value)}
                    />
                  </FormControl>
                  {terminology === "business" && (
                    <FormDescription className="sr-only">
                      O número poderá aparecer publicamente no catálogo.
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name={`contacts.${index}.isWhatsapp`}
              render={({ field: checkField }) => (
                <FormItem className="
                  flex flex-row items-center space-y-0 space-x-2 rounded-md
                  border p-3
                "
                >
                  <FormControl><Checkbox aria-label={`WhatsApp para contato ${index + 1}`} checked={checkField.value} onCheckedChange={checkField.onChange} /></FormControl>
                  <div className="leading-none" aria-hidden="true">
                    <span className="
                      text-sm leading-none font-medium
                      peer-disabled:cursor-not-allowed peer-disabled:opacity-70
                    "
                    >
                      WhatsApp
                    </span>
                  </div>
                </FormItem>
              )}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => {
                remove(index);
                onProgrammaticChange?.();
              }}
              title="Remover Contato"
              aria-label="Remover Contato"
            >
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
        ))}
        {form.formState.errors.contacts && (
          <p className="text-sm font-medium text-destructive">
            {form.formState.errors.contacts.message}
          </p>
        )}
      </div>
      <ActivityAreaSelector
        categories={categories}
        value={activityAreas}
        onChange={(areas) => {
          form.setValue("activityAreas", areas, { shouldDirty: true, shouldValidate: true });
          onProgrammaticChange?.();
        }}
        {...(onPendingAreaSelectionChange ? { onPendingSelectionChange: onPendingAreaSelectionChange } : {})}
        {...(pendingAreaSelectionError ? { pendingSelectionError: true } : {})}
      />
    </>
  );
}
