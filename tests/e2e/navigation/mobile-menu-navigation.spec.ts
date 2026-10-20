import { pageObject } from "../_helpers/fixtures/POMs/pageObject";
import { click } from "../_helpers/click";
import { expect, test } from "../_helpers/fixtures";
import { SITE_SEARCH_FAKE_MAINTAINER } from "../bin/siteSearchFake";
import {
  assertHeaderControlsFit,
  checkHeaderState,
  clearSearchFakeState,
  enableSearchAudience,
  headerSearch,
  setSearchIdentityCookie,
} from "../_helpers/header-layout";
import type { HeaderControlGeometry } from "../_helpers/header-layout";

// This journey proves the responsive header, product hierarchy and routed navigation together.
test("mobile menu reaches a category", async ({ page, categoryFixture, loginPage, userCredentials, userWithClaims }, testInfo) => {
  const { category } = categoryFixture;
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/");
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  const mobile = pageObject(page);
  const publishCta = mobile.getByRole("main").locator("[data-homepage-publish-cta]");
  const publishLink = publishCta.getByRole("link", { name: "Anunciar grátis", exact: true });
  const captureCta = async (name: string) => {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    const initial = await mobile.getByRole("banner").evaluate((header) => {
      const rect = (element: Element) => {
        const bounds = element.getBoundingClientRect();
        return { top: bounds.top, bottom: bounds.bottom, height: bounds.height };
      };
      const cta = document.querySelector("[data-homepage-publish-cta]");
      const heading = cta?.querySelector("h3");
      const link = cta?.querySelector("a");
      if (!header || !cta || !heading || !link) throw new Error("CTA screenshot landmarks are missing");
      return {
        viewport: { width: innerWidth, height: innerHeight },
        scrollY: window.scrollY,
        header: rect(header),
        aside: rect(cta),
        heading: rect(heading),
        link: rect(link),
        documentHeight: document.documentElement.scrollHeight,
      };
    });
    await page.screenshot({ path: testInfo.outputPath(`${name}-full-page.png`), fullPage: true });

    const scrollY = Math.max(0, initial.heading.top - initial.header.bottom - 16);
    await page.evaluate(position => window.scrollTo({ top: position, behavior: "instant" }), scrollY);
    const positioned = await mobile.getByRole("banner").evaluate((header) => {
      const heading = document.querySelector("[data-homepage-publish-cta] h3");
      if (!header || !heading) throw new Error("CTA viewport landmarks are missing");
      return {
        scrollY: window.scrollY,
        headerBottom: header.getBoundingClientRect().bottom,
        headingTop: heading.getBoundingClientRect().top,
      };
    });
    await testInfo.attach(`${name}-geometry.json`, {
      body: JSON.stringify({ initial, positioned }, null, 2),
      contentType: "application/json",
    });
    expect(positioned.headingTop).toBeGreaterThanOrEqual(positioned.headerBottom);
    await page.screenshot({ path: testInfo.outputPath(`${name}.png`) });
  };
  const assertPublishCtaFits = async () => {
    await expect(
      publishCta.getByRole("heading", { name: "Seu negócio pode aparecer aqui.", exact: true }),
    ).toBeVisible();
    await expect(
      publishCta.getByText("Trabalha por conta própria? Você também pode aparecer aqui.", { exact: true }),
    ).toBeVisible();
    await expect(publishLink).toHaveAttribute("href", "/publicar");
    expect(await publishCta.evaluate((element) => {
      const grid = element.parentElement;
      if (!grid) return false;
      const gridChildren = [...grid.children];
      const ctaContent = [element, ...element.querySelectorAll<HTMLElement>("h3, p, a, button")];
      const inViewport = [grid, ...gridChildren, ...ctaContent].every((item) => {
        const bounds = item.getBoundingClientRect();
        return bounds.left >= 0 && bounds.right <= innerWidth + 1;
      });
      const contentFits = [element, ...ctaContent].every(item => item.scrollWidth <= item.clientWidth);
      return inViewport && contentFits;
    })).toBe(true);
  };
  await test.step("CTA reflows at 320px with 200% text", async () => {
    await assertPublishCtaFits();
    await captureCta("home-cta-320-200");
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await test.step("CTA reflows at 390px with 200% text", async () => {
    await assertPublishCtaFits();
    await captureCta("home-cta-390-200");
  });

  await page.evaluate(() => {
    document.documentElement.style.removeProperty("font-size");
  });
  await test.step("Normal mobile CTA keeps its content and 44px target", async () => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(publishLink).toBeVisible();
    expect(await publishLink.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return bounds.width >= 44 && bounds.height >= 44;
    })).toBe(true);
    await captureCta("home-cta-390");
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await test.step("Desktop CTA keeps its normal composition", async () => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(publishLink).toBeVisible();
    await captureCta("home-cta-desktop");
  });

  await page.setViewportSize({ width: 390, height: 844 });
  const menu = mobile.getByRole("button", { name: "Abrir menu" });
  await click(menu);
  let dialog = mobile.getByRole("dialog", { name: "Explore o Tudo Macaé", exact: true });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(menu).toBeFocused();

  await click(menu);
  dialog = mobile.getByRole("dialog", { name: "Explore o Tudo Macaé", exact: true });
  await click(dialog.locator("summary").filter({ hasText: "Explorar categorias" }));
  await click(dialog.getByRole("link", { name: category.name, exact: true }));
  await expect(page).toHaveURL(new RegExp(`/categoria/${category.id}/${category.slug}$`, "u"));
  await expect(dialog).not.toBeVisible();
  await expect(mobile.getByRole("heading", { name: category.name, exact: true })).toBeVisible();

  await click(menu);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(menu).toBeFocused();

  await test.step("Search state follows anonymous and authenticated identities", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "";
    });
    const layoutEvidence: Array<{
      state: string;
      viewportWidth: number;
      viewportHeight: number;
      documentWidth: number;
      documentHeight: number;
      headerWidth: number;
      searchVisibleCount: number;
      controls: HeaderControlGeometry["controls"];
      overlappingPairs: Array<[number, number]>;
      primaryTargetWidths: number[];
      primaryTargetHeights: number[];
    }> = [];
    const recordHeaderGeometry = async (state: string, requirePrimaryTarget = false) => {
      const dimensions = await page.evaluate(() => {
        return {
          viewportWidth: innerWidth,
          viewportHeight: innerHeight,
          documentWidth: document.documentElement.scrollWidth,
          documentHeight: document.documentElement.scrollHeight,
        };
      });
      const headerWidth = await pageObject(page).getByRole("banner")
        .evaluate(header => header.getBoundingClientRect().width);
      const dimensionsWithHeader = { ...dimensions, headerWidth };
      const searchVisibleCount = await headerSearch(page).count();
      try {
        await assertHeaderControlsFit(page, requirePrimaryTarget, (controls) => {
          layoutEvidence.push({ state, ...dimensionsWithHeader, searchVisibleCount, ...controls });
        });
      }
      catch (error) {
        const path = testInfo.outputPath(`header-${state}-failed.png`);
        await pageObject(page).getByRole("banner").screenshot({ path, timeout: 500 })
          .then(() => testInfo.attach("header-layout-failure.png", { path, contentType: "image/png" }))
          .catch(() => undefined);
        throw error;
      }
      expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
    };
    const qualify = async (label: string, authenticated: boolean, searchEnabled: boolean) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/");
      await checkHeaderState(page, authenticated, searchEnabled);
      await recordHeaderGeometry(`${label}-390-normal`, true);
      for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 844 });
        await page.evaluate(() => {
          document.documentElement.style.fontSize = "200%";
        });
        try {
          await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        }
        catch (error) {
          const geometry = await page.evaluate(() => {
            const viewport = window.innerWidth;
            return {
              viewport,
              documentWidth: document.documentElement.scrollWidth,
              headerWidth: document.querySelector("body > header")?.getBoundingClientRect().width,
              overflowing: [...document.querySelectorAll<HTMLElement>("body *")]
                .filter((element) => {
                  const rect = element.getBoundingClientRect();
                  return rect.width > 0 && (rect.right > viewport + 0.5 || rect.left < -0.5);
                })
                .slice(0, 12).map((element) => {
                  const rect = element.getBoundingClientRect();
                  const style = getComputedStyle(element);
                  return {
                    zone: element.closest("header") ? "header" : element.closest("main") ? "main" : "other",
                    tag: element.tagName,
                    left: rect.left, right: rect.right, width: rect.width,
                    minWidth: style.minWidth, display: style.display,
                    flexWrap: style.flexWrap, whiteSpace: style.whiteSpace,
                  };
                }),
            };
          });
          await testInfo.attach("header-overflow-geometry.json", {
            body: JSON.stringify({ state: label, geometry }), contentType: "application/json",
          });
          await page.screenshot({ path: testInfo.outputPath(`header-${label}-${width}-overflow.png`) });
          throw error;
        }
        await checkHeaderState(page, authenticated, searchEnabled);
        await recordHeaderGeometry(`${label}-${width}-zoom-200`);
        await page.screenshot({ path: testInfo.outputPath(`header-${label}-${width}-zoom-200.png`) });
        await page.evaluate(() => {
          document.documentElement.style.fontSize = "";
        });
      }

      await page.setViewportSize({ width: 1280, height: 800 });
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "";
      });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await checkHeaderState(page, authenticated, searchEnabled);
      await recordHeaderGeometry(`${label}-desktop-normal`);
      await page.screenshot({ path: testInfo.outputPath(`header-${label}-desktop.png`) });

      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await checkHeaderState(page, authenticated, searchEnabled);
      await recordHeaderGeometry(`${label}-desktop-zoom-200`);
      await page.screenshot({ path: testInfo.outputPath(`header-${label}-desktop-zoom-200.png`) });
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "";
      });
    };

    await clearSearchFakeState();
    try {
      await qualify("anonymous-no-search", false, false);
      await setSearchIdentityCookie(page, SITE_SEARCH_FAKE_MAINTAINER);
      await qualify("anonymous-search", false, true);

      await enableSearchAudience(userCredentials.uid);
      await page.goto("/");
      await loginPage.login(userCredentials.email, userCredentials.password);
      await expect(pageObject(page).getByRole("button", { name: "Minha conta", exact: true })).toBeVisible();
      await qualify("authenticated-search", true, true);

      await clearSearchFakeState();
      await userWithClaims({});
      await qualify("authenticated-no-search", true, false);
    }
    finally {
      try {
        await clearSearchFakeState();
      }
      finally {
        await testInfo.attach("header-layout-geometry.json", {
          body: JSON.stringify(layoutEvidence, null, 2),
          contentType: "application/json",
        });
      }
    }
  });
});
