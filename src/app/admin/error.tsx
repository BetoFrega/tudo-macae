"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import { Button } from "@/components/ui/button";

const reportedClientErrors = new WeakSet<Error>();

function reportClientFailure(error: Error & { digest?: string }) {
  // Digested failures were reported at the server request boundary.
  if (error.digest || reportedClientErrors.has(error)) return;
  reportedClientErrors.add(error);
  posthog.capture("admin_render_failed", {
    component: "AdminError",
    route: "/admin",
    service: "browser",
    environment: process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_APP_RELEASE ?? "unknown",
    outcome: "error",
    $process_person_profile: false,
    $current_url: null,
    $pathname: null,
    $referrer: null,
  });
}

export default function AdminError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    reportClientFailure(error);
  }, [error]);

  return (
    <section className="space-y-4 rounded-sm border border-destructive/30 p-6" role="alert">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold">Não foi possível carregar a Administração</h2>
        <p className="text-muted-foreground">
          Tente novamente. Se o problema continuar, volte ao painel antes de repetir a operação.
        </p>
      </div>
      <Button type="button" onClick={retry}>Tentar novamente</Button>
    </section>
  );
}
