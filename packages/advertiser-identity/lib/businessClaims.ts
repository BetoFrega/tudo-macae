import { z } from "zod";

/** Proof a claimant offers; a reviewer confirms it before any ownership changes. */
export type BusinessClaimEvidence = { kind: "cnpj"; cnpj: string };

/** How the reviewer confirmed the claimant controls the Business. */
export const businessClaimVerifications = ["published_contact_call", "cnpj_registry_match"] as const;
export type BusinessClaimVerification = typeof businessClaimVerifications[number];

export interface BusinessClaimReview {
  actorId: string;
  at: number;
  outcome: "approved" | "rejected";
  verification?: BusinessClaimVerification;
  reason?: string;
}

export interface BusinessClaim {
  id: string;
  claimantId: string;
  status: "pending" | "approved" | "rejected";
  responsibleName: string;
  evidence: BusinessClaimEvidence;
  note?: string;
  submittedAt: number;
  review?: BusinessClaimReview;
}

/** Every claim ever made for one Business; competing pending claims are a dispute the reviewer settles. */
export interface BusinessClaimLedger {
  revision: number;
  claims: BusinessClaim[];
}

export interface ClaimedBusiness {
  title: string;
  claimable: boolean;
}

export interface BusinessClaimAudit {
  actorId: string;
  businessId: string;
  claimId: string;
  claimantId: string;
  outcome: "approved" | "rejected";
  verification?: BusinessClaimVerification;
  reason?: string;
  rejectedCompetingClaims: string[];
  at: number;
  operationId: string;
}

export interface BusinessClaimChange {
  ledger: BusinessClaimLedger;
  /** Present only on approval: the Business becomes owned by this account in the same commit. */
  transfer?: { ownerId: string };
  audit?: BusinessClaimAudit;
}

export interface PendingBusinessClaims {
  businessId: string;
  title: string;
  revision: number;
  claims: BusinessClaim[];
}

export interface BusinessClaimStore {
  read(businessId: string): Promise<{ ledger: BusinessClaimLedger; business: ClaimedBusiness | null }>;
  /** Applies `change` atomically with the Business it reads; a thrown error commits nothing. */
  transact(businessId: string, change: (ledger: BusinessClaimLedger, business: ClaimedBusiness | null) => BusinessClaimChange): Promise<BusinessClaimLedger>;
  listPending(): Promise<PendingBusinessClaims[]>;
}

export interface BusinessClaimActor {
  id: string;
  admin: boolean;
}

export type BusinessClaimField = "responsibleName" | "cnpj" | "note" | "verification" | "reason";
export type BusinessClaimFieldErrors = Partial<Record<BusinessClaimField, string>>;

const fieldMessages: Record<BusinessClaimField, string> = {
  responsibleName: "Informe seu nome, com até 120 caracteres.",
  cnpj: "Informe um CNPJ válido, com 14 dígitos.",
  note: "Use uma mensagem com até 500 caracteres.",
  verification: "Escolha como você confirmou o pedido.",
  reason: "Explique o motivo da recusa, com até 300 caracteres.",
};

export type BusinessClaimOutcome = "validation" | "authorization" | "not_claimable" | "conflict" | "limit";

export class BusinessClaimError extends Error {
  constructor(public readonly outcome: BusinessClaimOutcome, public readonly fieldErrors: BusinessClaimFieldErrors = {}) {
    super({
      validation: "Confira os campos do pedido.",
      authorization: "Você não pode fazer esta operação.",
      not_claimable: "Este negócio não pode mais ser assumido.",
      conflict: "Os pedidos deste negócio mudaram. Recarregue antes de decidir.",
      limit: "Este negócio já tem pedidos demais em análise.",
    }[outcome]);
    this.name = "BusinessClaimError";
  }
}

/** Above this, a Business is being flooded; the reviewer must settle the open dispute first. */
export const maxPendingClaimsPerBusiness = 20;
export const competingClaimApprovedReason = "Outro pedido foi aprovado para este negócio.";

const identifier = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/u);

