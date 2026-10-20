"use client";

import type { ComponentProps } from "react";
import { BusinessCatalogGateway as View } from "@tudomacae/advertiser-identity/discovery";
import { IdentityIntegration } from "@/integrations/advertiser-identity/IdentityIntegration";

export function BusinessCatalogGateway(props: ComponentProps<typeof View>) {
  return <IdentityIntegration><View {...props} /></IdentityIntegration>;
}
