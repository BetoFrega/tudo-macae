import type { DemoSeedSummary } from "../index";
import { accountEmail, DEMO_PASSWORD, namedCredentials, seedAccounts } from "./accounts";
import { createActivityAreaResolver } from "./activityAreas";
import { seedBusinesses } from "./businesses";
import { seedAds } from "./ads";
import { seedBlogPosts } from "./blogPosts";
import { classifiedsAs, signIn } from "./worker";

/**
 * Prints the sign-in details next to the URLs `pnpm run dev` already prints,
 * which is where somebody who just started the server is looking. The package
 * README says the same thing for anyone reading instead of running.
 */
function logCredentials(): void {
  const lines = namedCredentials()
    .map(({ email, role }) => `  ${email} / ${DEMO_PASSWORD} (${role})`)
    .join("\n");

  console.log(`Demo accounts ready — every one uses the same password:\n${lines}`);
}

/**
 * Runs the seed itself, once the guard in `seedDemoData` has said yes.
 *
 * Order is a fact of the data, not of the caller: an ad belongs to a
 * subcategory and to a business, so the catalogue and the businesses exist
 * before the ads, and the catalogue seed and every business need a signed-in
 * account, so the accounts exist first. That is why the category seed is
 * called from here rather than left beside this one in `instrumentation.ts` —
 * a caller holding several calls is a caller who can reorder them. The
 * catalogue is seeded through the same Worker operation as the button on
 * /admin/categorias.
 *
 * `bootTime` is read once and passed down, so every date the run writes is
 * measured from the same instant, following the demo-seed README.
 *
 * The Matérias become Blog posts in the Worker. The retired newsroom
 * collections (sources, captures, topics, stories), which no Worker procedure
 * writes, are not seeded.
 */
export async function runDemoSeed(): Promise<DemoSeedSummary> {
  const bootTime = Date.now();

  const uidByAccountKey = await seedAccounts();
  const administrator = await classifiedsAs(await signIn(accountEmail("admin"), DEMO_PASSWORD));
  await administrator.write("categories.seed", null);
  const resolveArea = createActivityAreaResolver(administrator);
  const idByBusinessKey = await seedBusinesses(administrator, resolveArea, bootTime);
  const idByAdKey = await seedAds(idByBusinessKey, resolveArea, bootTime);

  const articles = await seedBlogPosts(bootTime);

  logCredentials();

  return {
    seeded: true,
    accounts: uidByAccountKey.size,
    businesses: idByBusinessKey.size,
    ads: idByAdKey.size,
    articles,
  };
}
