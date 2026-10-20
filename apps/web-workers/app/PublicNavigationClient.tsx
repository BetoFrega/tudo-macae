"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  DesktopContextRail,
  DesktopProductNavigation,
  MobileEditorialNavigation,
} from "@tudomacae/site-layout/navigation";
import type { NavigationCategory, NavigationSection } from "@tudomacae/site-layout/navigation";

interface NavigationSnapshot {
  categories: NavigationCategory[];
  sections: NavigationSection[];
}

const NavigationData = createContext<NavigationSnapshot>({ categories: [], sections: [] });

function isNavigationSnapshot(value: unknown): value is NavigationSnapshot {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<NavigationSnapshot>;
  return Array.isArray(data.categories)
    && Array.isArray(data.sections)
    && data.categories.every(category => typeof category.id === "string" && typeof category.name === "string" && typeof category.slug === "string" && typeof category.isActive === "boolean")
    && data.sections.every(section => typeof section.id === "string" && typeof section.name === "string" && typeof section.slug === "string");
}

export function PublicNavigationProvider({ initial, children }: { initial: NavigationSnapshot; children: ReactNode }) {
  const [data, setData] = useState(initial);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/navegacao-publica", { credentials: "omit", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Navigation unavailable");
        const value: unknown = await response.json();
        if (!isNavigationSnapshot(value)) throw new Error("Navigation malformed");
        setData(value);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.warn(JSON.stringify({ event: "public_navigation_unavailable", service: "terms-workers", outcome: "fallback", reason: error instanceof Error ? error.message : "unknown" }));
      });
    return () => controller.abort();
  }, []);

  return <NavigationData.Provider value={data}>{children}</NavigationData.Provider>;
}

export function LiveDesktopProductNavigation() {
  return <DesktopProductNavigation {...useContext(NavigationData)} />;
}

export function LiveDesktopContextRail() {
  return <DesktopContextRail {...useContext(NavigationData)} />;
}

export function LiveMobileEditorialNavigation() {
  return <MobileEditorialNavigation {...useContext(NavigationData)} />;
}
