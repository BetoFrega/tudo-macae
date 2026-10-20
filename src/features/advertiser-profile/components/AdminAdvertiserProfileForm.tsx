"use client";

import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";
import { AdminAdvertiserProfileForm as View } from "@tudomacae/advertiser-identity/ui";
import { IdentityIntegration } from "@/integrations/advertiser-identity/IdentityIntegration";
import { uploadProfilePhoto } from "../actions/uploadProfilePhoto";
import { adminCreateClaimableAdvertiserProfile } from "../actions/adminCreateClaimableAdvertiserProfile";
import { adminUpdateAdvertiserProfile } from "../actions/adminUpdateAdvertiserProfile";
import { AdminDeleteAdvertiserIdentity } from "./AdminDeleteAdvertiserIdentity";
import { adminDeleteClaimableAdvertiserProfile } from "../actions/adminDeleteClaimableAdvertiserProfile";

export default function AdminAdvertiserProfileForm(props: ComponentProps<typeof View>) {
  const navigation = useRouter();
  return (
    <IdentityIntegration commands={{ uploadPhoto: uploadProfilePhoto, adminCommands: { navigation, adminCreateClaimableAdvertiserProfile, adminUpdateAdvertiserProfile, adminDeleteClaimableAdvertiserProfile } }}>
      <View {...props} renderDeletion={disabled => props.profileId ? <AdminDeleteAdvertiserIdentity profileId={props.profileId} disabled={disabled} /> : null} />
    </IdentityIntegration>
  );
}
