import { IdentityAppLink as Link } from "@/integrations/advertiser-identity/rendering";
import { AdvertiserProfileAside as View } from "@tudomacae/advertiser-identity/presentation";
import { getBusinessUseCase } from "@/packages/classifieds-api";
import { IdentityPublicImage as PublicImage } from "@/integrations/advertiser-identity/rendering";
import { IdentityIntegration } from "@/integrations/advertiser-identity/IdentityIntegration";
import { getPublicAdvertiserProfile } from "../actions/getPublicAdvertiserProfile";

export async function AdvertiserProfileAside({ profileId, adId, sourcePath }: { profileId: string; adId: string; sourcePath: string }) {
  const [profile, business] = await Promise.all([
    getPublicAdvertiserProfile(profileId), getBusinessUseCase({ id: profileId }),
  ]);
  return <IdentityIntegration><View profile={profile} business={business} adId={adId} sourcePath={sourcePath} Link={Link} Image={PublicImage} /></IdentityIntegration>;
}
