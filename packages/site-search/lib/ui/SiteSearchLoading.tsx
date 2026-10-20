"use client";

import { useEffect, useState } from "react";

const longWaitMessage = "A busca está levando mais tempo que o normal. Você ainda pode ajustar sua busca.";

function PlaceholderRow() {
  return (
    <li className="py-4">
      <div className="
        h-4 w-20 rounded-sm bg-muted
        motion-safe:animate-pulse
        motion-reduce:animate-none
      "
      />
      <div className="
        mt-1 h-11 w-2/3 rounded-sm bg-muted
        motion-safe:animate-pulse
        motion-reduce:animate-none
      "
      />
      <div className="
        mt-1 h-6 w-full rounded-sm bg-muted
        motion-safe:animate-pulse
        motion-reduce:animate-none
      "
      />
      <div className="
        h-6 w-5/6 rounded-sm bg-muted
        motion-safe:animate-pulse
        motion-reduce:animate-none
      "
      />
    </li>
  );
}

export function SiteSearchLoading() {
  const [isLongWait, setIsLongWait] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsLongWait(true), 3_000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="ph-no-capture mt-8">
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {isLongWait ? longWaitMessage : "Buscando…"}
      </p>
      <section
        role="region"
        aria-label="Resultados da busca"
        aria-busy="true"
        className="min-h-80"
      >
        <div aria-hidden="true" className="min-h-124">
          <div className="
            h-7 w-1/2 rounded-sm bg-muted
            motion-safe:animate-pulse
            motion-reduce:animate-none
          "
          />
          <ol className="mt-4 divide-y divide-border border-y">
            <PlaceholderRow />
            <PlaceholderRow />
            <PlaceholderRow />
          </ol>
        </div>
      </section>
    </div>
  );
}
