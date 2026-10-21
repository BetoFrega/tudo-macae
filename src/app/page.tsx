import { ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Loading } from "@/components/ui/loading";
import AdList from "@/features/ads/components/AdList";
import { getCategories } from "@/features/categories/actions/getCategories";
import { BusinessCreationButton } from "@/features/business/BusinessCreationCta";
import { registrationVisible } from "@/integrations/advertiser-identity/registrationVisibility";
import { HomepageCategoryNav } from "@/features/navigation/HomepageCategoryNav";

import { siteSearchResultTypeMeta } from "@tudomacae/site-search/search";

export const metadata: Metadata = {
  other: siteSearchResultTypeMeta("page"),
};

export default function Home() {
  return (
    <main className="
      container mx-auto px-4 py-8
      sm:py-10
    "
    >
      <section
        id="classificados"
        aria-labelledby="home-discovery"
        className="
          scroll-mt-36 border-t border-foreground/20 py-8
          sm:py-10
        "
      >
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            {/* At 320px and 200% text, wide fallback fonts make "Encontre" wider than the column. */}
            <h1
              id="home-discovery"
              className="
                text-3xl font-bold tracking-tight wrap-anywhere
                sm:text-4xl
              "
            >
              Encontre em Macaé
            </h1>
            <p className="mt-2 max-w-2xl text-base/7 text-muted-foreground">
              Escolha uma categoria para conhecer negócios locais e ver anúncios publicados agora.
            </p>
          </div>
          <Link
            href="/negocios?origem=home"
            className="
              inline-flex min-h-11 items-center gap-2 font-semibold text-primary
              underline-offset-4
              hover:underline
            "
          >
            Ver catálogo de negócios
            <ArrowUpRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
        <div className="
          rounded-2xl bg-muted/60 p-5
          sm:p-7
        "
        >
          <Suspense fallback={<p role="status">Carregando categorias…</p>}>
            <HomeCategories />
          </Suspense>
        </div>

        <div className="
          mt-8 grid items-start gap-8
          lg:grid-cols-12 lg:gap-10
        "
        >
          <Suspense fallback={(
            <aside
              aria-busy="true"
              aria-label="Carregando convite"
              className="
                min-h-80 min-w-0 rounded-xl bg-highlight-soft p-6
                lg:order-2 lg:col-span-4 lg:mt-11
              "
            />
          )}
          >
            <HomePublishingCta />
          </Suspense>
          <div className="
            min-w-0
            lg:col-span-8
          "
          >
            <h3 className="mb-5 text-xl font-semibold">Anúncios recentes</h3>
            <div className="[&>div]:lg:grid-cols-2">
              <Suspense fallback={<Loading />}>
                <AdList />
              </Suspense>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

async function HomeCategories() {
  return <HomepageCategoryNav categories={await getCategories()} />;
}

async function HomePublishingCta() {
  const visible = await registrationVisible();
  return <HomePublishingCtaContent visible={visible} />;
}

function HomePublishingCtaContent({ visible }: { visible: boolean }) {
  return (
    <aside
      className="
        min-w-0 rounded-xl bg-highlight-soft p-6 wrap-anywhere
        text-highlight-foreground
        lg:order-2 lg:col-span-4 lg:mt-11
      "
      data-homepage-publish-cta
    >
      <h3
        data-homepage-publish-cta-title
        className="max-w-xs text-2xl font-semibold tracking-tight"
      >
        {visible ? "Seu negócio pode aparecer aqui." : "Seu próximo anúncio começa aqui."}
      </h3>
      <p
        data-homepage-publish-cta-description
        className="mt-3 max-w-sm text-base"
      >
        {visible ? "Trabalha por conta própria? Você também pode aparecer aqui." : "Tem um produto, serviço ou oportunidade para divulgar? Publique gratuitamente."}
      </p>
      {visible
        ? (
            <div className="mt-6 flex flex-col items-start gap-3">
              <BusinessCreationButton sourceSurface="home" />
              <Link
                href="/publicar"
                className="
                  inline-flex min-h-11 items-center font-semibold underline
                  underline-offset-4
                  focus-visible:outline-2 focus-visible:outline-offset-4
                "
              >
                Anunciar grátis
              </Link>
            </div>
          )
        : (
            <Link
              href="/publicar"
              className="
                mt-6 inline-flex min-h-11 max-w-full min-w-0 flex-wrap
                items-center justify-between gap-x-6 gap-y-2 rounded-md
                bg-highlight px-4 py-3 font-semibold text-highlight-foreground
                transition-colors
                hover:bg-highlight-hover
                focus-visible:outline-2 focus-visible:outline-offset-4
                focus-visible:outline-highlight-ink
              "
            >
              <span className="min-w-0">Anunciar grátis</span>
              <ArrowUpRight aria-hidden="true" className="size-5 shrink-0" />
            </Link>
          )}
    </aside>
  );
}
