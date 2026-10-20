import test from "@playwright/test";
import type { AdvertiserProfileData } from "@tudomacae/advertiser-identity/model";
import { deleteProfileFixture } from "../../../_helpers/auth/db/deleteFixtureDocuments";
import { createProfileFixture, readProfileFixture } from "./profileFixtures";
import type { UserCredentials } from "../auth/auth-test-utils";
import { makeRandomString } from "../../../_helpers/makeRandomString";
import type { CategorySubcategoryFixture } from "../categories/categories-test-utils";

export type AdProfileFixture = AdvertiserProfileData;

export const adProfileTest = test.extend<{
  // fixtures
  adProfileFixture: AdProfileFixture;
  userCredentials: UserCredentials;
  categoryFixture: CategorySubcategoryFixture;
}>({
  // fixtures
  adProfileFixture: async ({ userCredentials, categoryFixture }, use) => {
    const randomStr = makeRandomString();
    const profileId = await createProfileFixture(userCredentials, {
      title: `Test Ad Profile - ${randomStr}`,
      description: `This is the "${randomStr}" test advertiser profile.`,
      contacts: [{
        number: "22999999999",
        isWhatsapp: true,
      }, {
        number: "22999999990",
        isWhatsapp: false,
      }],
      activityAreas: [{
        categoryId: categoryFixture.category.id,
        subcategoryId: categoryFixture.subcategory.id,
      }],
    });
    const profile = await readProfileFixture(userCredentials, profileId);
    if (!profile)
      throw new Error("Failed to create advertiser profile fixture");
    await use(profile);
    await deleteProfileFixture(profileId);
  },
});
