import { test as base } from "@playwright/test";
import type { UserSidebar } from "../fixtures/POMs/UserSidebar";
import { AdminAdsPage } from "./POMs/AdminAdsPage";
import { AdminCategoriesPage } from "./POMs/AdminCategoriesPage";
import { AdminDashboardPage } from "./POMs/AdminDashboardPage";
import { AdminMediaPage } from "./POMs/AdminMediaPage";
import { AdminProfilesPage } from "./POMs/AdminProfilesPage";
import { AdminUsersPage } from "./POMs/AdminUsersPage";

export const adminTest = base.extend<{
  adminCategoriesPage: AdminCategoriesPage;
  adminDashboardPage: AdminDashboardPage;
  adminProfilesPage: AdminProfilesPage;
  adminMediaPage: AdminMediaPage;
  adminUsersPage: AdminUsersPage;
  adminAdsPage: AdminAdsPage;
  userSidebar: UserSidebar;
}>({
  adminDashboardPage: async ({ page, userSidebar }, use) => {
    await use(new AdminDashboardPage(page, userSidebar));
  },
  adminCategoriesPage: async (
    { page, adminDashboardPage, userSidebar },
    use,
  ) => {
    await use(new AdminCategoriesPage(page, userSidebar, adminDashboardPage));
  },
  adminProfilesPage: async ({ page, userSidebar, adminDashboardPage }, use) => {
    await use(new AdminProfilesPage(page, userSidebar, adminDashboardPage));
  },
  adminMediaPage: async ({ page }, use) => {
    await use(new AdminMediaPage(page));
  },
  adminUsersPage: async ({ page, userSidebar, adminDashboardPage }, use) => {
    await use(new AdminUsersPage(page, userSidebar, adminDashboardPage));
  },
  adminAdsPage: async ({ page, userSidebar, adminDashboardPage }, use) => {
    await use(new AdminAdsPage(page, userSidebar, adminDashboardPage));
  },
});
