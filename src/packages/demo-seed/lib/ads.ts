import fs from "node:fs";
import path from "node:path";
import type { AdStatus } from "@tudomacae/ads/types";
import type { ActivityAreaResolver } from "./activityAreas";
import { accountEmail, DEMO_PASSWORD } from "./accounts";
import { timestampDaysBeforeBoot } from "./demoClock";
import { demoIdFor } from "./demoKey";
import adData from "./data/ads.json";
import { ownedBusiness } from "./businesses";
import { classifiedsAs, fixture, signIn } from "./worker";

interface DemoAd {
  key: string;
  /** A key from `businesses.json`. The ad belongs to that business and is
   * created by the business's own `accountKey`. */
  businessKey: string;
  categorySlug: string;
  subcategorySlug: string;
  title: string;
  /** A file in `data/ad-bodies/`, one per subcategory, reused across every ad
   * that names it — see the package README for why. */
  bodyFile: string;
  status: AdStatus;
  createdDaysAgo: number;
}

const ads: readonly DemoAd[] = adData as DemoAd[];

/** The business a data-file ad advertises through. */
export function businessKeyForAd(adKey: string): string {
  const ad = ads.find(candidate => candidate.key === adKey);
  if (!ad) throw new Error(`Demo data names ad "${adKey}", which ads.json does not define.`);
  return ad.businessKey;
}

const bodyCache = new Map<string, string>();

/**
 * Reads a body file once per boot; every later ad in the same subcategory
 * reuses it.
 *
 * Same pattern as the privacy-policy and terms pages: `fs` against
 * `process.cwd()`. The Node-only instrumentation boundary keeps this module
 * out of the Edge bundle; `shouldSeedDemoData` still prevents writes outside
 * `next dev`.
 */
function readBody(fileName: string): string {
  const cached = bodyCache.get(fileName);
  if (cached !== undefined) return cached;

  const text = fs.readFileSync(
    path.join(
      process.cwd(),
      "src/packages/demo-seed/lib/data/ad-bodies",
      fileName,
    ),
    "utf8",
  );
  bodyCache.set(fileName, text);
  return text;
}

/**
 * Creates one ad per entry in the data file, each in a real subcategory and
 * under a real business, and returns the id each data-file key resolved to.
 *
 * The Worker only lets an ad's owner create it, so each ad is created signed in
 * as the account behind its business. The ad id is `demo-<key>`, which makes a
 * second run against the same fixture replay the creation instead of
 * duplicating it. Ads start active; the paused ones are paused afterwards,
 * through the same operation the owner's "Pausar" button uses.
 */
export async function seedAds(
  idByBusinessKey: ReadonlyMap<string, string>,
  resolveArea: ActivityAreaResolver,
  bootTime: number,
): Promise<ReadonlyMap<string, string>> {
  const idByKey = new Map<string, string>();

  for (const ad of ads) {
    const { accountKey } = ownedBusiness(ad.businessKey);
    const advertiserProfileId = idByBusinessKey.get(ad.businessKey)!;

    const owner = await classifiedsAs(await signIn(accountEmail(accountKey), DEMO_PASSWORD));
    const id = demoIdFor(ad.key);
    await owner.write("ads.create", {
      id,
      ...await resolveArea(ad.categorySlug, ad.subcategorySlug, `ad "${ad.key}"`),
      advertiserProfileId,
      title: ad.title,
      text: readBody(ad.bodyFile),
    });
    if (ad.status !== "active") await owner.write("ads.status", { id, status: ad.status });
    await fixture("/backdate", { kind: "ad", id, createdAt: timestampDaysBeforeBoot(bootTime, ad.createdDaysAgo) });
    idByKey.set(ad.key, id);
  }

  return idByKey;
}
