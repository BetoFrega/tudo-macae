import { User } from "lucide-react";
import { IdentityAvatar } from "./IdentityAvatar";
import { Card, CardHeader, CardTitle } from "@tudomacae/react-primitives/card";

import { PublicAdvertiserProfileData } from "../../model";
import type { IdentityImage } from "./rendering";
import { AdvertiserContactList } from "./AdvertiserContactList";
import { PublicInformationNotice } from "./PublicInformationNotice";

interface AdvertiserProfileHeaderProps {
  Image: IdentityImage;
  profile: PublicAdvertiserProfileData;
  sourcePath: string;
}

export function AdvertiserProfileHeader({
  profile,
  Image,
  sourcePath,
}: AdvertiserProfileHeaderProps) {
  const title = profile.title || "Anunciante sem nome";

  return (
    <Card className="mx-auto max-w-3xl">
      <CardHeader className="pb-4">
        <div className="flex min-w-0 flex-wrap items-center gap-4">
          <IdentityAvatar
            Image={Image}
            src={profile.photoURL}
            alt={title}
            width={64}
            height={64}
            imageClassName="aspect-square size-full"
            className="size-16"
            fallback={<User className="size-8" />}
          />
          {/* The 12rem basis wraps the text below the avatar once text zoom leaves it narrower. */}
          <div className="min-w-0 grow basis-48">
            <CardTitle className="text-2xl wrap-anywhere">{title}</CardTitle>
            {profile.isClaimable && <PublicInformationNotice />}
            {profile.description && (
              <p className="mt-2 wrap-anywhere text-muted-foreground">{profile.description}</p>
            )}
            <AdvertiserContactList
              contacts={profile.contacts ?? []}
              sourcePath={sourcePath}
              fitWithinParent
            />
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}
