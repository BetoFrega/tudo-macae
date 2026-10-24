"use client";

import type { ComponentProps } from "react";
import { BusinessCatalogAnalytics as Analytics } from "@tudomacae/advertiser-identity/discovery";
import { IdentityIntegration } from "@/integrations/advertiser-identity/IdentityIntegration";

export function BusinessCatalogAnalytics(props: ComponentProps<typeof Analytics>) {
  return <IdentityIntegration><Analytics {...props} /></IdentityIntegration>;
}