/** Brazilian CNPJ check digits (Receita Federal, module 11). Accepts any punctuation. */
export function normalizeCnpj(value: string): string | null {
  const digits = value.replace(/\D/gu, "");
  if (digits.length !== 14 || /^(\d)\1{13}$/u.test(digits)) return null;
  const check = (length: number) => {
    const weights = length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((total, weight, index) => total + weight * Number(digits[index]), 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return check(12) === Number(digits[12]) && check(13) === Number(digits[13]) ? digits : null;
}

const submission = z.object({
  responsibleName: z.string().trim().min(1).max(120),
  cnpj: z.string().max(32).transform((value, context) => {
    const cnpj = normalizeCnpj(value);
    if (!cnpj) context.addIssue({ code: "custom", message: fieldMessages.cnpj });
    return cnpj ?? "";
  }),
  note: z.string().trim().max(500).optional().transform(value => value || undefined),
});

const decision = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("approved"), verification: z.enum(businessClaimVerifications) }),
  z.object({ outcome: z.literal("rejected"), reason: z.string().trim().min(1).max(300) }),
]);

function fieldErrors(error: z.ZodError, fallback: BusinessClaimField): BusinessClaimFieldErrors {
  const fields: BusinessClaimFieldErrors = {};
  for (const issue of error.issues) {
    const name = issue.path[0];
    const field = typeof name === "string" && name in fieldMessages ? name as BusinessClaimField : fallback;
    fields[field] = fieldMessages[field];
  }
  return fields;
}

function parseSubmission(input: unknown) {
  const result = submission.safeParse(input);
  if (!result.success) throw new BusinessClaimError("validation", fieldErrors(result.error, "cnpj"));
  return result.data;
}

function parseDecision(input: { outcome?: unknown; verification?: unknown; reason?: unknown }) {
  const result = decision.safeParse(input);
  if (!result.success) throw new BusinessClaimError("validation", fieldErrors(result.error, input.outcome === "rejected" ? "reason" : "verification"));
  return result.data;
}

function assertIdentifiers(...values: unknown[]) {
  if (values.some(value => !identifier.safeParse(value).success)) throw new BusinessClaimError("validation");
}

/** What the claimant may see of their own request: never another claimant's data. */
export interface OwnBusinessClaim {
  status: BusinessClaim["status"];
  submittedAt: number;
  reason?: string;
}

function ownView(claim: BusinessClaim | undefined): OwnBusinessClaim | null {
  if (!claim) return null;
  return {
    status: claim.status, submittedAt: claim.submittedAt,
    ...(claim.status === "rejected" && claim.review?.reason ? { reason: claim.review.reason } : {}),
  };
}

function latestOf(ledger: BusinessClaimLedger, claimantId: string) {
  return ledger.claims.filter(claim => claim.claimantId === claimantId).at(-1);
}

