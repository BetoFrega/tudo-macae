import { z } from "zod";
export type CatalogFlagDecision = "enabled" | "disabled" | "outside_audience" | "unavailable";
export type OfferingPrice = {
  mode: "fixed" | "from";
  cents: number;
} | {
  mode: "on_request";
};
export interface OfferingItem {
  id: string;
  name: string;
  description: string;
  price: OfferingPrice;
  visible: boolean;
  source?: {
    url: string;
    checkedAt: number;
  };
}
export interface OfferingCatalogState {
  enabled: boolean;
  revision: number;
  items: OfferingItem[];
}
export const offeringCatalogStateSchema = z.object({
  enabled: z.boolean().default(false), revision: z.number().int().nonnegative(),
  items: z.array(z.object({
    id: z.string(), name: z.string().min(1).max(100), description: z.string().max(1000),
    price: z.discriminatedUnion("mode", [z.object({ mode: z.literal("on_request") }), z.object({ mode: z.enum(["fixed", "from"]), cents: z.number().int().min(0).max(999999999) })]),
    visible: z.boolean(), source: z.object({ url: z.string(), checkedAt: z.number() }).optional(),
  })).max(100),
});
export interface CatalogActor {
  id: string;
  admin: boolean;
}
export interface CatalogBusinessIdentity {
  ownerId?: string;
  claimable: boolean;
}
export interface CatalogEnablementAudit {
  actorId: string;
  businessId: string;
  previous: boolean;
  enabled: boolean;
  at: number;
  operationId: string;
}
interface CatalogChange {
  state: OfferingCatalogState;
  audit?: CatalogEnablementAudit;
}
export interface OfferingCatalogStore {
  read(businessId: string): Promise<OfferingCatalogState>;
  transact(businessId: string, change: (state: OfferingCatalogState, business: CatalogBusinessIdentity | null) => CatalogChange): Promise<OfferingCatalogState>;
}
export type OfferingFieldErrors = Partial<Record<"name" | "description" | "priceMode" | "amount" | "sourceUrl", string>>;
const fieldMessages = {
  name: "Informe um nome com até 100 caracteres.",
  description: "Use uma descrição com até 1000 caracteres.",
  priceMode: "Escolha uma modalidade de preço.",
  amount: "Informe um valor em reais, com até sete dígitos inteiros e duas casas decimais.",
  sourceUrl: "Informe uma fonte pública com URL HTTP ou HTTPS, de até 2048 caracteres.",
};
export class OfferingCatalogError extends Error {
  constructor(public readonly outcome: "validation" | "authorization" | "conflict" | "disabled" | "outside_audience" | "unavailable", public readonly fieldErrors: OfferingFieldErrors = {}) {
    super({ validation: "Confira os campos do catálogo.", authorization: "Você não pode alterar este catálogo.", conflict: "O catálogo mudou. Recarregue antes de salvar.", disabled: "Catálogo fora do lançamento.", outside_audience: "Catálogo fora do lançamento.", unavailable: "Catálogo temporariamente indisponível." }[outcome]);
  }
}
const identifier = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/u);
const money = z.string().trim().regex(/^\d{1,7}(?:[,.]\d{1,2})?$/u).transform((amount) => {
  const [whole = "0", fraction = ""] = amount.replace(",", ".").split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
});
const price = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("fixed"), amount: money }),
  z.object({ mode: z.literal("from"), amount: money }),
  z.object({ mode: z.literal("on_request") }),
]);
const itemSchema = z.object({ id: identifier.optional(), name: z.string().trim().min(1).max(100), description: z.string().trim().max(1000).default(""), price,
  sourceUrl: z.url().max(2048).refine(url => ["http:", "https:"].includes(new URL(url).protocol)).optional() });
