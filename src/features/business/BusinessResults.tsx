"use client";

import type { ComponentProps } from "react";
import { BusinessResults as View } from "@tudomacae/advertiser-identity/discovery";
import { IdentityIntegration } from "@/integrations/advertiser-identity/IdentityIntegration";
import { PublicImage } from "@/integrations/public-images/PublicImage";
import { BusinessDirectoryFocusLink } from "./BusinessNavigationFocus";

export function BusinessResults(props: ComponentProps<typeof View>) {
  return <IdentityIntegration commands={{ Image: PublicImage, Link: BusinessDirectoryFocusLink }}><View {...props} /></IdentityIntegration>;
}
