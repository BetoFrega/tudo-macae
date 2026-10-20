import type { ComponentProps } from "react";
import { IdentityAppLink as Link } from "@/integrations/advertiser-identity/rendering";
import { PublicImage } from "@/integrations/public-images/PublicImage";
import { CategoryBusinessPreview as View } from "@tudomacae/advertiser-identity/discovery";
import { IdentityIntegration } from "@/integrations/advertiser-identity/IdentityIntegration";

export function CategoryBusinessPreview(props: Omit<ComponentProps<typeof View>, "Image" | "Link">) {
  return <IdentityIntegration><View {...props} Image={PublicImage} Link={Link} /></IdentityIntegration>;
}
