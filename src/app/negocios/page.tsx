import { siteSearchResultTypeMeta } from "@tudomacae/site-search/search";
import type { Metadata } from "next";
import { ArrowLeft, ChevronDown } from "lucide-react";
import Link from "next/link";
import type { Category } from "@tudomacae/categories/model";
import { getCategories } from "@/features/categories/actions/getCategories";
import {
  analyticsActivityArea,
  catalogFilter,
  catalogHeading,
  resolveCatalogSelection,
  selectionKey,
  type CatalogSelection,
} from "@/features/business/businessCatalogSelection";
import { BusinessCatalogGateway } from "@/features/business/BusinessCatalogGateway";
import { BusinessCreationCta } from "@/features/business/BusinessCreationCta";
import { BusinessResults } from "@/features/business/BusinessResults";
import { BusinessCatalogAnalytics } from "@/features/business/BusinessTracking";
import { listBusinessesUseCase } from "@/packages/classifieds-api";
import { normalizeBusinessAnalyticsSource } from "@/features/business/businessAnalytics";
import { getBusinessCatalogCategories } from "@/features/business/getBusinessCatalogCategories";
import { connection } from "next/server";
import { Suspense } from "react";
import { Loading } from "@/components/ui/loading";
import { registrationVisible } from "@/integrations/advertiser-identity/registrationVisibility";

export const metadata: Metadata = {
  other: siteSearchResultTypeMeta("page"),
  title: "Catálogo de negócios em Macaé | Tudo Macaé",
  description: "Explore lojas, serviços e profissionais de Macaé por categoria e fale diretamente com cada negócio.",
  referrer: "origin",
  alternates: { canonical: "/negocios" },
};

interface BusinessCatalogPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function value(input: string | string[] | undefined) {
  return Array.isArray(input) ? input[0] : input;
}

export default function BusinessCatalogPage(props: BusinessCatalogPageProps) {
  return <Suspense fallback={<Loading className="min-h-96" />}><BusinessCatalogContent {...props} /></Suspense>;
}

async function BusinessCatalogContent({ searchParams }: BusinessCatalogPageProps) {
  await connection();
  const visibility = registrationVisible();
  const params = await searchParams;
  const cursor = value(params.cursor);
  const source = normalizeBusinessAnalyticsSource(value(params.origem));
  const categories = await getCategories();
  const catalogCategories = await getBusinessCatalogCategories(categories);
  const selection = resolveCatalogSelection(
    categories,
    value(params.categoria),
    value(params.subcategoria),
  );
  const page = await listBusinessesUseCase({
    ...catalogFilter(selection),
    ...(!cursor ? {} : { cursor }),
  });
  const visible = await visibility;

  return (
    <main className="
      container mx-auto px-4 py-6
      sm:py-8
    "
    >
      <BusinessCatalogAnalytics source={source} {...analyticsActivityArea(selection)} />
      <div className="
        grid gap-8
        lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-10
        xl:grid-cols-[minmax(0,1fr)_20rem]
      "
      >
        <div className="min-w-0">
          <CatalogHeader selection={selection} />
          <MobileCategoryExplorer
            key={selectionKey(selection)}
            categories={catalogCategories}
            category={selection.category}
          />
          {/* A filtered visit lands on its results, so the phone CTA must not push them below the fold. */}
          {!selection.category && <CatalogRegistration position="main" visible={visible} />}
          <CatalogResults categories={categories} page={page} selection={selection} />
          {selection.category && <CatalogRegistration position="main" visible={visible} />}
        </div>
        <CatalogSidebar
          categories={catalogCategories}
          category={selection.category}
          visible={visible}
        />
      </div>
    </main>
  );
}

function CatalogHeader({ selection: { category, subcategory } }: { selection: CatalogSelection }) {
  return (
    <header className="max-w-3xl">
      <h1
        className="
          scroll-mt-36 text-3xl font-bold tracking-tight text-balance
          sm:text-4xl
        "
        id="business-results-title"
      >
        {catalogHeading({ category, subcategory })}
      </h1>
      <p className="mt-2 text-muted-foreground">
        Explore lojas, serviços e profissionais que atendem em Macaé.
      </p>
      {category && (
        <p className="mt-2 text-sm font-medium text-primary">
          {category.name}
          {subcategory && ` / ${subcategory.name}`}
        </p>
      )}
    </header>
  );
}

