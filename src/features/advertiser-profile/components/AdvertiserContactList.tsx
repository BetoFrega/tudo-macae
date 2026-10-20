"use client";

import type { ComponentProps } from "react";
import { AdvertiserContactList as View } from "@tudomacae/advertiser-identity/presentation";
import { IdentityIntegration } from "@/integrations/advertiser-identity/IdentityIntegration";

export function AdvertiserContactList(props: ComponentProps<typeof View>) {
  return <IdentityIntegration><View {...props} /></IdentityIntegration>;
}