export function createBusinessClaims(dependencies: {
  store: BusinessClaimStore;
  now: () => number;
  newId: () => string;
  /** Called after an approval commits, with the account that now owns the Business. */
  claimed?: (event: { businessId: string; ownerId: string }) => void;
}) {
  return {
    async readOwn(input: { businessId: string; actor: BusinessClaimActor }) {
      assertIdentifiers(input.businessId, input.actor.id);
      const { ledger, business } = await dependencies.store.read(input.businessId);
      return { claimable: business?.claimable === true, claim: ownView(latestOf(ledger, input.actor.id)) };
    },
    async submit(input: { businessId: string; actor: BusinessClaimActor; responsibleName: unknown; cnpj: unknown; note?: unknown }) {
      assertIdentifiers(input.businessId, input.actor.id);
      const value = parseSubmission(input);
      const ledger = await dependencies.store.transact(input.businessId, (ledger, business) => {
        if (business?.claimable !== true) throw new BusinessClaimError("not_claimable");
        // A repeated submission keeps the request already under review.
        if (latestOf(ledger, input.actor.id)?.status === "pending") return { ledger };
        if (ledger.claims.filter(claim => claim.status === "pending").length >= maxPendingClaimsPerBusiness)
          throw new BusinessClaimError("limit");
        const claim: BusinessClaim = {
          id: dependencies.newId(), claimantId: input.actor.id, status: "pending",
          responsibleName: value.responsibleName, evidence: { kind: "cnpj", cnpj: value.cnpj },
          ...(value.note ? { note: value.note } : {}), submittedAt: dependencies.now(),
        };
        return { ledger: { revision: ledger.revision + 1, claims: [...ledger.claims, claim] } };
      });
      return ownView(latestOf(ledger, input.actor.id))!;
    },
    async listPending(input: { actor: BusinessClaimActor }) {
      if (!input.actor.admin) throw new BusinessClaimError("authorization");
      return dependencies.store.listPending();
    },
    async review(input: {
      businessId: string; claimId: string; expectedRevision: number; operationId: string; actor: BusinessClaimActor;
      outcome: unknown; verification?: unknown; reason?: unknown;
    }) {
      if (!input.actor.admin) throw new BusinessClaimError("authorization");
      assertIdentifiers(input.businessId, input.claimId, input.operationId, input.actor.id);
      if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) throw new BusinessClaimError("validation");
      const choice = parseDecision(input);
      let approvedOwner: string | undefined;
      const ledger = await dependencies.store.transact(input.businessId, (ledger, business) => {
        if (ledger.revision !== input.expectedRevision) throw new BusinessClaimError("conflict");
        const claim = ledger.claims.find(candidate => candidate.id === input.claimId);
        if (claim?.status !== "pending") throw new BusinessClaimError("conflict");
        const at = dependencies.now();
        const base = { actorId: input.actor.id, at };
        if (choice.outcome === "rejected") {
          const review: BusinessClaimReview = { ...base, outcome: "rejected", reason: choice.reason };
          return {
            ledger: { revision: ledger.revision + 1, claims: ledger.claims.map(candidate => candidate.id === claim.id ? { ...candidate, status: "rejected", review } : candidate) },
            audit: { ...base, businessId: input.businessId, claimId: claim.id, claimantId: claim.claimantId, outcome: "rejected", reason: choice.reason, rejectedCompetingClaims: [], operationId: input.operationId },
          };
        }
        if (business?.claimable !== true) throw new BusinessClaimError("not_claimable");
        const competing = ledger.claims.filter(candidate => candidate.status === "pending" && candidate.id !== claim.id);
        const claims = ledger.claims.map((candidate): BusinessClaim => {
          if (candidate.id === claim.id) return { ...candidate, status: "approved", review: { ...base, outcome: "approved", verification: choice.verification } };
          if (candidate.status === "pending") return { ...candidate, status: "rejected", review: { ...base, outcome: "rejected", reason: competingClaimApprovedReason } };
          return candidate;
        });
        approvedOwner = claim.claimantId;
        return {
          ledger: { revision: ledger.revision + 1, claims },
          transfer: { ownerId: claim.claimantId },
          audit: { ...base, businessId: input.businessId, claimId: claim.id, claimantId: claim.claimantId, outcome: "approved", verification: choice.verification, rejectedCompetingClaims: competing.map(candidate => candidate.id), operationId: input.operationId },
        };
      });
      if (approvedOwner) dependencies.claimed?.({ businessId: input.businessId, ownerId: approvedOwner });
      return { revision: ledger.revision, status: choice.outcome };
    },
  };
}

const review = z.object({
  actorId: z.string(), at: z.number(), outcome: z.enum(["approved", "rejected"]),
  verification: z.enum(businessClaimVerifications).optional(), reason: z.string().optional(),
});
export const businessClaimLedgerSchema = z.object({
  revision: z.number().int().nonnegative(),
  claims: z.array(z.object({
    id: z.string(), claimantId: z.string(), status: z.enum(["pending", "approved", "rejected"]),
    responsibleName: z.string(), evidence: z.object({ kind: z.literal("cnpj"), cnpj: z.string() }),
    note: z.string().optional(), submittedAt: z.number(), review: review.optional(),
  })),
});
