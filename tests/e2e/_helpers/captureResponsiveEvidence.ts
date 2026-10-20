import { writeFile } from "node:fs/promises";
import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";

import { pageObject } from "./fixtures/POMs/pageObject";

export type SiteLayoutVariant = "on" | "off" | "no-shell";

export async function readSiteLayoutVariant(page: Page): Promise<SiteLayoutVariant> {
  return pageObject(page).getByRole("banner").count().then(count => count ? "off" : "no-shell");
}

export async function recordCaptureEvidence(page: Page, testInfo: TestInfo, filename: string, captureKind: "full-page" | "viewport" | "component", expectedVariant?: SiteLayoutVariant) {
  if (expectedVariant) await expect.poll(() => readSiteLayoutVariant(page)).toBe(expectedVariant);
  await writeFile(testInfo.outputPath(`${filename}.json`), JSON.stringify({
    route: new URL(page.url()).pathname,
    viewport: page.viewportSize(),
    filename,
    variant: await readSiteLayoutVariant(page),
    ...(expectedVariant ? { expectedVariant } : {}),
    captureKind,
  }, null, 2));
}

type ResponsiveEvidenceOptions = {
  page: Page;
  testInfo: TestInfo;
  prefix: string;
  boundary?: Locator;
  ready?: Locator;
  expectedVariant?: SiteLayoutVariant;
};

type ResolvedResponsiveEvidenceOptions = {
  page: Page;
  testInfo: TestInfo;
  state: string;
  boundary?: Locator | undefined;
  ready?: Locator | undefined;
  expectedVariant: SiteLayoutVariant;
};

function resolveResponsiveEvidenceOptions(
  pageOrOptions: Page | ResponsiveEvidenceOptions,
  positionalTestInfo?: TestInfo,
  positionalState?: string,
): ResolvedResponsiveEvidenceOptions {
  const options: Omit<ResponsiveEvidenceOptions, "testInfo" | "prefix"> & { testInfo?: TestInfo | undefined; prefix?: string | undefined } = "page" in pageOrOptions
    ? pageOrOptions
    : { page: pageOrOptions, testInfo: positionalTestInfo, prefix: positionalState };
  const { page, testInfo, prefix, boundary, ready, expectedVariant } = options;
  if (!testInfo || !prefix) throw new Error("Responsive evidence requires test info and a state prefix");
  return { page, testInfo, state: prefix, boundary, ready, expectedVariant: expectedVariant ?? "off" };
}

function shortcutRailName(pathname: string) {
  if (/^\/(?:negocio|negocios)(?:\/|$)/u.test(pathname)) return "Atalhos de negócios";
  if (/^\/(?:anuncio|anunciante|categoria|publicar)(?:\/|$)/u.test(pathname)) return "Atalhos de classificados";
  return undefined;
}

async function expectBrandLoaded(container: Locator, includeHidden: boolean) {
  const brand = container.getByRole("img", { name: "Tudo Macaé", exact: true, includeHidden }).filter({ visible: true });
  await expect.poll(() => brand.evaluate(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0)).toBe(true);
}

async function expectDesktopNavigation(page: Page, header: Locator, includeHidden: boolean) {
  const navigation = header.getByRole("navigation", { name: "Navegação principal", exact: true, includeHidden }).filter({ visible: true });
  await expect(navigation.getByRole("link", { name: "Negócios", exact: true, includeHidden }).filter({ visible: true })).toBeVisible();
  await expect(navigation.getByRole("button", { name: "Classificados", exact: true, includeHidden }).filter({ visible: true })).toBeVisible();
  await expect(navigation.getByRole("button", { name: /^(Matérias|Notícias)$/u, includeHidden })).toHaveCount(0);
  const railName = shortcutRailName(new URL(page.url()).pathname);
  const rails = header.getByRole("navigation", { name: /^Atalhos de/u, includeHidden }).filter({ visible: true });
  if (railName) await expect(header.getByRole("navigation", { name: railName, exact: true, includeHidden }).filter({ visible: true })).toBeVisible();
  else await expect(rails).toHaveCount(0);
}

async function expectMobileMenu(header: Locator, includeHidden: boolean) {
  await expect(header.getByRole("button", { name: "Abrir menu", exact: true, includeHidden }).filter({ visible: true })).toBeEnabled();
  await expect(header.getByRole("button", { name: "Carregando menu", exact: true, includeHidden }).filter({ visible: true })).toHaveCount(0);
}

async function expectShellReady(page: Page, width: number) {
  const header = pageObject(page).getByRole("banner", { includeHidden: true }).filter({ visible: true });
  const workHeader = pageObject(page).locator("[data-work-header]").filter({ visible: true });
  // Modal isolation hides the background from accessibility queries, not from the capture.
  // Observe only the visible shell; leave the foreground dialog and its focus untouched.
  const includeHidden = await page.getByRole("dialog").or(page.getByRole("alertdialog")).filter({ visible: true }).count() > 0;
  // GlobalError intentionally has no site shell. Main loading/error remains untouched.
  if (await header.count()) {
    if (width >= 1024) await expectDesktopNavigation(page, header, includeHidden);
    else await expectMobileMenu(header, includeHidden);
    await expectBrandLoaded(header, includeHidden);
  }
  else if (await workHeader.count()) {
    await expect(workHeader.getByRole("button", { name: "Minha conta", exact: true, includeHidden }).filter({ visible: true })).toBeEnabled();
    await expectBrandLoaded(workHeader, includeHidden);
  }
}

async function captureAtWidth({ page, testInfo, state, boundary, ready, expectedVariant }: ResolvedResponsiveEvidenceOptions, width: number) {
  await page.setViewportSize({ width, height: 900 });
  if (ready) await expect(ready).toBeVisible();
  await expect.poll(() => readSiteLayoutVariant(page)).toBe(expectedVariant);
  await expectShellReady(page, width);
  await expect.poll(() => page.evaluate(() => document.fonts.status)).toBe("loaded");
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (boundary) await expect(boundary).toBeVisible();
  const filename = `${state}-${width}.png`;
  await page.screenshot({ path: testInfo.outputPath(filename), fullPage: true, animations: "disabled" });
  return { variant: await readSiteLayoutVariant(page), expectedVariant, captureKind: "full-page", route: new URL(page.url()).pathname, state, viewport: { width, height: 900 }, filename };
}

export async function captureResponsiveEvidence(
  page: Page,
  testInfo: TestInfo,
  state: string,
): Promise<void>;
export async function captureResponsiveEvidence(options: ResponsiveEvidenceOptions): Promise<void>;
export async function captureResponsiveEvidence(
  pageOrOptions: Page | ResponsiveEvidenceOptions,
  positionalTestInfo?: TestInfo,
  positionalState?: string,
): Promise<void> {
  const options = resolveResponsiveEvidenceOptions(pageOrOptions, positionalTestInfo, positionalState);
  const { page, testInfo, state } = options;
  const initialScroll = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
  const initialViewport = page.viewportSize();
  const captures = [];
  try {
    for (const width of [1280, 1440, 390]) captures.push(await captureAtWidth(options, width));
    await writeFile(testInfo.outputPath(`${state}-captures.json`), JSON.stringify(captures, null, 2));
  }
  finally {
    if (initialViewport) await page.setViewportSize(initialViewport);
    await page.evaluate(({ x, y }) => window.scrollTo(x, y), initialScroll);
  }
}
