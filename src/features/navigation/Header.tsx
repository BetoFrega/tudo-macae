import { Search } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { connection } from "next/server";
import { cache, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { SheetClose } from "@tudomacae/react-primitives/sheet";
import { getCategories } from "@/features/categories/actions/getCategories";
import { SiteSearchForm } from "@/components/site-search/SiteSearchForm";
import {
  siteSearchEnabled,
  siteSearchIdentityCookieName,
} from "@/integrations/site-search/production";
import {
  DesktopContextRail,
  DesktopProductNavigation,
  MobileEditorialNavigation,
} from "@tudomacae/site-layout/navigation";
import { ContextualNavigation } from "./NavigationIntegration";
import { SiteBrand } from "./SiteBrand";
import UserSidebar from "./UserSidebar";
import { SiteHeaderFrame } from "@tudomacae/site-layout/frame";
import { BusinessCreationButton } from "@/features/business/BusinessCreationCta";

const getNavigationData = cache(async () => {
  await connection();
  const categories = await getCategories();
  return { categories, sections: [] };
});

async function LiveDesktopProductNavigation() {
  const data = await getNavigationData();
  return <ContextualNavigation><DesktopProductNavigation {...data} /></ContextualNavigation>;
}

async function LiveDesktopContextRail() {
  const data = await getNavigationData();
  return <ContextualNavigation><DesktopContextRail {...data} /></ContextualNavigation>;
}

async function LiveMobileEditorialNavigation() {
  const data = await getNavigationData();
  return (
    <ContextualNavigation>
      <MobileEditorialNavigation
        {...data}
        triggerId="business-registration-menu"
        registrationAction={<MobileRegistrationAction />}
        publishingAction={<MobilePublishingAction />}
      />
    </ContextualNavigation>
  );
}

function MobileRegistrationAction() {
  return (
    <SheetClose asChild>
      <BusinessCreationButton
        sourceSurface="navigation"
        returnFocusTargetId="business-registration-menu"
        className="
          min-h-11 w-full rounded-md bg-highlight px-4 py-3 text-left text-sm
          font-semibold text-wrap text-highlight-foreground
          hover:bg-highlight-hover
          focus-visible:outline-2 focus-visible:outline-offset-2
        "
      />
    </SheetClose>
  );
}

function MobilePublishingAction() {
  return (
    <SheetClose asChild>
      <Button
        asChild
        variant="ghost"
        className="min-h-11 w-full"
      >
        <Link href="/publicar">Anunciar grátis</Link>
      </Button>
    </SheetClose>
  );
}

function MobileRegistrationRail() {
  return (
    <div className="
      border-t py-2
      lg:hidden
    "
    >
      <BusinessCreationButton
        sourceSurface="navigation"
        className="
          min-h-11 w-full justify-center rounded-md bg-highlight px-4 py-2
          text-center text-sm font-semibold text-highlight-foreground
          hover:bg-highlight-hover
          focus-visible:outline-2 focus-visible:outline-offset-2
          focus-visible:outline-highlight-ink
          disabled:cursor-wait disabled:opacity-60
          [&>svg]:hidden
        "
      >
        Cadastrar negócio ou serviço
      </BusinessCreationButton>
    </div>
  );
}

function DesktopRegistrationAction() {
  return (
    <div className="
      hidden items-center gap-2
      lg:flex
    "
    >
      <BusinessCreationButton
        sourceSurface="navigation"
        className="
          min-h-11 rounded-md bg-highlight px-4 py-2 text-center text-sm
          font-semibold text-highlight-foreground
          hover:bg-highlight-hover
          focus-visible:outline-2 focus-visible:outline-offset-2
          focus-visible:outline-highlight-ink
          disabled:cursor-wait disabled:opacity-60
          [&>svg]:hidden
        "
      >
        Cadastrar negócio ou serviço
      </BusinessCreationButton>
    </div>
  );
}

/** Resolved once per request on the server, so the flag never flickers. */
const isSiteSearchEnabled = cache(async () => {
  await connection();
  const cookieName = siteSearchIdentityCookieName();
  return siteSearchEnabled(cookieName ? (await cookies()).get(cookieName)?.value : undefined);
});

async function LiveSiteSearchEntry({ layout }: { layout: "compact" | "wide" }) {
  if (!await isSiteSearchEnabled()) return null;
  if (layout === "wide") return (
    <SiteSearchForm
      surface="header"
      className="w-56"
    />
  );
  return (
    <Link
      href="/busca"
      aria-label="Buscar no Tudo Macaé"
      className="
        inline-flex min-h-11 min-w-11 items-center justify-center rounded-md
        text-primary
        focus-visible:outline-2 focus-visible:outline-offset-2
      "
    >
      <Search aria-hidden="true" className="size-5" />
    </Link>
  );
}

export default function Header() {
  return (
    <SiteHeaderFrame
      brand={<SiteBrand />}
      desktopNavigation={(
        <Suspense fallback={(
          <div className="h-11 w-56 animate-pulse rounded-md bg-muted" />
        )}
        >
          <LiveDesktopProductNavigation />
        </Suspense>
      )}
      actions={(
        <>
          {/* Below 1280px the full form collides with the product navigation. */}
          <div className="xl:hidden">
            <Suspense><LiveSiteSearchEntry layout="compact" /></Suspense>
          </div>
          <div className="
            hidden
            xl:block
          "
          >
            <Suspense><LiveSiteSearchEntry layout="wide" /></Suspense>
          </div>
          <Link
            href="/negocios?origem=navigation"
            className="
              inline-flex min-h-11 items-center rounded-md px-2 text-sm
              font-semibold text-primary underline-offset-4
              hover:underline
              focus-visible:outline-2 focus-visible:outline-offset-2
              lg:hidden
            "
          >
            Negócios
          </Link>
          <UserSidebar registrationVisible />
          <div className="lg:hidden">
            <Suspense fallback={(
              <Button
                variant="ghost"
                disabled
                className="min-h-11 min-w-11 px-2"
                aria-label="Carregando menu"
              >
                <span className="
                  hidden
                  min-[380px]:inline
                "
                >
                  Menu
                </span>
              </Button>
            )}
            >
              <LiveMobileEditorialNavigation />
            </Suspense>
          </div>
          <DesktopRegistrationAction />
        </>
      )}
      contextRail={(
        <Suspense
          fallback={(
            <div className="h-11 w-full border-t" />
          )}
        >
          <LiveDesktopContextRail />
        </Suspense>
      )}
      mobileContextRail={<MobileRegistrationRail />}
    />
  );
}
