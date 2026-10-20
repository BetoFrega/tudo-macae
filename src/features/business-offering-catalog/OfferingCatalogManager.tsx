"use client";

import type { ComponentProps } from "react";
import { OfferingCatalogManager as View } from "@tudomacae/advertiser-identity/ui";
import { IdentityIntegration } from "@/integrations/advertiser-identity/IdentityIntegration";
import { changeOfferingCatalog } from "./actions";

const commands = { offeringCommands: { changeOfferingCatalog } };
export function OfferingCatalogManager(props: ComponentProps<typeof View>) {
  return <IdentityIntegration commands={commands}><View {...props} /></IdentityIntegration>;
}
