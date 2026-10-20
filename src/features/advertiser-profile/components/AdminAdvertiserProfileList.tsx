import type { ComponentProps } from "react";
import { IdentityAppLink as Link } from "@/integrations/advertiser-identity/rendering";
import { AdminAdvertiserProfileList as View } from "@tudomacae/advertiser-identity/presentation";
import { IdentityIntegration } from "@/integrations/advertiser-identity/IdentityIntegration";

export function AdminAdvertiserProfileList(props: Omit<ComponentProps<typeof View>, "Image" | "Link">) {
  return <IdentityIntegration><View {...props} Link={Link} /></IdentityIntegration>;
}
