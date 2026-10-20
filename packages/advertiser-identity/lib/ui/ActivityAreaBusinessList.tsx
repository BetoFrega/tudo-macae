import { ArrowRight, User } from "lucide-react";
import type { IdentityLink } from "./rendering";
import { IdentityAvatar } from "./IdentityAvatar";
import { Card, CardContent, CardHeader, CardTitle } from "@tudomacae/react-primitives/card";
import { BusinessLink } from "./BusinessTracking";
import type { BusinessPublicData } from "../../business";
import { businessCanonicalPath } from "../../businessPresentation";
import { AdvertiserContactList } from "./AdvertiserContactList";
import { BusinessAdministrationStatus } from "./BusinessAdministrationStatus";
import type { IdentityImage } from "./rendering";

interface ActivityAreaBusinessListProps {
  categoryId: string;
  subcategoryId: string;
  subcategoryName: string;
  businesses: BusinessPublicData[];
  Link: IdentityLink;
  Image: IdentityImage;
}

export function ActivityAreaBusinessList({
  categoryId,
  subcategoryId,
  subcategoryName,
  businesses,
  Link,
  Image,
}: ActivityAreaBusinessListProps) {
  return (
    <section
      id="negocios"
      className="mt-12 scroll-mt-24"
      aria-labelledby="activity-area-businesses-title"
    >
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h2
          id="activity-area-businesses-title"
          className="text-xl font-semibold"
        >
          Negócios da subcategoria
          {" "}
          {subcategoryName}
        </h2>
        {businesses.length > 0 && (
          <Link
            href={`/negocios?categoria=${encodeURIComponent(categoryId)}&subcategoria=${encodeURIComponent(subcategoryId)}&origem=activity_preview`}
            className="
              inline-flex min-h-11 items-center gap-2 font-semibold text-primary
              underline-offset-4
              hover:underline
            "
          >
            Ver todos os negócios
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        )}
      </div>
      {businesses.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Ainda não há negócios publicados nesta subcategoria.
        </p>
      )}
      <div className="
        grid gap-4
        md:grid-cols-2
        lg:grid-cols-3
      "
      >
        {businesses.map(business => (
          <Card key={business.id}>
            <CardHeader className="gap-4">
              <div className="flex items-center gap-3">
                <IdentityAvatar
                  Image={Image}
                  src={business.photoURL}
                  alt={business.title}
                  width={48}
                  height={48}
                  imageClassName="aspect-square size-full object-cover"
                  className="size-12"
                  fallback={<User aria-hidden="true" className="size-6" />}
                />
                <CardTitle className="text-lg">
                  <BusinessLink
                    href={businessCanonicalPath(business)}
                    source="activity_preview"
                    businessId={business.id}
                    categoryId={categoryId}
                    subcategoryId={subcategoryId}
                    className="hover:underline"
                  >
                    {business.title}
                  </BusinessLink>
                </CardTitle>
              </div>
              {business.description && (
                <p className="line-clamp-3 text-sm text-muted-foreground">
                  {business.description}
                </p>
              )}
              <BusinessAdministrationStatus
                isClaimable={business.isClaimable === true}
                badgeOnly
              />
            </CardHeader>
            <CardContent>
              <AdvertiserContactList
                contacts={business.contacts ?? []}
                sourcePath={businessCanonicalPath(business)}
                analytics={{
                  source: "activity_preview",
                  businessId: business.id,
                  categoryId,
                  subcategoryId,
                }}
              />
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
