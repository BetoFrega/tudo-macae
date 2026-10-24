"use client";

import Image from "@/components/ui/image";
import Link from "next/link";
import posthog from "posthog-js";
import type { ReactNode } from "react";
import { MediaProvider, type MediaIntegrations } from "@tudomacae/media/ui";
import { createMedia } from "@/features/media/createMedia";
import { updateMedia } from "@/features/media/actions/updateMedia";
import { getMediaOptionById } from "@/features/media/actions/getMediaOptions";
import { publicImageRuntimeContext } from "@/integrations/public-images/runtimeContext";

const integrations: MediaIntegrations = {
  Image: props => <Image {...props} alt={props.alt} unoptimized />,
  Link,
  create: createMedia,
  update: updateMedia,
  resolve: getMediaOptionById,
  capture: (event, properties) => posthog.capture(event, properties),
  reportFailure(event, operation) {
    const pathname = typeof window === "undefined" ? "" : window.location.pathname;
    let route = "other";
    if (pathname.startsWith("/redacao/acervo")) route = "/redacao/acervo";
    else if (pathname.startsWith("/redacao/materias/")) route = "/redacao/materias/[id]";
    else if (pathname.startsWith("/redacao/pautas/")) route = "/redacao/pautas/[id]";
    else if (pathname.startsWith("/admin/midias")) route = "/admin/midias";
    console.error(JSON.stringify({
      event, ...publicImageRuntimeContext(), service: "browser", route,
      statusClass: "unknown", executionId: crypto.randomUUID(), operation, outcome: "error",
    }));
  },
};
export function MediaIntegration({ children }: { children: ReactNode }) {
  return <MediaProvider integrations={integrations}>{children}</MediaProvider>;
}
