"use client";

import type { ComponentProps } from "react";
import { PublicOfferingCatalog as View } from "@tudomacae/advertiser-identity/ui";
import { IdentityIntegration } from "@/integrations/advertiser-identity/IdentityIntegration";

export function PublicOfferingCatalog(props: ComponentProps<typeof View>) {
  return <IdentityIntegration><View {...props} /></IdentityIntegration>;
}
