import { Suspense } from "react";
import { AccountReminder } from "@/features/authentication/components/AccountReminder";
import type { Metadata, Viewport } from "next";
import { SiteDocument } from "@tudomacae/site-layout/document";
import "./globals.css";
import { fontClassName } from "./fonts";
import { NavigationIntegration } from "@/features/navigation/NavigationIntegration";
import { appUrl } from "../../bin/appPorts";
import { AuthProvider } from "@/features/authentication/AuthContext";
import Footer from "@/features/navigation/Footer";
import Header from "@/features/navigation/Header";
import { createOpenGraph } from "@/lib/socialMetadata";
import { BusinessNavigationFocusRouteObserver } from "@/features/business/BusinessNavigationFocus";

const title = "Tudo Macaé | Negócios e classificados em Macaé";
const description
  = "Catálogo de negócios locais e anúncios de empregos, imóveis, veículos, produtos e serviços no Tudo Macaé.";

export const metadata: Metadata = {
  // Falls back to this worktree's own app port (see bin/appPorts.ts)
  // rather than a fixed 5002 — otherwise a linked worktree's dev server emits
  // canonical/og:url pointing at a port nobody is serving.
  metadataBase: new URL(
    process.env.PUBLIC_APP_ORIGIN ?? appUrl(),
  ),
  title,
  description,
  applicationName: "Tudo Macaé",
  openGraph: createOpenGraph({ title, description, url: "/" }),
};

export const viewport: Viewport = {
  themeColor: "#deebef",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <SiteDocument fontClassName={fontClassName}>
      <NavigationIntegration>
        <AuthProvider>
          <Header />
          <Suspense>
            <AccountReminder />
          </Suspense>
          <Suspense>
            <BusinessNavigationFocusRouteObserver />
          </Suspense>
          <Suspense>
            {children}
          </Suspense>
          <Footer />
        </AuthProvider>
      </NavigationIntegration>
    </SiteDocument>
  );
}
