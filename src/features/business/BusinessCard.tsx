import type { ComponentProps } from "react";
import { PublicImage } from "@/integrations/public-images/PublicImage";
import { BusinessCard as View } from "@tudomacae/advertiser-identity/discovery";
import { IdentityIntegration } from "@/integrations/advertiser-identity/IdentityIntegration";
export type { ResolvedBusinessActivity } from "@tudomacae/advertiser-identity/discovery";

export function BusinessCard(props: Omit<ComponentProps<typeof View>, "Image" | "Link">) {
  return <IdentityIntegration><View {...props} Image={PublicImage} /></IdentityIntegration>;
}
