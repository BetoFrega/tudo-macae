"use client";
import { useState } from "react";
import { Input } from "@tudomacae/react-primitives/input";
import { Textarea } from "@tudomacae/react-primitives/textarea";
import { Label } from "@tudomacae/react-primitives/label";
import type { OfferingItem, OfferingFieldErrors } from "../../offeringCatalog";

type PriceMode = OfferingItem["price"]["mode"];

function errorId(message: string | undefined, id: string) {
  return message ? id : undefined;
}

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <p
      id={id}
      className="text-sm text-destructive"
    >
      {message}
    </p>
  );
}

function isPriceMode(value: string): value is PriceMode {
  return value === "fixed" || value === "from" || value === "on_request";
}

function amountDefaultValue(item?: OfferingItem) {
  if (!item || item.price.mode === "on_request" || item.price.cents === undefined) return "";
  return (item.price.cents / 100).toFixed(2).replace(".", ",");
}

function PriceModeSelect({ prefix, mode, error, onChange }: {
  prefix: string;
  mode: PriceMode;
  error: string | undefined;
  onChange: (mode: PriceMode) => void;
}) {
  return (
    <>
      <Label htmlFor={`${prefix}-price`}>Modalidade de preço</Label>
      <select
        id={`${prefix}-price`}
        aria-invalid={Boolean(error)}
        aria-describedby={errorId(error, `${prefix}-price-error`)}
        name="priceMode"
        value={mode}
        onChange={(event) => {
          const value = event.target.value;
          if (isPriceMode(value)) onChange(value);
        }}
        className="
          min-h-11 w-full rounded-md border border-input bg-background px-3
          text-base outline-none
          focus-visible:border-primary focus-visible:ring-3
          focus-visible:ring-primary
          disabled:opacity-50
          aria-invalid:border-destructive
        "
      >
        <option value="on_request">Sob consulta</option>
        <option value="fixed">Preço fixo</option>
        <option value="from">A partir de</option>
      </select>
      <FieldError id={`${prefix}-price-error`} message={error} />
    </>
  );
}

function AmountField({ prefix, item, error }: { prefix: string; item: OfferingItem | undefined; error: string | undefined }) {
  return (
    <>
      <Label htmlFor={`${prefix}-amount`}>Valor em reais</Label>
      <Input
        className="
          min-h-11
          focus-visible:ring-primary
        "
        id={`${prefix}-amount`}
        aria-invalid={Boolean(error)}
        aria-describedby={errorId(error, `${prefix}-amount-error`)}
        name="amount"
        inputMode="decimal"
        required
        pattern="[0-9]{1,7}([,.][0-9]{1,2})?"
        defaultValue={amountDefaultValue(item)}
      />
    </>
  );
}

function SourceField({ prefix, item, error }: { prefix: string; item: OfferingItem | undefined; error: string | undefined }) {
  return (
    <>
      <Label htmlFor={`${prefix}-source`}>Fonte pública das informações</Label>
      <Input
        className="
          min-h-11
          focus-visible:ring-primary
        "
        id={`${prefix}-source`}
        aria-invalid={Boolean(error)}
        aria-describedby={errorId(error, `${prefix}-source-error`)}
        name="sourceUrl"
        type="url"
        maxLength={2048}
        defaultValue={item?.source?.url}
      />
      <p className="text-sm">Obrigatória para Negócios reivindicáveis. A fonte fica restrita à gestão.</p>
    </>
  );
}

function NameAndDescriptionFields({ prefix, item, errors }: {
  prefix: string;
  item: OfferingItem | undefined;
  errors: OfferingFieldErrors;
}) {
  return (
    <>
      <Label htmlFor={`${prefix}-name`}>Nome do item</Label>
      <Input
        className="
          min-h-11
          focus-visible:ring-primary
        "
        id={`${prefix}-name`}
        aria-invalid={Boolean(errors.name)}
        aria-describedby={errorId(errors.name, `${prefix}-name-error`)}
        name="name"
        required
        maxLength={100}
        defaultValue={item?.name}
      />
      <FieldError id={`${prefix}-name-error`} message={errors.name} />
      <Label htmlFor={`${prefix}-description`}>Descrição (opcional)</Label>
      <Textarea
        id={`${prefix}-description`}
        aria-invalid={Boolean(errors.description)}
        aria-describedby={errorId(errors.description, `${prefix}-description-error`)}
        name="description"
        maxLength={1000}
        defaultValue={item?.description}
        className="
          min-h-24 resize-y
          focus-visible:ring-primary
        "
      />
      <FieldError id={`${prefix}-description-error`} message={errors.description} />
    </>
  );
}

export function ItemFields({ item, admin, errors = {} }: {
  item?: OfferingItem;
  admin: boolean;
  errors?: OfferingFieldErrors;
}) {
  const [mode, setMode] = useState<PriceMode>(item?.price.mode ?? "on_request");
  const prefix = item?.id ?? "new";
  return (
    <>
      <input type="hidden" name="operation" value="save" />
      {item && <input type="hidden" name="itemId" value={item.id} />}
      <NameAndDescriptionFields prefix={prefix} item={item} errors={errors} />
      <PriceModeSelect prefix={prefix} mode={mode} error={errors.priceMode} onChange={setMode} />
      {mode !== "on_request" && <AmountField prefix={prefix} item={item} error={errors.amount} />}
      <FieldError id={`${prefix}-amount-error`} message={errors.amount} />
      <FieldError id={`${prefix}-source-error`} message={errors.sourceUrl} />
      {admin && <SourceField prefix={prefix} item={item} error={errors.sourceUrl} />}
    </>
  );
}
