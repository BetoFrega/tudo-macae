import { ChevronRight, UserRound } from "lucide-react";
import type { IdentityImage } from "./rendering";
import { IdentityAvatar } from "./IdentityAvatar";
import { businessCanonicalPath } from "../../businessPresentation";
import type { BusinessPublicData } from "../../business";
import { AdvertiserContactList } from "./AdvertiserContactList";
import { BusinessLink } from "./BusinessTracking";
import { BusinessAdministrationStatus } from "./BusinessAdministrationStatus";

import type { ResolvedBusinessActivity } from "../../businessPresentation";

export function BusinessCard({
  business,
  Image,
  activities,
  source,
  href = businessCanonicalPath(business),
}: {
  Image: IdentityImage;
  business: BusinessPublicData;
  activities: ResolvedBusinessActivity[];
  source: string;
  href?: string;
}) {
  const selected = activities[0];
  return (
    <article className="
      group border-b border-border py-6
      first:pt-0
    "
    >
      <div className="
        grid grid-cols-[3rem_minmax(0,1fr)] items-start gap-x-4 gap-y-3
        sm:grid-cols-[4rem_minmax(0,1fr)]
        xl:grid-cols-[4rem_minmax(0,1fr)_auto]
      "
      >
        <IdentityAvatar
          Image={Image}
          src={business.photoURL}
          alt={business.title}
          width={64}
          height={64}
          imageClassName="aspect-square size-full object-cover"
          fallbackClassName="rounded-xl bg-primary/10 text-primary"
          fallback={<UserRound aria-hidden="true" className="size-7" />}
          className="
            size-12 rounded-xl
            sm:size-16
          "
        />

        <div className="min-w-0">
          <BusinessLink
            href={href}
            source={source}
            businessId={business.id}
            {...(selected
              ? { categoryId: selected.categoryId, subcategoryId: selected.subcategoryId }
              : {})}
            className="
              inline-flex max-w-full items-center gap-2 rounded-sm text-xl
              font-semibold tracking-tight wrap-anywhere underline-offset-4
              hover:underline
              focus-visible:outline-2 focus-visible:outline-offset-4
              focus-visible:outline-primary
            "
          >
            {business.title}
            <ChevronRight
              aria-hidden="true"
              className="
                size-4 shrink-0 text-primary transition-transform
                group-hover:translate-x-0.5
                motion-reduce:transition-none
              "
            />
          </BusinessLink>
          {business.description && (
            <p className="
              mt-2 max-w-[70ch] text-sm/6 wrap-anywhere text-muted-foreground
            "
            >
              {business.description}
            </p>
          )}
          {activities.length > 0 && (
            <ul
              aria-label="Áreas de atuação"
              className="
                mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm wrap-anywhere
              "
            >
              {activities.map(activity => (
                <li key={`${activity.categoryId}:${activity.subcategoryId}`}>
                  <a
                    href={activity.href}
                    aria-label={`${activity.categoryName}: ${activity.subcategoryName}`}
                    className="
                      rounded-sm font-medium text-primary underline-offset-4
                      hover:underline
                      focus-visible:outline-2 focus-visible:outline-offset-4
                      focus-visible:outline-primary
                    "
                  >
                    <span className="text-muted-foreground">{activity.categoryName}</span>
                    <span aria-hidden="true"> › </span>
                    {activity.subcategoryName}
                  </a>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3">
            <BusinessAdministrationStatus
              isClaimable={business.isClaimable === true}
              badgeOnly
            />
          </div>
        </div>

        <div className="
          col-start-2 min-w-0
          xl:col-start-auto xl:max-w-48
          [&_a]:min-h-11 [&_a]:rounded-md [&_a]:px-2
          [&_a]:focus-visible:outline-2 [&_a]:focus-visible:outline-offset-2
          [&_a]:focus-visible:outline-primary
          [&>div]:mt-0 [&>div]:gap-2
          [&>p]:mt-0
        "
        >
          <AdvertiserContactList
            {...(business.contacts ? { contacts: business.contacts } : {})}
            sourcePath={href}
            analytics={{
              source,
              businessId: business.id,
              ...(selected
                ? { categoryId: selected.categoryId, subcategoryId: selected.subcategoryId }
                : {}),
            }}
          />
        </div>
      </div>
    </article>
  );
}
