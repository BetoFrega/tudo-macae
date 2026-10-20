import type { ComponentProps } from "react";
import { IdentityPublicImage as Image } from "@/integrations/advertiser-identity/rendering";
import { AdvertiserProfileHeader as View } from "@tudomacae/advertiser-identity/presentation";
import { IdentityIntegration } from "@/integrations/advertiser-identity/IdentityIntegration";

export function AdvertiserProfileHeader(props: Omit<ComponentProps<typeof View>, "Image" | "Link">) {
  return <IdentityIntegration><View {...props} Image={Image} /></IdentityIntegration>;
}
