import type { ComponentProps } from "react";
import { IdentityAppLink as Link } from "@/integrations/advertiser-identity/rendering";
import { DiscoveryLayerNav as View } from "@tudomacae/advertiser-identity/discovery";
import { IdentityIntegration } from "@/integrations/advertiser-identity/IdentityIntegration";

export function DiscoveryLayerNav(props: Omit<ComponentProps<typeof View>, "Image" | "Link">) {
  return <IdentityIntegration><View {...props} Link={Link} /></IdentityIntegration>;
}
