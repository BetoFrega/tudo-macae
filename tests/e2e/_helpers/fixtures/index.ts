/** biome-ignore-all lint/correctness/noEmptyPattern: playwright requires empty objects when we are not using anything for the fixture */
import { test as base, mergeTests } from "@playwright/test";
import { httpDiagnosticsTest } from "../httpDiagnosticsTest";
import { adminTest } from "../admin/admin-test-utils";
import { adsTest } from "../ads/ads-test-utils";
import { adProfileTest } from "../advertiser-profile/ad-profile-test-utils";
import { authTest } from "../auth/auth-test-utils";
import { categoriesTest } from "../categories/categories-test-utils";
import { Header } from "./POMs/Header";
import { HomePage } from "./POMs/HomePage";
import { ProfilePage } from "./POMs/ProfilePage";
import { UserSidebar } from "./POMs/UserSidebar";

type MyFixtures = {
  // POMs

  profilePage: ProfilePage;
  header: Header;
  homePage: HomePage;
  userSidebar: UserSidebar;

};

export const legacyTest = base.extend<MyFixtures>({
  profilePage: async ({ page, userSidebar }, use) => {
    await use(new ProfilePage(page, userSidebar));
  },
  header: async ({ page }, use) => {
    await use(new Header(page));
  },
  homePage: async ({ page }, use) => {
    await use(new HomePage(page));
  },
  userSidebar: async ({ page }, use) => {
    await use(new UserSidebar(page));
  },
});

export const test = mergeTests(
  legacyTest,
  adminTest,
  adsTest,
  authTest,
  categoriesTest,
  adProfileTest,
  httpDiagnosticsTest,
);

export { expect } from "@playwright/test";
