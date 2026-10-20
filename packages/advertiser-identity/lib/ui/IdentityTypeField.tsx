"use client";
import { useState } from "react";
import type { AdvertiserIdentityType } from "../../model";

export const identityTypeLabels: Record<AdvertiserIdentityType, string> = {
  personal: "Meu perfil pessoal",
  business: "Um negócio",
};

interface IdentityTypeFieldProps {
  value: AdvertiserIdentityType | null;
  onChange(value: AdvertiserIdentityType): void;
  personalAvailable: boolean;
  invalid: boolean;
  disabled?: boolean;
}

function radioDescription(type: AdvertiserIdentityType, personalAvailable: boolean, invalid: boolean) {
  const ids = [type === "personal" && !personalAvailable ? "identity-type-personal-unavailable" : null, invalid ? "identity-type-error" : null].filter(Boolean);
  return ids.length ? ids.join(" ") : undefined;
}

/** Radios carry `identity-type-<value>` ids so callers can move focus to the first available choice. */
export function IdentityTypeField({ value, onChange, personalAvailable, invalid, disabled = false }: IdentityTypeFieldProps) {
  const describedBy = ["identity-type-hint", invalid ? "identity-type-error" : null].filter(Boolean).join(" ");
  return (
    <fieldset className="space-y-2" disabled={disabled} aria-describedby={describedBy}>
      <legend className="text-sm font-medium">Este perfil é</legend>
      <p id="identity-type-hint" className="text-sm text-muted-foreground">Cada conta pode ter um perfil pessoal e vários negócios. A escolha não pode ser alterada depois.</p>
      {(["personal", "business"] as const).map(type => (
        <div key={type}>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              id={`identity-type-${type}`}
              type="radio"
              name="identityType"
              value={type}
              checked={value === type}
              disabled={type === "personal" && !personalAvailable}
              aria-describedby={radioDescription(type, personalAvailable, invalid)}
              onChange={() => onChange(type)}
            />
            {identityTypeLabels[type]}
          </label>
          {type === "personal" && !personalAvailable && (
            <p
              id="identity-type-personal-unavailable"
              className="text-sm text-muted-foreground"
            >
              Sua conta já tem um perfil pessoal.
            </p>
          )}
        </div>
      ))}
      {invalid && (
        <p
          id="identity-type-error"
          className="text-sm text-destructive"
        >
          Escolha se este perfil é pessoal ou de um negócio.
        </p>
      )}
    </fieldset>
  );
}

export function focusIdentityTypeChoice() {
  const choices = ["identity-type-personal", "identity-type-business"].map(id => document.getElementById(id));
  choices.find(choice => choice instanceof HTMLInputElement && !choice.disabled)?.focus();
}

/** Choice state for `IdentityTypeField`; `enabled` false makes `confirm` always pass. */
export function useIdentityTypeChoice({ enabled, personalAvailable: initiallyPersonalAvailable }: { enabled: boolean; personalAvailable: boolean }) {
  const [value, setValue] = useState<AdvertiserIdentityType | null>(null);
  const [missing, setMissing] = useState(false);
  const [personalAvailable, setPersonalAvailable] = useState(initiallyPersonalAvailable);
  return {
    enabled,
    value,
    /** Returns false after pointing the person to the missing choice. */
    confirm() {
      if (!enabled || value) return true;
      setMissing(true);
      focusIdentityTypeChoice();
      return false;
    },
    personalTaken() {
      setPersonalAvailable(false);
      setValue(null);
    },
    fieldProps: {
      value,
      onChange(next: AdvertiserIdentityType) {
        setValue(next);
        setMissing(false);
      },
      personalAvailable,
      invalid: missing,
    },
  };
}

/** Renders the field only while `choice` asks for a type. */
export function IdentityTypeChoiceField({ choice }: { choice: ReturnType<typeof useIdentityTypeChoice> }) {
  return choice.enabled ? <IdentityTypeField {...choice.fieldProps} /> : null;
}
