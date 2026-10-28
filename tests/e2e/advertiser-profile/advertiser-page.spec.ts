import { pageObject } from "../_helpers/fixtures/POMs/pageObject";
import { expect, test } from "../_helpers/fixtures";
import { makeRandomString } from "../../_helpers/makeRandomString";
import { click } from "../_helpers/click";
import { createProfileFixture } from "../_helpers/advertiser-profile/profileFixtures";
import { createAdRecordFixture } from "../_helpers/ads/publicationFixtures";
import { deleteAdFixture, deleteProfileFixture } from "../../_helpers/auth/db/deleteFixtureDocuments";
import { slugify } from "@tudomacae/text-normalization/slugify";

test.describe("Advertiser Profile Page", () => {
  test("Exibição de perfil com anúncios", async ({
    page,
    userCredentials,
    authentication,
    adProfileFixture,
    adFixture,
  }) => {
    await test.step("Acessar perfil de anunciante com anúncios", async () => {
      await authentication.login(userCredentials);
      await page.goto(`/anunciante/${adProfileFixture.id}`);
      await expect(page).toHaveURL(
        new RegExp(`/negocio/${adProfileFixture.id}/${slugify(adProfileFixture.title)}$`),
      );
      await expect(
        pageObject(page).getByRole("heading", { name: adProfileFixture.title }).filter({ visible: true }),
      ).toBeVisible();
      await expect(
        pageObject(page).getByRole("heading", { name: adFixture.title })
          .filter({ visible: true }),
      ).toBeVisible();
    });
  });

  test("Negócio sem anúncios não exibe um painel vazio de Classificados", async ({
    page,
    userCredentials,
    authentication,
    categoryFixture,
  }) => {
    const title = `Loja Navegação ${makeRandomString()}`;
    const profileId = await createProfileFixture(userCredentials, {
      title,
      description: "Negócio local sem anúncio publicado.",
      contacts: [{ number: "22999999999", isWhatsapp: true }],
      activityAreas: [{
        categoryId: categoryFixture.category.id,
        subcategoryId: categoryFixture.subcategory.id,
      }],
    });
    try {
      await authentication.login(userCredentials);
      await page.goto(`/negocio/${profileId}/${slugify(title)}`);
      await expect(pageObject(page).getByRole("heading", { name: title }).filter({ visible: true })).toBeVisible();
      await expect(pageObject(page).getByRole("heading", { name: /Anúncios deste negócio/u })).toHaveCount(0);
      await expect(pageObject(page).getByText("Sem anúncios publicados agora")).toBeVisible();
      await expect(pageObject(page).getByRole("link", {
        name: `${categoryFixture.category.name}: ${categoryFixture.subcategory.name}`,
        exact: true,
      })).toBeVisible();

      await click(pageObject(page).getByRole("link", { name: "Voltar para Negócios" }).filter({ visible: true }));
      await expect(page).toHaveURL(/\/negocios$/u);
    }
    finally {
      await deleteProfileFixture(profileId);
    }
  });

  test("mantém a leitura legada de perfil coerente fora do catálogo", async ({
    page,
    verifiedUserCredentials,
    authentication,
    categoryFixture,
  }) => {
    // An unbroken 32-character word must wrap inside the profile card at 390 px with 200 % text.
    const title = `${"P".repeat(32)} ${makeRandomString()}`;
    const description = "Perfil ainda sem área de atuação ativa.";
    const adTitle = `Anúncio legado ${makeRandomString()}`;
    const profileId = await createProfileFixture(verifiedUserCredentials, {
      title,
      description,
      contacts: [{ number: "22999999999", isWhatsapp: true }],
    });
    const ad = await createAdRecordFixture(verifiedUserCredentials, {
      advertiserProfileId: profileId,
      categoryId: categoryFixture.category.id,
      subcategoryId: categoryFixture.subcategory.id,
      title: adTitle,
      text: "Anúncio criado para verificar a leitura legada do perfil.",
    });
    try {
      await authentication.login(verifiedUserCredentials);
      await page.goto(`/anunciante/${profileId}`);
      await expect(page).toHaveURL(new RegExp(`/anunciante/${profileId}$`));
      const profileTitle = pageObject(page).getByRole("heading", { name: title, exact: true }).filter({ visible: true });
      await expect(profileTitle).toBeVisible();

      await test.step("o perfil e o anúncio refluem em 390 px com texto a 200 %", async () => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.evaluate(() => {
          document.documentElement.style.fontSize = "200%";
        });
        const profileDescription = pageObject(page).getByText(description, { exact: true });
        const profileContact = pageObject(page).getByRole("link", { name: "WhatsApp (22) 99999-9999", exact: true });
        const adCardTitle = pageObject(page).getByRole("heading", { name: adTitle, exact: true, level: 3 });
        for (const locator of [profileDescription, profileContact, adCardTitle]) await expect(locator).toBeVisible();
        const contentBounds = await Promise.all([profileTitle, profileDescription, profileContact].map(locator => locator.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          return { left: bounds.left, right: bounds.right };
        })));
        const profileLayout = await profileTitle.evaluate((title) => {
          const card = title.closest<HTMLElement>("[data-slot='card']")!;
          const titleBounds = title.getBoundingClientRect();
          const cardBounds = card.getBoundingClientRect();
          // Names the widest offenders so a failure points at the element that overflows.
          const overflowCandidates = Array.from(document.body.querySelectorAll<HTMLElement>("*"))
            .map((element) => {
              const bounds = element.getBoundingClientRect();
              const overflow = Math.max(-bounds.left, bounds.right - window.innerWidth, element.scrollWidth - element.clientWidth);
              return { tag: element.tagName.toLowerCase(), className: (element.getAttribute("class") ?? "").slice(0, 160), bounds: [bounds.left, bounds.right], overflow };
            })
            .filter(candidate => candidate.overflow > 1)
            .sort((left, right) => right.overflow - left.overflow)
            .slice(0, 12);
          return {
            viewportWidth: window.innerWidth,
            rootFontSize: getComputedStyle(document.documentElement).fontSize,
            documentWidth: document.documentElement.scrollWidth,
            titleLeft: titleBounds.left,
            titleRight: titleBounds.right,
            titleWidth: titleBounds.width,
            titleClientWidth: title.clientWidth,
            titleScrollWidth: title.scrollWidth,
            cardLeft: cardBounds.left,
            cardRight: cardBounds.right,
            cardClientWidth: card.clientWidth,
            cardScrollWidth: card.scrollWidth,
            overflowCandidates,
          };
        });
        const adCardClippedContent = await adCardTitle.evaluate((title) => {
          const card = title.closest<HTMLElement>("[data-slot='card']")!;
          const cardBounds = card.getBoundingClientRect();
          return Array.from(card.querySelectorAll<HTMLElement>("*"))
            .filter((element) => {
              const bounds = element.getBoundingClientRect();
              if (bounds.width <= 0 || bounds.height <= 0) return false;
              return bounds.left < cardBounds.left - 1 || bounds.right > cardBounds.right + 1
                || element.scrollWidth > element.clientWidth + 1;
            })
            .map(element => ({ tag: element.tagName.toLowerCase(), className: (element.getAttribute("class") ?? "").slice(0, 160) }));
        });
        const layout = { contentBounds, adCardClippedContent, ...profileLayout };
        const diagnostic = `Profile reflow geometry: ${JSON.stringify(layout)}`;
        expect(layout.viewportWidth, diagnostic).toBe(390);
        expect(layout.rootFontSize, diagnostic).toBe("32px");
        for (const bounds of layout.contentBounds) {
          expect(bounds.left, diagnostic).toBeGreaterThanOrEqual(-1);
          expect(bounds.right, diagnostic).toBeLessThanOrEqual(layout.viewportWidth + 1);
        }
        expect(layout.titleLeft, diagnostic).toBeGreaterThanOrEqual(layout.cardLeft - 1);
        expect(layout.titleRight, diagnostic).toBeLessThanOrEqual(layout.cardRight + 1);
        expect(layout.cardLeft, diagnostic).toBeGreaterThanOrEqual(-1);
        expect(layout.cardRight, diagnostic).toBeLessThanOrEqual(layout.viewportWidth + 1);
        expect(layout.titleScrollWidth, diagnostic).toBeLessThanOrEqual(layout.titleClientWidth + 1);
        expect(layout.cardScrollWidth, diagnostic).toBeLessThanOrEqual(layout.cardClientWidth + 1);
        expect(layout.documentWidth, diagnostic).toBeLessThanOrEqual(layout.viewportWidth);
        // An avatar kept beside the text leaves the profile text a sliver of the card.
        expect(layout.titleWidth, diagnostic).toBeGreaterThanOrEqual(layout.cardClientWidth / 2);
        expect(layout.adCardClippedContent, diagnostic).toEqual([]);
      });
    }
    finally {
      await deleteAdFixture(ad.id);
      await deleteProfileFixture(profileId);
    }
  });
});
