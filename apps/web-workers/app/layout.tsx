import type { Metadata } from "next";
import { SiteDocument } from "@tudomacae/site-layout/document";

import { Button } from "@tudomacae/react-primitives/button";
import { AccountEntry } from "@tudomacae/site-layout/account-entry";
import {
  LiveDesktopContextRail,
  LiveDesktopProductNavigation,
  LiveMobileEditorialNavigation,
  PublicNavigationProvider,
} from "./PublicNavigationClient";
import { SiteFooter, SiteHeaderFrame } from "@tudomacae/site-layout/frame";
import { NavigationIntegration } from "./NavigationIntegration";
import { SiteBrand } from "./SiteBrand";
import { fontClassName } from "./fonts";
import "./style.css";

const origin = "https://www.tudomacae.com.br";

export const metadata: Metadata = {
  metadataBase: new URL(origin),
  applicationName: "Tudo Macaé",
  title: "Tudo Macaé | Negócios e classificados em Macaé",
  description: "Catálogo de negócios locais e anúncios de empregos, imóveis, veículos, produtos e serviços no Tudo Macaé.",
  openGraph: {
    title: "Tudo Macaé | Negócios e classificados em Macaé",
    description: "Catálogo de negócios locais e anúncios de empregos, imóveis, veículos, produtos e serviços no Tudo Macaé.",
    url: "/",
    type: "website",
    siteName: "Tudo Macaé",
    locale: "pt_BR",
    images: [{ url: "/social-preview.png", width: 1200, height: 630, alt: "Tudo Macaé — negócios e classificados de Macaé" }],
  },
};

export const viewport = { themeColor: "#deebef" };

const initialNavigation = {
  categories: [],
  sections: [],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <SiteDocument fontClassName={fontClassName}>
      <NavigationIntegration>
        <PublicNavigationProvider initial={initialNavigation}>
          <SiteHeaderFrame
            brand={<SiteBrand />}
            desktopNavigation={<LiveDesktopProductNavigation />}
            actions={(
              <>
                <a
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
                </a>
                <AccountEntry href="/minha-conta/anuncios" />
                <div className="lg:hidden">
                  <LiveMobileEditorialNavigation />
                </div>
                <Button
                  asChild
                  size="lg"
                  variant="highlight"
                  className="
                    hidden
                    lg:inline-flex
                  "
                >
                  <a href="/publicar">
                    Anunciar
                    <span className="text-xs">(grátis)</span>
                  </a>
                </Button>
              </>
            )}
            contextRail={<LiveDesktopContextRail />}
          />
          <main id="conteudo">{children}</main>
          <SiteFooter />
        </PublicNavigationProvider>
      </NavigationIntegration>
    </SiteDocument>
  );
}
