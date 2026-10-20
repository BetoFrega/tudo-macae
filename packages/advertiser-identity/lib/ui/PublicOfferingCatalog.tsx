"use client";
import { useIdentityIntegrations } from "./context";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import type { OfferingPrice } from "../../offeringCatalog";
import { offeringPriceLabel } from "../../offeringPresentation";
interface PublicCatalog {
  items: {
    id: string;
    name: string;
    description: string;
    price: OfferingPrice;
  }[];
}
const publicCatalogSchema = z.object({ items: z.array(z.object({ id: z.string(), name: z.string(), description: z.string(), price: z.discriminatedUnion("mode", [z.object({ mode: z.literal("on_request") }), z.object({ mode: z.enum(["fixed", "from"]), cents: z.number().int().nonnegative() })]) })).max(100) });
export function PublicOfferingCatalog({ businessId, initial }: {
  businessId: string;
  initial: PublicCatalog;
}) {
  const { capture, readPublicOfferings } = useIdentityIntegrations();
  const [catalog, setCatalog] = useState<PublicCatalog | null>(initial);
  const viewed = useRef(false);
  const section = useRef<HTMLElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!viewed.current) {
      viewed.current = true;
      capture("business_offering_catalog_viewed", { source: "business_page" });
    }
    let active = true;
    let latestRefresh = 0;
    const controller = new AbortController();
    function withdraw(message: string) {
      if (section.current?.contains(document.activeElement)) status.current?.focus();
      setCatalog(null);
      setNotice(message);
    }
    async function refresh() {
      const request = ++latestRefresh;
      try {
        const response = await readPublicOfferings(businessId, AbortSignal.any([controller.signal, AbortSignal.timeout(3000)]));
        const parsed = publicCatalogSchema.safeParse(response);
        if (active && request === latestRefresh && !document.hidden) {
          if (parsed?.success) {
            setCatalog(parsed.data);
            setNotice("");
          }
          else withdraw("Este catálogo não está disponível agora.");
        }
      }
      catch {
        if (active && request === latestRefresh && !document.hidden) withdraw("Não foi possível atualizar o catálogo. Tente recarregar a página.");
      }
    }
    const interval = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, 15000);
    function visibility() {
      latestRefresh++;
      withdraw("Verificando catálogo…");
      if (!document.hidden)
        void refresh();
    }
    document.addEventListener("visibilitychange", visibility);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [businessId, capture, readPublicOfferings]);
  return (
    <div>
      <p ref={status} role="status" aria-live="polite" tabIndex={-1}>{notice}</p>
      {catalog && (
        <section
          ref={section}
          id="catalogo"
          aria-labelledby="offering-catalog-title"
          className="mt-10 scroll-mt-6"
        >
          <h2
            id="offering-catalog-title"
            className="text-2xl font-bold tracking-tight"
          >
            Catálogo do negócio
          </h2>
          <a
            href="#catalogo"
            className="
              inline-flex min-h-11 items-center text-sm text-primary underline
              underline-offset-4
              focus-visible:outline-2 focus-visible:outline-offset-2
              focus-visible:outline-primary
            "
          >
            Link direto para o catálogo
          </a>
          {catalog.items.length === 0
            ? <p>Nenhum item em exibição agora.</p>
            : (
                <ul className="mt-4 divide-y">
                  {catalog.items.map(item => (
                    <li
                      key={item.id}
                      className="
                        grid min-w-0 gap-3 py-6
                        sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-x-8
                      "
                    >
                      <div className="min-w-0">
                        <h3 className="text-lg font-semibold wrap-anywhere">{item.name}</h3>
                        {item.description && (
                          <p className="
                            mt-2 max-w-prose text-sm/relaxed wrap-anywhere
                            whitespace-pre-wrap
                          "
                          >
                            {item.description}
                          </p>
                        )}
                      </div>
                      <p className="font-semibold tabular-nums">{offeringPriceLabel(item.price)}</p>
                    </li>
                  ))}
                </ul>
              )}
        </section>
      )}
    </div>
  );
}
