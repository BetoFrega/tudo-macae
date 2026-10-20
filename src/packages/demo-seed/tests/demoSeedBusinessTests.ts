import { expect, test } from "vitest";
import { seedDemoData } from "../index";
import { updateWorkerRoles } from "../../../../tests/_helpers/auth/helpers/workerSession";
import {
  asAdmin,
  categoryCatalog,
  demo,
  DEMO_PASSWORD,
  findAccount,
  fixture,
  NAMED_ACCOUNTS,
  profileTitled,
  seededAds,
  seededProfiles,
  seededUsers,
  sessionFor,
  type DemoAccount,
} from "./demoSeedFixture";

export function registerAccountAndBusinessTests() {
  test.each(NAMED_ACCOUNTS)(
    "$email signs in with the documented password",
    async ({ email }) => {
      // The file's cached session, so this sign-in counts toward the per-account limit only once.
      await expect(sessionFor(email, DEMO_PASSWORD)).resolves.toEqual(expect.any(String));
    },
  );

  test.each(NAMED_ACCOUNTS)("$email holds exactly its own claims", async ({ email, claims }) => {
    const account = await findAccount(email);

    // `undefined` and `{}` are both "no claims"; the advertiser role is the
    // absence of a claim, and asserting one spelling would pin the wrong rule.
    expect(account?.claims ?? {}).toEqual(claims ?? {});
  });

  test("takes back a role the data file no longer grants", async () => {
    const { uid } = (await findAccount("advertiser@demo.local"))!;

    // Stands in for a role granted by hand, or left over from what this
    // account used to be in accounts.json.
    await updateWorkerRoles(uid, { admin: true });

    await seedDemoData();

    expect((await findAccount("advertiser@demo.local"))?.claims ?? {}).toEqual({});
  });

  test("gives every owned profile a uid that really exists", async () => {
    const ownedProfiles = (await seededProfiles()).filter(profile => typeof profile.userId === "string");

    const owners = await Promise.all(
      ownedProfiles.map(profile => fixture<DemoAccount | null>("/find", { uid: profile.userId })),
    );

    expect(owners.every(owner => owner !== null)).toBe(true);
    expect(owners.length).toBeGreaterThan(0);
  });

  test("creates a searchable business catalog with and without active ads", async () => {
    const [profiles, ads, categories] = await Promise.all([seededProfiles(), seededAds(), categoryCatalog()]);
    const catalog = await (await asAdmin()).read<{ items: { id: string }[]; nextCursor?: string }>("business.list", { limit: 50 });
    const activeBusinessIds = new Set(ads.filter(ad => ad.status === "active").map(ad => ad.advertiserProfileId));
    const activeAreas = new Set(categories
      .filter(category => category.isActive)
      .flatMap(category => category.subcategories
        .filter(subcategory => subcategory.isActive)
        .map(subcategory => `${category.id}/${subcategory.id}`)));

    for (const business of profiles) {
      expect(business.activityAreas?.length).toBeGreaterThan(0);
      for (const area of business.activityAreas ?? []) {
        expect(activeAreas.has(`${area.categoryId}/${area.subcategoryId}`)).toBe(true);
      }
    }

    const catalogBusinesses = profiles.filter(profile => (profile.contacts?.length ?? 0) > 0);
    expect(catalogBusinesses.length).toBeGreaterThan(0);
    const seededCatalog = catalog.items.filter(business => business.id !== demo.handMade?.profileId);
    expect(seededCatalog.map(business => business.id).sort()).toEqual(
      catalogBusinesses.map(profile => profile.id).sort(),
    );
    expect(catalog.nextCursor).toBeUndefined();
    expect(catalogBusinesses.some(profile => activeBusinessIds.has(profile.id))).toBe(true);
    expect(catalogBusinesses.some(profile => !activeBusinessIds.has(profile.id))).toBe(true);
    expect(activeBusinessIds.has(profileTitled(profiles, "Pet Shop Lagoa").id)).toBe(false);
  });

  test("leaves one profile with neither photo nor contacts, on purpose", async () => {
    const bare = (await seededProfiles()).filter(profile => !profile.photoPath && !profile.contacts?.length);

    expect(bare).toHaveLength(1);
  });

  test("writes no date in the future", async () => {
    const [profiles, ads] = await Promise.all([seededProfiles(), seededAds()]);

    for (const record of [...profiles, ...ads]) {
      expect(record.createdAt).toBeLessThanOrEqual(demo.bootTime);
    }
  });

  test("a second boot refreshes the mass instead of duplicating it", async () => {
    expect(demo.secondRun).toEqual(demo.firstRun);

    const [profiles, users, ads] = await Promise.all([seededProfiles(), seededUsers(), seededAds()]);

    expect(profiles).toHaveLength(demo.firstRun.businesses);
    expect(users).toHaveLength(demo.firstRun.accounts);
    expect(ads).toHaveLength(demo.firstRun.ads);
  });

  test("leaves a profile and an ad created by hand between boots alone", async () => {
    const admin = await asAdmin();
    const handMade = demo.handMade!;

    expect(await admin.read("profiles.private", { id: handMade.profileId })).toMatchObject({ title: "Feito à mão" });
    expect(await admin.read("ads.owned", { id: handMade.adId })).toMatchObject({ title: "Feito à mão" });
  });
}
