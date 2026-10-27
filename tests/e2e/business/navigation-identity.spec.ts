import { expect, test } from "../_helpers/fixtures";
import { pageObject } from "../_helpers/fixtures/POMs/pageObject";
import { makeRandomString } from "../../_helpers/makeRandomString";
import { createClaimableProfileFixture, updateClaimableProfileFixture, type ClaimableProfileFixture } from "../_helpers/advertiser-profile/profileFixtures";
import { deleteProfileFixture } from "../../_helpers/auth/db/deleteFixtureDocuments";
import { slugify } from "@tudomacae/text-normalization/slugify";

test("visitante abre o Negócio correto após prefetch de rotas irmãs", async ({ page, categoryFixture }, testInfo) => {
  const prefix = `Navegação ${makeRandomString()}`;
  const originalTitle = `${prefix} 00`;
  const renamedTitle = `${prefix} 00 atualizado`;
  const businesses: ClaimableProfileFixture[] = [];
  const ids: string[] = [];
  try {
    for (const index of [0, 1]) {
      const title = `${prefix} ${String(index).padStart(2, "0")}`;
      const business = await createClaimableProfileFixture({
        title,
        description: "Informações públicas de um negócio local.",
        contacts: [{ number: "22999999999", isWhatsapp: true }],
        activityAreas: [{ categoryId: categoryFixture.category.id, subcategoryId: categoryFixture.subcategory.id }],
        sourceUrl: "https://example.com/navigation-test",
      });
      businesses.push(business);
      ids.push(business.id);
    }
    const prefetchedPaths = new Set<string>();
    page.on("response", (response) => {
      const pathname = new URL(response.url()).pathname;
      if (ids.some(id => pathname.startsWith(`/negocio/${id}/`)) && response.request().headers()["rsc"] === "1") {
        prefetchedPaths.add(pathname);
      }
    });
    await page.goto("/negocios");
    const target = pageObject(page).getByRole("link", { name: originalTitle, exact: true });
    await target.scrollIntoViewIfNeeded();
    await expect.poll(() => prefetchedPaths.size).toBe(2);
    const stalePath = `/negocio/${ids[0]}/${slugify(originalTitle)}`;
    const canonicalPath = `/negocio/${ids[0]}/${slugify(renamedTitle)}`;
    await expect(target).toHaveAttribute("href", stalePath);
    await updateClaimableProfileFixture(businesses[0]!, {
      title: renamedTitle,
      description: "Informações públicas de um negócio local.",
      contacts: [{ number: "22999999999", isWhatsapp: true }],
      activityAreas: [{ categoryId: categoryFixture.category.id, subcategoryId: categoryFixture.subcategory.id }],
      sourceUrl: "https://example.com/navigation-test-updated",
    });
    await expect(target).toHaveAttribute("href", stalePath);
    await test.step("teclado alcança e ativa o Negócio do link", async () => {
      let targetReceivedFocus = false;
      for (let tabPress = 0; tabPress < 40 && !targetReceivedFocus; tabPress += 1) {
        await page.keyboard.press("Tab");
        targetReceivedFocus = await target.evaluate(link => link === document.activeElement);
      }
      expect(targetReceivedFocus, "O link do Negócio deve ser alcançável por Tab.").toBe(true);
      await expect(target).toBeFocused();
      expect(await target.evaluate(link => link.matches(":focus-visible"))).toBe(true);
      expect(await target.evaluate(link => getComputedStyle(link).outlineWidth)).toBe("2px");
      await page.keyboard.press("Enter");
    });
    await test.step("o destino correto recebe o foco após navegar", async () => {
      await expect(page).toHaveURL(new URL(canonicalPath, page.url()).href);
      const destinationHeading = pageObject(page).getByRole("heading", { name: renamedTitle, exact: true });
      await expect(destinationHeading).toBeVisible();
      await expect(destinationHeading).toHaveAttribute("tabindex", "-1");
      try {
        await expect(destinationHeading).toBeFocused();
        expect(await destinationHeading.evaluate(heading => heading.matches(":focus-visible"))).toBe(true);
        const viewport = page.viewportSize();
        const viewportLabel = viewport ? `${viewport.width}x${viewport.height}` : "viewport";
        const headingCapture = testInfo.outputPath(`business-detail-h1-focus-visible-${viewportLabel}.png`);
        await page.screenshot({ path: headingCapture, animations: "disabled" });
        await testInfo.attach(`business-detail-h1-focus-visible-${viewportLabel}.png`, {
          path: headingCapture,
          contentType: "image/png",
        });
        const activities = pageObject(page).getByRole("list", { name: "Áreas de atuação" });
        await expect(activities.getByRole("link")).toHaveCount(1);
        const activity = activities.getByRole("link", { name: /:/ });
        await page.keyboard.press("Tab");
        await expect(activity).toBeFocused();
        expect(await activity.evaluate(link => link.matches(":focus-visible"))).toBe(true);
        const activityCapture = testInfo.outputPath(`business-detail-activity-link-focus-visible-${viewportLabel}.png`);
        await page.screenshot({ path: activityCapture, animations: "disabled" });
        await testInfo.attach(`business-detail-activity-link-focus-visible-${viewportLabel}.png`, {
          path: activityCapture,
          contentType: "image/png",
        });
      }
      catch (error) {
        const inspectFocus = () => destinationHeading.evaluate((heading) => {
          const describe = (element: Element | null) => {
            if (!element) return null;
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return {
              tagName: element.tagName,
              id: element.id || null,
              role: element.getAttribute("role"),
              tabIndex: (element as HTMLElement).tabIndex,
              disabled: element.matches(":disabled"),
              isDestinationHeading: element === heading,
              isBody: element === document.body,
              inMain: document.querySelector("main")?.contains(element) ?? false,
              inHeader: element.closest("header") !== null,
              inNavigation: element.closest("nav") !== null,
              visible: element.getClientRects().length > 0
                && style.display !== "none"
                && style.visibility !== "hidden"
                && Number(style.opacity) > 0,
              focusVisible: element.matches(":focus-visible"),
              outlineWidth: style.outlineWidth,
              outlineStyle: style.outlineStyle,
              bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            };
          };
          const active = document.activeElement;
          const announcer = document.querySelector("next-route-announcer")?.shadowRoot?.querySelector("[aria-live]");
          return {
            active: describe(active),
            destinationHeading: describe(heading),
            routeAnnouncement: announcer
              ? {
                  role: announcer.getAttribute("role"),
                  ariaLive: announcer.getAttribute("aria-live"),
                  hasText: Boolean(announcer.textContent?.trim()),
                }
              : null,
          };
        });
        const afterTransition = await inspectFocus();
        await page.keyboard.press("Tab");
        const afterNextTab = await inspectFocus();
        await testInfo.attach("navigation-focus-diagnostic.json", {
          body: JSON.stringify({ afterTransition, afterNextTab }),
          contentType: "application/json",
        });
        throw error;
      }
    });
  }
  finally {
    for (const id of ids) await deleteProfileFixture(id);
  }
});
