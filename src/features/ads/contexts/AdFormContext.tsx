"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { createAd } from "@/features/ads/actions/createAd";
import { updateAd } from "@/features/ads/actions/updateAd";
import { uploadAdImage } from "@/features/ads/actions/uploadAdImage";
import type { AdvertiserProfileData } from "@tudomacae/advertiser-identity/model";
import type { Category } from "@tudomacae/categories/model";

type CreateAdResult = Awaited<ReturnType<typeof createAd>>;
type UpdateAdResult = Awaited<ReturnType<typeof updateAd>>;
type UploadImageResult = Awaited<ReturnType<typeof uploadAdImage>>;

export interface AdFormActions {
  createAd: (formData: FormData) => Promise<CreateAdResult>;
  updateAd: (adId: string, formData: FormData) => Promise<UpdateAdResult>;
  uploadAdImage: (adId: string, formData: FormData) => Promise<UploadImageResult>;
}

export interface AdFormState {
  profiles: AdvertiserProfileData[];
  categories: Category[];
  profileManagementHref?: string | undefined;
}

interface AdFormContextType extends AdFormState {
  actions: AdFormActions;
}

const AdFormContext = createContext<AdFormContextType | null>(null);

interface AdFormProviderProps extends AdFormState {
  children: ReactNode;
  actions?: AdFormActions;
}

export function AdFormProvider({
  children,
  profiles,
  categories,
  profileManagementHref,
  actions,
}: AdFormProviderProps) {
  const value = useMemo(
    () => ({
      profiles,
      categories,
      profileManagementHref,
      actions: actions || {
        createAd,
        updateAd,
        uploadAdImage,
      },
    }),
    [profiles, categories, profileManagementHref, actions],
  );

  return (
    <AdFormContext.Provider value={value}>{children}</AdFormContext.Provider>
  );
}

export function useAdFormContext() {
  const context = useContext(AdFormContext);
  if (!context) {
    throw new Error("useAdFormContext must be used within an AdFormProvider");
  }
  return context;
}
