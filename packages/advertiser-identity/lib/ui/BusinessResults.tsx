"use client";
import { useIdentityIntegrations } from "./context";

import { LoaderCircle, Plus } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import type { BusinessCategory as Category } from "../../taxonomy";
import type { BusinessPublicData } from "../../business";
import { Button } from "@tudomacae/react-primitives/button";
import { BusinessCard } from "./BusinessCard";
import { resolveBusinessActivities } from "../../resolveBusinessActivities";

interface BusinessPage {
  items: BusinessPublicData[];
  nextCursor?: string;
}

interface BusinessResultsProps {
  initialPage: BusinessPage;
  categories: Category[];
  source: string;
  categoryId?: string;
  subcategoryId?: string;
}

// Next 16 keeps a visited list mounted, so its "Carregar mais" batches return
// with back navigation and with links to the same list. vinext remounts the
// page, so the batches live here for the document's lifetime; a reload starts
// from the first page under both renderers.
const loadedPages = new Map<string, BusinessPage>();

function restoredPage(stored: BusinessPage | undefined, initialPage: BusinessPage) {
  const extendsInitialPage = stored !== undefined
    && stored.items.length > initialPage.items.length
    && initialPage.items.every((item, index) => stored.items[index]?.id === item.id);
  return extendsInitialPage ? stored : undefined;
}

function subscribeToNothing() {
  return () => {};
}

function useRetainedPage(listKey: string, initialPage: BusinessPage) {
  // The server snapshot keeps hydration on the first page; the client snapshot
  // restores the batches in the same render, before the browser restores scroll.
  const stored = useSyncExternalStore(
    subscribeToNothing,
    () => loadedPages.get(listKey),
    () => undefined,
  );
  const [loadedPage, setLoadedPage] = useState<BusinessPage>();
  const page = loadedPage ?? restoredPage(stored, initialPage) ?? initialPage;

  function appendPage(nextPage: BusinessPage) {
    setLoadedPage((current = page) => {
      const loaded = {
        items: [...current.items, ...nextPage.items],
        ...(nextPage.nextCursor ? { nextCursor: nextPage.nextCursor } : {}),
      };
      loadedPages.set(listKey, loaded);
      return loaded;
    });
  }

  return [page, appendPage] as const;
}

export function BusinessResults({
  initialPage,
  categories,
  source,
  categoryId,
  subcategoryId,
}: BusinessResultsProps) {
  const integrations = useIdentityIntegrations();
  const [page, appendPage] = useRetainedPage(
    `${categoryId ?? ""}:${subcategoryId ?? ""}`,
    initialPage,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function loadMore() {
    if (!page.nextCursor || pending) return;
    const controller = new AbortController();
    setPending(true);
    setError(undefined);
    try {
      const nextPage = await integrations.readBusinesses({
        cursor: page.nextCursor,
        ...(categoryId ? { categoryId } : {}),
        ...(subcategoryId ? { subcategoryId } : {}),
      }, controller.signal);
      appendPage(nextPage);
    }
    catch {
      setError("Não foi possível carregar mais negócios. Tente novamente.");
    }
    finally {
      setPending(false);
    }
  }

  if (page.items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed px-6 py-10 text-center">
        <h3 className="text-xl font-semibold">Ainda não há negócios aqui</h3>
        <p className="mx-auto mt-2 max-w-md text-muted-foreground">
          Explore outra categoria ou volte em breve.
        </p>
      </div>
    );
  }

  return (
    <>
      <p
        aria-live="polite"
        className="mb-5 text-sm text-muted-foreground tabular-nums"
      >
        {page.items.length}
        {" "}
        {page.items.length === 1 ? "negócio exibido" : "negócios exibidos"}
      </p>
      <div>
        {page.items.map(business => (
          <BusinessCard
            Image={integrations.Image}
            key={business.id}
            business={business}
            activities={resolveBusinessActivities(business.activityAreas, categories)}
            source={source}
          />
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-5 text-sm font-medium text-destructive">
          {error}
        </p>
      )}
      {page.nextCursor && (
        <div className="mt-8 flex justify-center">
          <Button
            type="button"
            size="lg"
            disabled={pending}
            onClick={loadMore}
          >
            {pending
              ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="
                      animate-spin
                      motion-reduce:animate-none
                    "
                  />
                )
              : <Plus aria-hidden="true" />}
            {pending ? "Carregando negócios" : "Carregar mais negócios"}
          </Button>
        </div>
      )}
    </>
  );
}
