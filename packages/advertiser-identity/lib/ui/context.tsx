"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { BusinessPublicData } from "../../business";
import type { AdvertiserIdentityType } from "../../model";
import type { OfferingCatalogState, OfferingFieldErrors } from "../../offeringCatalog";
import type { UploadProfilePhotoResult } from "../../photo";
import type { IdentityImage, IdentityLink } from "./rendering";

interface Navigation {
  push(path: string): void;
  refresh(): void;
}
export interface ProfileCommands {
  navigation: Navigation;
  createAdvertiserProfile(form: FormData): Promise<
    { success: true; profileId: string; revision: number }
    | { success: false; outcome: "already_created"; profileId: string }
    | { success: false; outcome: "personal_exists" }
  >;
  updateAdvertiserProfile(id: string, form: FormData): Promise<
    { success: true; revision: number }
    | { success: false; outcome: "conflict"; currentRevision: number }
  >;
  classifyAdvertiserProfile(id: string, identityType: AdvertiserIdentityType): Promise<
    { success: true }
    | { success: false; outcome: "personal_exists" | "already_classified" }
  >;
  notifyAccountReminderChanged(): void;
}
export interface AdminCommands {
  navigation: Navigation;
  adminCreateClaimableAdvertiserProfile(form: FormData): Promise<
    { success: true; profileId: string; revision: number }
    | { success: false; duplicates: { id: string; title: string }[]; confirmationToken: string }
  >;
  adminUpdateAdvertiserProfile(id: string, form: FormData): Promise<{ success: true; revision: number }>;
  adminDeleteClaimableAdvertiserProfile(id: string, revision: number, key: string): Promise<{ success: true } | { success: false; error: string }>;
}
export interface CreationCta {
  signedIn: boolean;
  loading: boolean;
  navigate(path: string): void;
  requestSignIn(continuation: () => void): void;
}
export interface OfferingCommands {
  changeOfferingCatalog(id: string, revision: number, form: FormData): Promise<
    { state: OfferingCatalogState } | { error: string; fieldErrors?: OfferingFieldErrors }
  >;
}
export type PhotoUpload = (id: string, revision: number, form: FormData) => Promise<UploadProfilePhotoResult>;
export interface BusinessPage {
  items: BusinessPublicData[];
  nextCursor?: string;
}
export interface IdentityIntegrations {
  Link: IdentityLink;
  Image: IdentityImage;
  origin: string;
  capture(event: string, properties: Record<string, unknown>): void;
  readBusinesses(input: { cursor: string; categoryId?: string; subcategoryId?: string }, signal: AbortSignal): Promise<BusinessPage>;
  readPublicOfferings(id: string, signal: AbortSignal): Promise<unknown>;
  profileCommands?: ProfileCommands;
  adminCommands?: AdminCommands;
  creationCta?: CreationCta;
  offeringCommands?: OfferingCommands;
  uploadPhoto?: PhotoUpload;
}
const Context = createContext<IdentityIntegrations | null>(null);
export function IdentityProvider({ integrations, children }: { integrations: IdentityIntegrations; children: ReactNode }) {
  return <Context.Provider value={integrations}>{children}</Context.Provider>;
}
export function useIdentityIntegrations() {
  const integrations = useContext(Context);
  if (!integrations) throw new Error("Identity UI requires IdentityProvider");
  return integrations;
}
function required<T>(value: T | undefined, capability: string): T {
  if (!value) throw new Error(`IdentityProvider requires ${capability}`);
  return value;
}
export const useProfileCommands = () => required(useIdentityIntegrations().profileCommands, "profile commands");
export const useAdminCommands = () => required(useIdentityIntegrations().adminCommands, "administration commands");
export const useCreationCta = () => required(useIdentityIntegrations().creationCta, "creation CTA");
export const useOfferingCommands = () => required(useIdentityIntegrations().offeringCommands, "offering commands");
export const usePhotoUpload = () => required(useIdentityIntegrations().uploadPhoto, "photo upload");
