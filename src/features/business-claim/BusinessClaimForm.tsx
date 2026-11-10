"use client";

import { useActionState } from "react";
import { Button } from "@tudomacae/react-primitives/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitBusinessClaim } from "./actions";
import type { BusinessClaimFormState } from "./formState";

const initial: BusinessClaimFormState = { status: "idle" };

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  return message ? <p id={id} className="text-sm text-destructive">{message}</p> : null;
}

/** `operationId` is fixed per rendered form, so a repeated send replays the same claim. */
export function BusinessClaimForm({ businessId, operationId }: { businessId: string; operationId: string }) {
  const [state, action, pending] = useActionState(submitBusinessClaim.bind(null, businessId), initial);
  if (state.status === "submitted") {
    return (
      <p role="status" className="mt-6 rounded-lg border border-border p-4">
        Pedido enviado. Vamos conferir as informações e avisar no e-mail da sua conta.
      </p>
    );
  }
  const errors = state.status === "error" ? state.fieldErrors : {};
  const describe = (field: keyof typeof errors, hint?: string) => [hint, errors[field] ? `${field}-error` : undefined].filter(Boolean).join(" ") || undefined;
  return (
    <form action={action} className="mt-6 space-y-5" noValidate>
      <input type="hidden" name="operationId" value={operationId} />
      {state.status === "error" && (
        <p
          role="alert"
          className="font-medium text-destructive"
        >
          {state.message}
        </p>
      )}
      <div className="space-y-2">
        <Label htmlFor="responsibleName">Seu nome</Label>
        <Input
          id="responsibleName"
          name="responsibleName"
          autoComplete="name"
          required
          maxLength={120}
          aria-invalid={errors.responsibleName ? true : undefined}
          aria-describedby={describe("responsibleName")}
        />
        <FieldError id="responsibleName-error" message={errors.responsibleName} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="cnpj">CNPJ do negócio</Label>
        <Input
          id="cnpj"
          name="cnpj"
          inputMode="numeric"
          autoComplete="off"
          required
          maxLength={18}
          aria-invalid={errors.cnpj ? true : undefined}
          aria-describedby={describe("cnpj", "cnpj-hint")}
        />
        <p id="cnpj-hint" className="text-sm text-muted-foreground">Pode digitar com ou sem pontos, barra e traço.</p>
        <FieldError id="cnpj-error" message={errors.cnpj} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="note">Mensagem para a equipe (opcional)</Label>
        <Textarea
          id="note"
          name="note"
          maxLength={500}
          aria-invalid={errors.note ? true : undefined}
          aria-describedby={describe("note", "note-hint")}
        />
        <p id="note-hint" className="text-sm text-muted-foreground">Por exemplo, o melhor horário para ligarmos no telefone desta página.</p>
        <FieldError id="note-error" message={errors.note} />
      </div>
      <Button type="submit" className="min-h-11" disabled={pending}>
        {pending ? "Enviando…" : "Enviar pedido"}
      </Button>
    </form>
  );
}
