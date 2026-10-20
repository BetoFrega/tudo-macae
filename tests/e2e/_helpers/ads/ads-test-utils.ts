import test from "@playwright/test";
import { createAdThroughApp } from "./createAdThroughApp";
import type { AdData } from "@tudomacae/ads/types";
import { deleteAdFixture } from "../../../_helpers/auth/db/deleteFixtureDocuments";
import type { AdProfileFixture } from "../advertiser-profile/ad-profile-test-utils";
import type { UserCredentials } from "../auth/auth-test-utils";
import type { CategorySubcategoryFixture } from "../categories/categories-test-utils";
import type { UserSidebar } from "../fixtures/POMs/UserSidebar";
import { makeRandomString } from "../../../_helpers/makeRandomString";
import { AdDetailsPage } from "./POMs/AdDetailsPage";
import { CreateAdPage } from "./POMs/CreateAdPage";
import { EditAdPage } from "./POMs/EditAdPage";
import { MyAdsPage } from "./POMs/MyAdsPage";

export const adsTest = test.extend<{
  createAdPage: CreateAdPage;
  editAdPage: EditAdPage;
  adDetailsPage: AdDetailsPage;
  myAdsPage: MyAdsPage;
  // deps
  userCredentials: UserCredentials;
  anotherUserCredentials: UserCredentials;
  adProfileFixture: AdProfileFixture;
  categoryFixture: CategorySubcategoryFixture;
  userSidebar: UserSidebar;
  // fixtures
  adFixture: AdData;
  pausedAdFixture: AdData;
}>({
  createAdPage: async ({ page }, use) => {
    await use(new CreateAdPage(page));
  },
  editAdPage: async ({ page }, use) => {
    await use(new EditAdPage(page));
  },
  adDetailsPage: async ({ page }, use) => {
    await use(new AdDetailsPage(page));
  },
  myAdsPage: async ({ page, userSidebar }, use) => {
    await use(new MyAdsPage(page, userSidebar));
  },
  adFixture: async (
    { browser, userCredentials, adProfileFixture, categoryFixture }, use,
  ) => {
    const ad = await test.step("ad-fixture: prepare active", () => createAdThroughApp(browser, userCredentials, categoryFixture, adProfileFixture, adContent(), true));
    try {
      await use(ad);
    }
    finally {
      await test.step("ad-fixture: delete", () => deleteAdFixture(ad.id));
    }
  },
  pausedAdFixture: async (
    { browser, userCredentials, adProfileFixture, categoryFixture }, use,
  ) => {
    const ad = await test.step("ad-fixture: prepare paused", () => createAdThroughApp(browser, userCredentials, categoryFixture, adProfileFixture, adContent(), false));
    try {
      await use(ad);
    }
    finally {
      await test.step("ad-fixture: delete", () => deleteAdFixture(ad.id));
    }
  },
});

function adContent() {
  return {
    title: `Test Ad Title - ${makeRandomString()}`,
    text: `This is a test ad - ${makeRandomString()}`,
  };
}
