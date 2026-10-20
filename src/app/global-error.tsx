"use client";

import { useEffect } from "react";
import { unstable_isUnrecognizedActionError } from "next/navigation";
import posthog from "posthog-js";
import { Button } from "@/components/ui/button";

type GlobalErrorProps = Readonly<{
  error: Error & { digest?: string };
  retry: () => void;
}>;

function reloadDocument() {
  window.location.reload();
}

export function GlobalErrorView({
  error,
  retry,
  reload = reloadDocument,
}: GlobalErrorProps & { reload?: () => void }) {
  const deploymentMismatch = unstable_isUnrecognizedActionError(error);
  const digest = error.digest;
  const errorReference = typeof digest === "string" && digest.length > 0
    && digest.length <= 20 && !/\D/u.test(digest)
    ? digest
    : undefined;

  useEffect(() => {
    posthog.captureException(error);

    if (deploymentMismatch) reload();
  }, [deploymentMismatch, error, reload]);

  if (deploymentMismatch) {
    return (
      <html lang="pt-BR">
        <body>
          <p className="sr-only" role="status">Atualizando a aplicação…</p>
        </body>
      </html>
    );
  }

  return (
    <html lang="pt-BR">
      <body>
        <main className="mx-auto flex min-h-screen max-w-2xl items-center px-6">
          <section className={`
            w-full rounded-xl border border-dashed p-8 text-center
          `}
          >
            <h1 className="text-2xl font-semibold">Algo deu errado</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Não foi possível concluir esta ação. Tente novamente.
            </p>
            {errorReference && (
              <p className="mt-3 text-sm text-muted-foreground">
                Referência do erro:
                {" "}
                <code className="break-all select-all">{errorReference}</code>
              </p>
            )}
            <Button className="mt-5" onClick={retry}>
              Tentar novamente
            </Button>
          </section>
        </main>
      </body>
    </html>
  );
}

export default function GlobalError(props: GlobalErrorProps) {
  return <GlobalErrorView {...props} />;
}
