import { IdentityAvatar } from "./IdentityAvatar";
import { Button } from "@tudomacae/react-primitives/button";
import { Card, CardContent, CardHeader } from "@tudomacae/react-primitives/card";
import { AdvertiserContactList } from "./AdvertiserContactList";
import { PublicInformationNotice } from "./PublicInformationNotice";
import { User } from "lucide-react";
import type { IdentityLink } from "./rendering";
import React from "react";
import { businessCanonicalPath } from "../../businessPresentation";
import type { IdentityImage } from "./rendering";

import type { PublicAdvertiserProfileData } from "../../model";
import type { BusinessPublicData } from "../../business";

export function AdvertiserProfileAside({ profile, business, sourcePath, Link, Image }: {
  profile: PublicAdvertiserProfileData | null;
  business: BusinessPublicData | null;
  sourcePath: string;
  Link: IdentityLink;
  Image: IdentityImage;
}) {
  if (!profile) {
    return null;
  }

  const title = profile.title || "Anunciante sem nome";

  return (
    <Card className="border-primary/20 bg-muted/5" role="complementary">
      <CardHeader>
        <h3 className="text-lg font-semibold">Negócio</h3>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center gap-4">
          <IdentityAvatar
            Image={Image}
            src={profile.photoURL}
            alt={title}
            width={64}
            height={64}
            imageClassName="aspect-square size-full object-cover"
            className="size-16 border-2 border-background shadow-sm"
            fallback={<User className="size-8 text-muted-foreground" />}
          />
          <div>
            <h4 className="text-lg font-semibold">{title}</h4>
            {profile.description && (
              <p className="line-clamp-2 text-sm text-muted-foreground">
                {profile.description}
              </p>
            )}
          </div>
        </div>

        {profile.isClaimable && <PublicInformationNotice compact />}

        <div className="space-y-4 border-t pt-4">
          <AdvertiserContactList
            contacts={profile.contacts ?? []}
            sourcePath={sourcePath}
          />
        </div>

        {business && (
          <Link href={businessCanonicalPath(business)} className="block">
            <Button variant="outline" className="w-full">
              Ver negócio completo
            </Button>
          </Link>
        )}

      </CardContent>
    </Card>
  );
}