const mutationSchema = z.object({ businessId: identifier, expectedRevision: z.number().int().nonnegative(), actor: z.object({ id: identifier, admin: z.boolean() }) });
export function validateOfferingItem(input: unknown) {
  const result = itemSchema.safeParse(input);
  if (!result.success) {
    const fields: OfferingFieldErrors = {};
    for (const issue of result.error.issues) {
      const name = issue.path[0];
      if (name === "name" || name === "description" || name === "sourceUrl") fields[name] = fieldMessages[name];
      else if (name === "price") {
        const field = issue.path[1] === "amount" ? "amount" : "priceMode";
        fields[field] = fieldMessages[field];
      }
    }
    throw new OfferingCatalogError("validation", fields);
  }
  return result.data;
}
function editor(actor: CatalogActor, business: CatalogBusinessIdentity | null) {
  if (!business || (!actor.admin && (business.claimable || business.ownerId !== actor.id)))
    throw new OfferingCatalogError("authorization");
}
function managementState(state: OfferingCatalogState, actor: CatalogActor): OfferingCatalogState {
  if (actor.admin) return state;
  return { ...state, items: state.items.map(({ source, ...item }) => item) };
}
type ValidOfferingItem = ReturnType<typeof validateOfferingItem>;
function previousItemForSave(state: OfferingCatalogState, item: ValidOfferingItem) {
  if (!item.id) {
    if (state.items.length >= 100) throw new OfferingCatalogError("validation");
    return undefined;
  }
  const previous = state.items.find(candidate => candidate.id === item.id);
  if (!previous) throw new OfferingCatalogError("validation");
  return previous;
}
function assertSourceProvided(actor: CatalogActor, business: CatalogBusinessIdentity, item: ValidOfferingItem, previous: OfferingItem | undefined) {
  if (actor.admin && business.claimable && !item.sourceUrl && !previous?.source)
    throw new OfferingCatalogError("validation", { sourceUrl: fieldMessages.sourceUrl });
}
function storedPrice(price: ValidOfferingItem["price"]): OfferingPrice {
  return price.mode === "on_request" ? { mode: "on_request" } : { mode: price.mode, cents: price.amount };
}
function itemSource(actor: CatalogActor, item: ValidOfferingItem, previous: OfferingItem | undefined, now: () => number): Pick<OfferingItem, "source"> {
  if (actor.admin && item.sourceUrl) return { source: { url: item.sourceUrl, checkedAt: now() } };
  if (previous?.source) return { source: previous.source };
  return {};
}
export function createOfferingCatalog(dependencies: {
  store: OfferingCatalogStore;
  flag: (businessId: string) => Promise<CatalogFlagDecision>;
  isPublicBusiness: (businessId: string) => Promise<boolean>;
  now: () => number;
  newId: () => string;
  publicOutcome?: (outcome: "business_ineligible" | "catalog_disabled" | "empty" | "success") => void;
}) {
  async function released(businessId: string) {
    if (!identifier.safeParse(businessId).success)
      throw new OfferingCatalogError("validation");
    let decision: CatalogFlagDecision;
    try {
      decision = await dependencies.flag(businessId);
    }
    catch {
      decision = "unavailable";
    }
    if (decision !== "enabled")
      throw new OfferingCatalogError(decision);
  }
  async function mutate(input: z.infer<typeof mutationSchema>, change: (state: OfferingCatalogState, business: CatalogBusinessIdentity) => CatalogChange) {
    if (!mutationSchema.safeParse(input).success)
      throw new OfferingCatalogError("validation");
    await released(input.businessId);
    const state = await dependencies.store.transact(input.businessId, (state, business) => {
      editor(input.actor, business);
      if (state.revision !== input.expectedRevision)
        throw new OfferingCatalogError("conflict");
      const result = change(state, business!);
      return { ...result, state: { ...result.state, revision: state.revision + 1 } };
    });
    return managementState(state, input.actor);
  }
  return {
    async readManagement(input: {
      businessId: string;
      actor: CatalogActor;
    }) {
      await released(input.businessId);
      const state = await dependencies.store.transact(input.businessId, (state, business) => {
        editor(input.actor, business);
        return { state };
      });
      return managementState(state, input.actor);
    },
    async saveItem(input: z.infer<typeof mutationSchema> & {
      item: unknown;
    }) {
      const item = validateOfferingItem(input.item);
      return mutate(input, (state, business) => {
        const previous = previousItemForSave(state, item);
        assertSourceProvided(input.actor, business, item, previous);
        const saved: OfferingItem = { id: previous?.id ?? dependencies.newId(), name: item.name, description: item.description,
          price: storedPrice(item.price),
          visible: previous?.visible ?? false,
          ...itemSource(input.actor, item, previous, dependencies.now),
        };
        return { state: { ...state, items: previous ? state.items.map(candidate => candidate.id === saved.id ? saved : candidate) : [...state.items, saved] } };
      });
    },
    async setVisibility(input: z.infer<typeof mutationSchema> & {
      itemId: string;
      visible: boolean;
    }) {
      if (!identifier.safeParse(input.itemId).success || typeof input.visible !== "boolean")
        throw new OfferingCatalogError("validation");
      return mutate(input, (state) => {
        if (!state.items.some(item => item.id === input.itemId))
          throw new OfferingCatalogError("validation");
        return { state: { ...state, items: state.items.map(item => item.id === input.itemId ? { ...item, visible: input.visible } : item) } };
      });
    },
    async setEnablement(input: z.infer<typeof mutationSchema> & {
      enabled: boolean;
      operationId: string;
    }) {
      if (!input.actor.admin)
        throw new OfferingCatalogError("authorization");
      if (typeof input.enabled !== "boolean" || !identifier.safeParse(input.operationId).success)
        throw new OfferingCatalogError("validation");
      return mutate(input, state => ({ state: { ...state, enabled: input.enabled }, audit: { actorId: input.actor.id, businessId: input.businessId, previous: state.enabled, enabled: input.enabled, at: dependencies.now(), operationId: input.operationId } }));
    },
    async readPublic(businessId: string) {
      try {
        await released(businessId);
      }
      catch (error) {
        if (error instanceof OfferingCatalogError)
          return null;
        throw error;
      }
      if (!await dependencies.isPublicBusiness(businessId)) {
        dependencies.publicOutcome?.("business_ineligible");
        return null;
      }
      const state = await dependencies.store.read(businessId);
      if (!state.enabled) {
        dependencies.publicOutcome?.("catalog_disabled");
        return null;
      }
      const items = state.items.filter(item => item.visible);
      dependencies.publicOutcome?.(items.length > 0 ? "success" : "empty");
      if (items.length === 0) return null;
      return { items: items.map(item => ({ id: item.id, name: item.name, description: item.description, price: item.price })) };
    },
  };
}
