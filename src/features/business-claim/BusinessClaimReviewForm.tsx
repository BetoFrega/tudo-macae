"use client";

import { useActionState, useId, useState } from "react";
import { Button } from "@tudomacae/react-primitives/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { reviewBusinessClaim } from "./actions";
import type { BusinessClaimReviewState } from "./formState";

const initial: BusinessClaimReviewState = { status: "idle" };

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  return message ? <p id={id} className="text-sm text-destructive">{message}</p> : null;
}

function VerificationChoice({ id, error }: { id: string; error: string | undefined }) {
  return (
    <fieldset className="space-y-2" aria-describedby={error ? `${id}-verification-error` : undefined}>
      <legend className="font-medium">Como você confirmou que a pessoa responde pelo negócio?</legend>
      <label className="flex min-h-11 items-center gap-2">
        <input type="radio" name="verification" value="published_contact_call" required />
        Liguei para o telefone publicado na página e o negócio confirmou o pedido
      </label>
      <label className="flex min-h-11 items-center gap-2">
        <input type="radio" name="verification" value="cnpj_registry_match" />
        O e-mail ou o telefone do CNPJ na Receita batem com os da conta
      </label>
      <FieldError id={`${id}-verification-error`} message={error} />
    </fieldset>
  );
}

function RejectionReason({ id, error }: { id: string; error: string | undefined }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={`${id}-reason`}>Motivo, que a pessoa vai ler</Label>
      <Textarea
        id={`${id}-reason`}
        name="reason"
        required
        maxLength={300}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-reason-error` : undefined}
      />
      <FieldError id={`${id}-reason-error`} message={error} />
    </div>
  );
}

const outcomeLabels = { approved: "Aprovar e transferir a página", rejected: "Recusar" } as const;
const reviewedMessages = { approved: "Pedido aprovado. A página agora é do solicitante.", rejected: "Pedido recusado." } as const;

/** Approval requires naming how control was confirmed; rejection requires a reason the claimant will read. */
export function BusinessClaimReviewForm({ businessId, claimId, revision, operationId }: { businessId: string; claimId: string; revision: number; operationId: string }) {
  const [state, action, pending] = useActionState(reviewBusinessClaim, initial);
  const [outcome, setOutcome] = useState<"approved" | "rejected">("approved");
  const id = useId();
  if (state.status === "reviewed") return (
    <p
      role="status"
      className="font-medium"
    >
      {reviewedMessages[state.outcome]}
    </p>
  );
  const errors = state.status === "error" ? state.fieldErrors : {};
  const approving = outcome === "approved";
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="claimId" value={claimId} />
      <input type="hidden" name="expectedRevision" value={revision} />
      <input type="hidden" name="operationId" value={operationId} />
      {state.status === "error" && (
        <p
          role="alert"
          className="font-medium text-destructive"
        >
          {state.message}
        </p>
      )}
      <fieldset className="space-y-2">
        <legend className="font-medium">Decisão</legend>
        {(["approved", "rejected"] as const).map(value => (
          <label key={value} className="flex min-h-11 items-center gap-2">
            <input type="radio" name="outcome" value={value} checked={outcome === value} onChange={() => setOutcome(value)} />
            {outcomeLabels[value]}
          </label>
        ))}
      </fieldset>
      {approving ? <VerificationChoice id={id} error={errors.verification} /> : <RejectionReason id={id} error={errors.reason} />}
      <Button type="submit" className="min-h-11" variant={approving ? "default" : "destructive"} disabled={pending}>
        {pending ? "Registrando…" : approving ? "Aprovar" : "Recusar"}
      </Button>
    </form>
  );
}
