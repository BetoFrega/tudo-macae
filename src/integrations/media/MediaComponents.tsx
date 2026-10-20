"use client";

import type { ComponentProps } from "react";
import { MediaForm as Form, MediaPicker as Picker, MediaPickerPreview as Preview, MediaLibraryCatalog as Catalog } from "@tudomacae/media/ui";
import { MediaIntegration } from "./MediaIntegration";

export function MediaForm(props: ComponentProps<typeof Form>) {
  return <MediaIntegration><Form {...props} /></MediaIntegration>;
}
export function MediaPicker(props: ComponentProps<typeof Picker>) {
  return <MediaIntegration><Picker {...props} /></MediaIntegration>;
}
export function MediaPickerPreview(props: ComponentProps<typeof Preview>) {
  return <MediaIntegration><Preview {...props} /></MediaIntegration>;
}
export function MediaLibraryCatalog(props: ComponentProps<typeof Catalog>) {
  return <MediaIntegration><Catalog {...props} /></MediaIntegration>;
}
