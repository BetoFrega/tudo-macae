const editorialCaller = Symbol("editorialCaller");

export type EditorialCaller = { readonly [editorialCaller]: true };

export interface FirstPartyEditorialCallerDetails {
  editorId: string;
  channel: "newsroom";
  origin: "manual";
}

export interface McpEditorialCallerDetails {
  editorId: string;
  editorialClientId: string;
  channel: "mcp";
}

export interface DelegatedEditorialCallerDetails
  extends McpEditorialCallerDetails {
  editorialDelegationId: string;
}

export type McpEditorialReadCallerDetails
  = McpEditorialCallerDetails | DelegatedEditorialCallerDetails;

export type EditorialMutationCallerDetails
  = FirstPartyEditorialCallerDetails | DelegatedEditorialCallerDetails;

/** Inventory mutations authorize the authenticated MCP client directly. */
export type EditorialInventoryMutationCallerDetails
  = FirstPartyEditorialCallerDetails | McpEditorialCallerDetails;

const editorialCallers = new WeakMap<
  EditorialCaller,
  | FirstPartyEditorialCallerDetails
  | McpEditorialCallerDetails
  | DelegatedEditorialCallerDetails
>();
const editorialPersonalAccessTokens = new WeakMap<EditorialCaller, string>();

/** A first-party caller is derived from verified authentication, never request data. */
export function firstPartyEditorialCaller(editorId: string): EditorialCaller {
  const caller = Object.freeze({}) as EditorialCaller;
  editorialCallers.set(caller, {
    editorId,
    channel: "newsroom",
    origin: "manual",
  });
  return caller;
}

/** An MCP caller is derived from an authenticated PAT, never request data. */
export function mcpEditorialCaller(input: {
  editorId: string;
  editorialClientId: string;
  personalAccessTokenId?: string;
}): EditorialCaller {
  const caller = Object.freeze({}) as EditorialCaller;
  editorialCallers.set(caller, {
    editorId: input.editorId,
    editorialClientId: input.editorialClientId,
    channel: "mcp",
  });
  if (input.personalAccessTokenId) {
    editorialPersonalAccessTokens.set(caller, input.personalAccessTokenId);
  }
  return caller;
}

/** @deprecated Prefer `mcpEditorialCaller`; kept for existing read callers. */
export const mcpEditorialReadCaller = mcpEditorialCaller;

export function delegatedEditorialCaller(
  caller: McpEditorialCallerDetails,
  editorialDelegationId: string,
): EditorialCaller {
  const delegated = Object.freeze({}) as EditorialCaller;
  editorialCallers.set(delegated, { ...caller, editorialDelegationId });
  return delegated;
}

export function firstPartyCallerDetails(
  caller: EditorialCaller,
): FirstPartyEditorialCallerDetails {
  const details = editorialCallers.get(caller);
  if (!details || details.channel !== "newsroom") {
    throw new TypeError("O chamador editorial deve ser verificado.");
  }
  return details;
}

export function mcpEditorialCallerDetails(
  caller: EditorialCaller,
): McpEditorialCallerDetails {
  const details = editorialCallers.get(caller);
  if (!details || details.channel !== "mcp") {
    throw new TypeError("O chamador MCP deve ser verificado.");
  }
  return details;
}

export function mcpEditorialReadCallerDetails(
  caller: EditorialCaller,
): McpEditorialReadCallerDetails {
  const details = editorialCallers.get(caller);
  if (!details || details.channel !== "mcp") {
    throw new TypeError("O chamador de leitura MCP deve ser verificado.");
  }
  return details;
}

export function delegatedEditorialCallerDetails(
  caller: EditorialCaller,
): DelegatedEditorialCallerDetails {
  const details = editorialCallers.get(caller);
  if (!details || details.channel !== "mcp"
    || !("editorialDelegationId" in details)) {
    throw new TypeError("A mutação MCP exige uma Delegação verificada.");
  }
  return details;
}

export function editorialMutationCallerDetails(
  caller: EditorialCaller,
): EditorialMutationCallerDetails {
  const details = editorialCallers.get(caller);
  if (!details) throw new TypeError("O chamador editorial deve ser verificado.");
  if (details.channel === "mcp" && !("editorialDelegationId" in details)) {
    throw new TypeError("A mutação MCP exige uma Delegação verificada.");
  }
  return details;
}

export function editorialInventoryMutationCallerDetails(
  caller: EditorialCaller,
): EditorialInventoryMutationCallerDetails {
  const details = editorialCallers.get(caller);
  if (!details) throw new TypeError("O chamador editorial deve ser verificado.");
  return details;
}

export function editorialCallerDetails(caller: EditorialCaller) {
  const details = editorialCallers.get(caller);
  if (!details) throw new TypeError("O chamador editorial deve ser verificado.");
  return details;
}

/** Publication retains the credential reference only for a live revocation check. */
export function editorialPublicationCallerDetails(caller: EditorialCaller) {
  const details = editorialCallerDetails(caller);
  const personalAccessTokenId = editorialPersonalAccessTokens.get(caller);
  return {
    ...details,
    ...(personalAccessTokenId ? { personalAccessTokenId } : {}),
  };
}
