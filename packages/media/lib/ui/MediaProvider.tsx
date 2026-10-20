"use client";

import { createContext, useContext, type ComponentType, type ReactNode } from "react";
import type { CreateMediaResult, UpdateMediaFormInput, UpdateMediaResult } from "../../form";
import type { MediaOption } from "../../options";

export interface MediaImageProps {
  src: string;
  alt: string;
  fill?: boolean;
  loading?: "lazy" | "eager";
  className?: string;
  sizes?: string;
}
export interface MediaLinkProps { href: string; children: ReactNode }
export interface MediaIntegrations {
  Image: ComponentType<MediaImageProps>;
  Link: ComponentType<MediaLinkProps>;
  create(formData: FormData): Promise<CreateMediaResult>;
  update(input: UpdateMediaFormInput): Promise<UpdateMediaResult>;
  resolve(mediaId: string): Promise<MediaOption | null>;
  capture(event: "media_registered", properties: { media_kind?: string; registration_source: "upload" | "existing_media" }): void;
  reportFailure(event: string, operation: string): void;
}
const MediaContext = createContext<MediaIntegrations | null>(null);
export function MediaProvider({ integrations, children }: { integrations: MediaIntegrations; children: ReactNode }) {
  return <MediaContext.Provider value={integrations}>{children}</MediaContext.Provider>;
}
export function useMediaIntegrations() {
  const value = useContext(MediaContext);
  if (!value) throw new Error("MediaProvider is required for the Media interface.");
  return value;
}
