import { expect } from "./fixtures";
import { readFile } from "node:fs/promises";
import {
  SITE_SEARCH_FAKE_ADDRESS_PATH,
  SITE_SEARCH_FAKE_TOKEN,
} from "../bin/siteSearchFake";
import { pageObject } from "./fixtures/POMs/pageObject";
import type { Page } from "@playwright/test";

export function setSearchIdentityCookie(page: Page, distinctId: string) {
  return page.context().addCookies([{
    name: `ph_${SITE_SEARCH_FAKE_TOKEN}_posthog`,
    value: encodeURIComponent(JSON.stringify({ distinct_id: distinctId, $user_state: "identified" })),
    url: new URL(page.url()).origin,
    sameSite: "Lax",
  }]);
}

export function headerSearch(page: Page) {
  return pageObject(page).getByRole("banner").getByRole("link", { name: "Buscar no Tudo Macaé", exact: true }).or(
    pageObject(page).getByRole("banner").getByRole("search", { name: "Buscar no Tudo Macaé", exact: true }),
  ).filter({ visible: true });
}

export async function siteSearchFakeUrl() {
  return (JSON.parse(await readFile(SITE_SEARCH_FAKE_ADDRESS_PATH, "utf8")) as { url: string }).url;
}

export async function enableSearchAudience(uid: string) {
  const response = await fetch(`${await siteSearchFakeUrl()}/__search-audience`, {
    method: "PUT",
    body: JSON.stringify({ uid }),
  });
  expect(response.status).toBe(204);
}

export async function clearSearchFakeState() {
  const response = await fetch(`${await siteSearchFakeUrl()}/__replies`, { method: "DELETE" });
  expect(response.status).toBe(204);
}

export async function checkHeaderState(page: Page, authenticated: boolean, searchEnabled: boolean) {
  const surface = pageObject(page);
  const header = surface.getByRole("banner");
  const signIn = header.getByRole("button", { name: "Entrar", exact: true });
  const account = header.getByRole("button", { name: "Minha conta", exact: true });
  if (authenticated) {
    await expect(account).toBeVisible();
    await expect(signIn).toHaveCount(0);
  }
  else {
    await expect(signIn).toBeVisible();
    await expect(account).toHaveCount(0);
  }
  if (searchEnabled) await expect(headerSearch(page)).toBeVisible();
  else await expect(headerSearch(page)).toHaveCount(0);
}

export type HeaderControlGeometry = {
  viewportWidth: number;
  controls: Array<{
    category: "product-navigation" | "context-rail" | "actions";
    left: number;
    right: number;
    top: number;
    bottom: number;
    height: number;
  }>;
  overlappingPairs: Array<[number, number]>;
  primaryTargetWidths: number[];
  primaryTargetHeights: number[];
};

export async function assertHeaderControlsFit(
  page: Page,
  requirePrimaryTarget: boolean,
  onMeasured?: (geometry: HeaderControlGeometry) => void,
) {
  const header = pageObject(page).getByRole("banner");
  const controls = header.getByRole("button").or(header.getByRole("link")).filter({ visible: true });
  const primaryTargets = header.getByRole("button").or(
    header.getByRole("link", { name: "Buscar no Tudo Macaé", exact: true }),
  ).filter({ visible: true });
  const primaryTargetSizes = await primaryTargets.evaluateAll(elements =>
    elements.map((element) => {
      const { width, height } = element.getBoundingClientRect();
      return { width, height };
    }),
  );
  const primaryTargetWidths = primaryTargetSizes.map(({ width }) => width);
  const primaryTargetHeights = primaryTargetSizes.map(({ height }) => height);
  const measuredControls = await controls.evaluateAll((elements) => {
    const visible = elements.filter((element) => {
      const bounds = element.getBoundingClientRect();
      return bounds.width > 0 && bounds.height > 0;
    });
    const bounds = visible.map((element) => {
      const rect = element.getBoundingClientRect();
      const navigation = element.closest("nav");
      const category: HeaderControlGeometry["controls"][number]["category"] = navigation?.getAttribute("aria-label") === "Navegação principal"
        ? "product-navigation"
        : navigation ? "context-rail" : "actions";
      return {
        category,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
      };
    });
    // Runs in the browser, so the pair check stays inside this callback.
    const overlaps = (first: number, second: number) => {
      const firstElement = visible[first];
      const secondElement = visible[second];
      if (!firstElement || !secondElement || firstElement.contains(secondElement) || secondElement.contains(firstElement)) return false;
      const firstBounds = bounds[first];
      const secondBounds = bounds[second];
      if (!firstBounds || !secondBounds) return false;
      const overlapWidth = Math.min(firstBounds.right, secondBounds.right) - Math.max(firstBounds.left, secondBounds.left);
      const overlapHeight = Math.min(firstBounds.bottom, secondBounds.bottom) - Math.max(firstBounds.top, secondBounds.top);
      return overlapWidth > 0.5 && overlapHeight > 0.5;
    };
    const overlappingPairs: Array<[number, number]> = [];
    for (let first = 0; first < visible.length; first += 1) {
      for (let second = first + 1; second < visible.length; second += 1) {
        if (overlaps(first, second)) overlappingPairs.push([first, second]);
      }
    }
    return { viewportWidth: innerWidth, controls: bounds, overlappingPairs };
  });
  const geometry = { ...measuredControls, primaryTargetWidths, primaryTargetHeights };
  onMeasured?.(geometry);
  expect(geometry.controls.length).toBeGreaterThan(0);
  expect(geometry.controls.every(({ left, right }) => left >= 0 && right <= geometry.viewportWidth)).toBe(true);
  expect(geometry.overlappingPairs).toEqual([]);
  if (requirePrimaryTarget) {
    expect(primaryTargetWidths.length).toBeGreaterThan(0);
    expect(primaryTargetWidths.every(width => width >= 44)).toBe(true);
    expect(primaryTargetHeights.length).toBeGreaterThan(0);
    expect(primaryTargetHeights.every(height => height >= 44)).toBe(true);
  }
  return geometry;
}
