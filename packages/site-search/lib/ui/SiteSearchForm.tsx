"use client";

import { useSiteSearchIntegration } from "./integration";
import { Search } from "lucide-react";
import { useId } from "react";
import { Button } from "@tudomacae/react-primitives/button";
import { Input } from "@tudomacae/react-primitives/input";
import {
  siteSearchFilterParameter,
  siteSearchQueryMaxLength,
  type SiteSearchFilter,
} from "../../search";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { siteSearchSubmittedEvent, type SiteSearchSurface } from "./siteSearchAnalytics";

/**
 * A plain GET form: the query lives in the shareable `/busca?q=` address and
 * works without JavaScript. A new query on the results page keeps its type filter. `ph-no-capture` keeps the field and its text out of
 * autocapture and session replay.
 */
export function SiteSearchForm(props: {
  surface: SiteSearchSurface;
  defaultQuery?: string;
  filter?: SiteSearchFilter;
  className?: string;
}) {
  const { capture } = useSiteSearchIntegration();
  const inputId = useId();
  return (
    <form
      role="search"
      action="/busca"
      method="get"
      aria-label="Buscar no Tudo Macaé"
      className={twMerge(clsx(`
        ph-no-capture flex w-full flex-wrap items-center gap-2
      `, props.className))}
      onSubmit={() => {
        const event = siteSearchSubmittedEvent(props.surface);
        capture?.(event.name, event.properties);
      }}
    >
      <label
        htmlFor={inputId}
        className={props.surface === "header"
          ? "sr-only"
          : `basis-full text-sm font-medium`}
      >
        O que você procura?
      </label>
      {props.filter && <input type="hidden" name="tipo" value={siteSearchFilterParameter(props.filter)} />}
      <Input
        id={inputId}
        name="q"
        type="search"
        required
        // `required` accepts spaces; the query needs one visible character.
        pattern=".*\S.*"
        title="Digite o que você procura."
        maxLength={siteSearchQueryMaxLength}
        defaultValue={props.defaultQuery}
        placeholder={props.surface === "header" ? "Buscar no site" : "Ex.: padaria, bicicleta, obras na Linha Verde"}
        autoComplete="off"
        enterKeyHint="search"
        className="ph-no-capture min-h-11 min-w-0 flex-1"
      />
      <Button type="submit" className="min-h-11 min-w-11" aria-label={props.surface === "header" ? "Buscar" : undefined}>
        <Search aria-hidden="true" className="size-4" />
        {props.surface === "page" && <span>Buscar</span>}
      </Button>
    </form>
  );
}
