import { confirmDisposableEmail } from "../../../_helpers/auth/helpers/verificationAccounts";
import { expect, test, type Browser } from "@playwright/test";
import { getAdUseCase } from "@/integrations/ads/use-cases/getAdUseCase";
import { playwrightTarget } from "../../../../bin/playwrightTarget";
import type { AdProfileFixture } from "../advertiser-profile/ad-profile-test-utils";
import type { UserCredentials } from "../auth/auth-test-utils";
import { loginUser } from "../auth/helpers/authentication";
import type { CategorySubcategoryFixture } from "../categories/categories-test-utils";
import { UserSidebar } from "../fixtures/POMs/UserSidebar";
import { CreateAdPage } from "./POMs/CreateAdPage";
import { MyAdsPage } from "./POMs/MyAdsPage";
import { classifiedsFixtureClient } from "./classifiedsFixtureClient";

export async function createAdThroughApp(
  browser: Browser,
  credentials: UserCredentials,
  category: CategorySubcategoryFixture,
  profile: AdProfileFixture,
  content: { title: string; text: string },
  active: boolean,
) {
  await confirmDisposableEmail(credentials.email);
  const context = await browser.newContext({ baseURL: playwrightTarget().origin });
  try {
    const page = await context.newPage();
    await test.step("ad-fixture: login", async () => {
      const client = await classifiedsFixtureClient(credentials);
      if (client) await client.installSession(context, playwrightTarget().origin);
      else await loginUser(page, credentials);
    });
    await test.step("ad-fixture: open form", () => page.goto("/publicar"));
    await new CreateAdPage(page).createAd({
      category: category.category.name,
      subcategory: category.subcategory.name,
      advertiserProfile: profile.title,
      ...content,
    });
    await test.step("ad-fixture: wait for detail", () => expect(page).toHaveURL(/\/anuncio\/[^/]+\/[^/]+$/));
    const id = new URL(page.url()).pathname.split("/")[2];
    if (!active) {
      const ads = new MyAdsPage(page, new UserSidebar(page));
      await test.step("ad-fixture: open my ads", () => ads.goto());
      await test.step("ad-fixture: pause", () => ads.pauseAd(content.title));
    }
    const ad = await test.step("ad-fixture: resolve", () => getAdUseCase({ id }));
    if (!ad) throw new Error("Created ad fixture could not be resolved.");
    return ad;
  }
  finally {
    await test.step("ad-fixture: close context", () => context.close());
  }
}
