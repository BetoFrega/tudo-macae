import { AdvertiserProfileAdministrationError } from "@tudomacae/advertiser-identity/administration";
import type { ActivityArea, ActivityAreaResolver } from "./activityAreas";
import { accountEmail, DEMO_PASSWORD } from "./accounts";
import { timestampDaysBeforeBoot } from "./demoClock";
import { demoIdFor } from "./demoKey";
import businessData from "./data/businesses.json";
import { classifiedsAs, fixture, signIn, type DemoClassifieds } from "./worker";

interface DemoBusinessActivity {
  categorySlug: string;
  subcategorySlug: string;
}

interface DemoBusinessBase {
  key: string;
  title: string;
  description: string;
  contacts?: { number: string; isWhatsapp: boolean }[];
  activityAreas: DemoBusinessActivity[];
  createdDaysAgo: number;
}

type DemoBusiness = DemoBusinessBase & ({
  /** A key from `accounts.json`; that account creates and owns the business. */
  accountKey: string;
  claimable?: never;
  sourceUrl?: never;
} | {
  accountKey?: never;
  claimable: true;
  sourceUrl: string;
});

const businesses: readonly DemoBusiness[] = businessData as DemoBusiness[];

/**
 * The owned business behind a data-file key. Ads and photos never name their
 * owner on their own: it is always the account behind the business, so the two
 * can never disagree.
 */
export function ownedBusiness(key: string): DemoBusiness & { accountKey: string } {
  const business = businesses.find(candidate => candidate.key === key);
  if (!business?.accountKey) {
    throw new Error(`Demo data names business "${key}", which businesses.json does not define with an owner.`);
  }
  return { ...business, accountKey: business.accountKey };
}

async function createOwned(business: DemoBusiness & { accountKey: string }, activityAreas: ActivityArea[]) {
  const owner = await classifiedsAs(await signIn(accountEmail(business.accountKey), DEMO_PASSWORD));
  // A fixed operation id makes a second run against the same fixture replay
  // the creation and return the same profile instead of a duplicate.
  return owner.write<string>("profiles.create", {
    title: business.title,
    description: business.description,
    contacts: business.contacts ?? [],
    activityAreas,
    operationId: demoIdFor(business.key),
  });
}

async function createPublicInformation(
  administrator: DemoClassifieds,
  business: DemoBusiness & { sourceUrl: string },
  activityAreas: ActivityArea[],
) {
  const input = {
    title: business.title,
    description: business.description,
    contacts: business.contacts ?? [],
    activityAreas,
    sourceUrl: business.sourceUrl,
    idempotencyKey: demoIdFor(business.key),
  };
  try {
    return (await administrator.write<{ profileId: string }>("profiles.admin.create", input)).profileId;
  }
  catch (error) {
    // Another business sharing a title or contact asks for the same
    // confirmation /admin/negocios shows; the data file already decided.
    if (!(error instanceof AdvertiserProfileAdministrationError && error.code === "possibleDuplicate")) throw error;
    const duplicateConfirmationToken = error.details.confirmationToken;
    return (await administrator.write<{ profileId: string }>("profiles.admin.create", { ...input, duplicateConfirmationToken })).profileId;
  }
}

/**
 * Creates one business per entry in the data file and returns the profile id
 * each data-file key resolved to.
 *
 * Owned businesses are created by their own account, so ownership is the
 * account behind `accountKey`; public-information businesses are created by
 * the administrator, without an owner, and remain claimable. The Worker
 * stamps the current time on both, so each is then dated by `createdDaysAgo`.
 *
 * An entry without `contacts` is created without any. One of them has none on
 * purpose, so the empty state remains visible without anyone arranging it.
 */
export async function seedBusinesses(
  administrator: DemoClassifieds,
  resolveArea: ActivityAreaResolver,
  bootTime: number,
): Promise<ReadonlyMap<string, string>> {
  const idByKey = new Map<string, string>();

  for (const business of businesses) {
    const activityAreas = await Promise.all(business.activityAreas.map(activity =>
      resolveArea(activity.categorySlug, activity.subcategorySlug, `business "${business.key}"`)));
    const id = business.claimable
      ? await createPublicInformation(administrator, business, activityAreas)
      : await createOwned(business, activityAreas);
    await fixture("/backdate", { kind: "profile", id, createdAt: timestampDaysBeforeBoot(bootTime, business.createdDaysAgo) });
    idByKey.set(business.key, id);
  }

  return idByKey;
}
