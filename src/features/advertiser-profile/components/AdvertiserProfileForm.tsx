"use client";

import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";
import { AdvertiserProfileForm as View } from "@tudomacae/advertiser-identity/ui";
import { IdentityIntegration } from "@/integrations/advertiser-identity/IdentityIntegration";
import { uploadProfilePhoto } from "../actions/uploadProfilePhoto";
import { createAdvertiserProfile } from "../actions/createAdvertiserProfile";
import { updateAdvertiserProfile } from "../actions/updateAdvertiserProfile";
import { classifyAdvertiserProfile } from "../actions/classifyAdvertiserProfile";
import { notifyAccountReminderChanged } from "@/features/authentication/accountReminderEvents";

export default function AdvertiserProfileForm(props: ComponentProps<typeof View>) {
  const navigation = useRouter();
  return (
    <IdentityIntegration commands={{ uploadPhoto: uploadProfilePhoto, profileCommands: { navigation, createAdvertiserProfile, updateAdvertiserProfile, classifyAdvertiserProfile, notifyAccountReminderChanged } }}>
      <View {...props} />
    </IdentityIntegration>
  );
}
