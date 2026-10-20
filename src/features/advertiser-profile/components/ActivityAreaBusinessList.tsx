import type { ComponentProps } from "react";
import { IdentityAppLink as Link } from "@/integrations/advertiser-identity/rendering";
import { ActivityAreaBusinessList as View } from "@tudomacae/advertiser-identity/presentation";
import { IdentityPublicImage as PublicImage } from "@/integrations/advertiser-identity/rendering";
import { IdentityIntegration } from "@/integrations/advertiser-identity/IdentityIntegration";
import { getActivityAreaBusinesses } from "../actions/getActivityAreaBusinesses";

type Props = Omit<ComponentProps<typeof View>, "Image" | "Link" | "businesses"> & { businesses?: ComponentProps<typeof View>["businesses"] };
export async function ActivityAreaBusinessList(props: Props) {
  const businesses = props.businesses ?? await getActivityAreaBusinesses({ categoryId: props.categoryId, subcategoryId: props.subcategoryId });
  return <IdentityIntegration><View {...props} businesses={businesses} Link={Link} Image={PublicImage} /></IdentityIntegration>;
}
