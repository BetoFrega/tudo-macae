"use client";

import { IdentityAppLink as Link, IdentityPublicImage } from "@/integrations/advertiser-identity/rendering";
import posthog from "posthog-js";
import type { ReactNode } from "react";
import { IdentityProvider, type IdentityIntegrations, type BusinessPage } from "@tudomacae/advertiser-identity/ui";
import { CANONICAL_APP_ORIGIN } from "../../../bin/appOrigin";

const integrations: IdentityIntegrations = {
  Link,
  Image: IdentityPublicImage,
  origin: CANONICAL_APP_ORIGIN,
  capture: (event, properties) => posthog.capture(event, properties),
  async readBusinesses(input, signal) {
    const params = new URLSearchParams({ cursor: input.cursor });
    if (input.categoryId) params.set("categoria", input.categoryId);
    if (input.subcategoryId) params.set("subcategoria", input.subcategoryId);
    const response = await fetch(`/api/negocios?${params.toString()}`, { signal });
    if (!response.ok) throw new Error("Falha ao carregar Negócios");
    return response.json() as Promise<BusinessPage>;
  },
  async readPublicOfferings(id, signal) {
    const response = await fetch(`/api/negocios/${encodeURIComponent(id)}/catalogo`, { cache: "no-store", signal });
    if (!response.ok) return null;
    return response.json();
  },
};
export function IdentityIntegration({ children, commands }: { children: ReactNode; commands?: Partial<IdentityIntegrations> }) {
  return <IdentityProvider integrations={commands ? { ...integrations, ...commands } : integrations}>{children}</IdentityProvider>;
}