interface CatalogGatewayProps {
  categories: Category[];
  category: Category | undefined;
}

function CatalogGateway({ categories, category }: CatalogGatewayProps) {
  return (
    <BusinessCatalogGateway
      key={category?.id ?? "all"}
      categories={categories}
      source="catalog"
      {...(category ? { initialCategoryId: category.id } : {})}
    />
  );
}

function MobileCategoryExplorer(props: CatalogGatewayProps) {
  return (
    <details
      className="
        group mt-5 rounded-xl border border-border bg-muted/40
        lg:hidden
      "
    >
      <summary className="
        flex min-h-12 cursor-pointer list-none items-center justify-between
        gap-3 rounded-xl px-4 font-semibold text-primary
        focus-visible:outline-2 focus-visible:outline-offset-4
        focus-visible:outline-primary
        [&::-webkit-details-marker]:hidden
      "
      >
        Explorar categorias
        <ChevronDown
          aria-hidden="true"
          className="
            size-5 transition-transform
            group-open:rotate-180
            motion-reduce:transition-none
          "
        />
      </summary>
      <div className="border-t border-border px-4 pt-3 pb-4">
        <CatalogGateway {...props} />
      </div>
    </details>
  );
}

interface CatalogResultsProps {
  categories: Category[];
  page: Awaited<ReturnType<typeof listBusinessesUseCase>>;
  selection: CatalogSelection;
}

function CatalogResults({ categories, page, selection }: CatalogResultsProps) {
  const { category, subcategory } = selection;
  return (
    <section aria-label="Resultados" className="mt-6">
      <div className="
        mb-6 flex flex-wrap items-end justify-between gap-3 border-b
        border-foreground/20 pb-4
      "
      >
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Resultados
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Em ordem alfabética, sem destaques pagos.
          </p>
        </div>
        {subcategory && (
          <Link
            href="/negocios"
            className="
              inline-flex min-h-11 items-center gap-2 font-medium text-primary
              underline-offset-4
              hover:underline
              focus-visible:outline-2 focus-visible:outline-offset-4
              focus-visible:outline-primary
            "
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Ver todos os negócios
          </Link>
        )}
      </div>

      <BusinessResults
        key={selectionKey(selection)}
        initialPage={page}
        categories={categories}
        source="catalog"
        {...(category ? { categoryId: category.id } : {})}
        {...(subcategory ? { subcategoryId: subcategory.id } : {})}
      />
    </section>
  );
}

function CatalogSidebar({ visible, ...gateway }: CatalogGatewayProps & { visible: boolean }) {
  return (
    <aside className="space-y-6">
      <section
        aria-label="Explorar negócios por categoria"
        className="
          hidden rounded-xl bg-muted/60 p-5
          lg:block
        "
      >
        <CatalogGateway {...gateway} />
      </section>
      <CatalogRegistration position="sidebar" visible={visible} />
      <div className="border-t pt-6 text-sm text-muted-foreground">
        <p className="font-semibold text-foreground">Como funciona este catálogo</p>
        <p className="mt-2 leading-6">
          O catálogo reúne contatos informados pelos negócios e dados públicos. O Tudo Macaé não recomenda nem verifica os negócios listados.
        </p>
      </div>
    </aside>
  );
}

function CatalogRegistration({ position, visible }: { position: "main" | "sidebar"; visible: boolean }) {
  if (position === "main") return visible
    ? (
        <div className="
          mt-6
          lg:hidden
        "
        >
          <BusinessCreationCta promoted />
        </div>
      )
    : null;
  return (
    <div className={visible
      ? `
        hidden
        lg:block
      `
      : undefined}
    >
      <BusinessCreationCta promoted={visible} />
    </div>
  );
}
