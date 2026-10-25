import type { AdStatus } from "@tudomacae/ads/types";
import { adStatus, canDiscoverAd } from "@tudomacae/ads/visibility";
import { formatSaoPauloDateTimeInput } from "@tudomacae/civil-time";
import { toBusiness, type ActiveActivityAreas } from "./lib/businessCatalogRules";
import { identityTypeOf, isClaimableAdvertiserProfile, type AdvertiserProfileData } from "./model";

/** The stored fields of an Anúncio that the snapshot reads; title, text, contacts and owner never enter it. */
export interface SupplySnapshotAd {
  id: string;
  status?: AdStatus | "" | null;
  publicationState?: string;
  deleting?: boolean;
  advertiserProfileId?: string;
  categoryId?: string;
  subcategoryId?: string;
  createdAt: number;
  updatedAt?: number;
}

export interface SupplySnapshotInventory {
  ads: SupplySnapshotAd[];
  identities: AdvertiserProfileData[];
  /** Identities whose stored Catálogo de ofertas setting is enabled. */
  enabledCatalogs: ReadonlySet<string>;
  activityAreas: ActiveActivityAreas;
}

export interface SupplySnapshotStore {
  /** One coherent read of every Anúncio and Identidade anunciante. */
  read(): Promise<SupplySnapshotInventory>;
}

export interface SupplySnapshotDestination {
  exists(snapshotDate: string): Promise<boolean>;
  /** Writing a date again replaces that date's file. */
  write(snapshotDate: string, csv: string): Promise<void>;
}

/** Column order is the file contract the PostHog Data Warehouse reads; a rename or removal breaks its table. */
export const supplySnapshotColumns = [
  "snapshot_date", "kind", "id", "status", "publication_state", "discoverable", "identity_type", "has_owner",
  "claimable", "has_contact", "catalog_enabled", "category_id", "subcategory_id", "created_at", "updated_at",
] as const;
type SupplySnapshotRow = Record<typeof supplySnapshotColumns[number], string | number | boolean | undefined>;

/** The calendar day in Macaé, `YYYY-MM-DD`, that names one snapshot. */
export function supplySnapshotDate(now: number): string {
  return formatSaoPauloDateTimeInput(now).slice(0, 10);
}

function csvField(value: string | number | boolean | undefined) {
  if (value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

function toCsv(rows: SupplySnapshotRow[]) {
  return [supplySnapshotColumns.join(","), ...rows.map(row => supplySnapshotColumns.map(column => csvField(row[column])).join(","))]
    .map(line => `${line}\n`).join("");
}

async function identityRow(snapshotDate: string, identity: AdvertiserProfileData, inventory: SupplySnapshotInventory): Promise<SupplySnapshotRow> {
  return {
    snapshot_date: snapshotDate, kind: "identity", id: identity.id, status: undefined, publication_state: undefined,
    discoverable: (await toBusiness(identity, inventory.activityAreas)) !== null,
    identity_type: identityTypeOf(identity), has_owner: Boolean(identity.userId?.trim()),
    claimable: isClaimableAdvertiserProfile(identity), has_contact: (identity.contacts?.length ?? 0) > 0,
    catalog_enabled: inventory.enabledCatalogs.has(identity.id), category_id: undefined, subcategory_id: undefined,
    created_at: identity.createdAt, updated_at: identity.updatedAt,
  };
}

function adRow(snapshotDate: string, ad: SupplySnapshotAd, identities: Map<string, AdvertiserProfileData>): SupplySnapshotRow {
  const status = adStatus({ status: ad.status ?? null });
  const identity = ad.advertiserProfileId ? identities.get(ad.advertiserProfileId) : undefined;
  return {
    snapshot_date: snapshotDate, kind: "ad", id: ad.id, status, publication_state: ad.publicationState ?? "published",
    discoverable: canDiscoverAd({ status, ...(ad.publicationState === undefined ? {} : { publicationState: ad.publicationState }), ...(ad.deleting === undefined ? {} : { deleting: ad.deleting }) }),
    identity_type: identity ? identityTypeOf(identity) : undefined, has_owner: undefined, claimable: undefined, has_contact: undefined,
    catalog_enabled: undefined, category_id: ad.categoryId, subcategory_id: ad.subcategoryId,
    created_at: ad.createdAt, updated_at: ad.updatedAt ?? ad.createdAt,
  };
}

/**
 * Builds the daily supply snapshot: one row per Anúncio and per Identidade anunciante, without names, descriptions,
 * phone numbers, account ids or hashes of them. `run` writes once per Macaé calendar day; later runs that day skip.
 */
export function createSupplySnapshotExport(dependencies: { store: SupplySnapshotStore; destination: SupplySnapshotDestination }) {
  return {
    async run(now: number): Promise<{ snapshotDate: string; written: false } | { snapshotDate: string; written: true; ads: number; identities: number }> {
      const snapshotDate = supplySnapshotDate(now);
      if (await dependencies.destination.exists(snapshotDate)) return { snapshotDate, written: false };
      const inventory = await dependencies.store.read();
      const identities = new Map(inventory.identities.map(identity => [identity.id, identity]));
      const rows = [
        ...inventory.ads.map(ad => adRow(snapshotDate, ad, identities)),
        ...await Promise.all(inventory.identities.map(identity => identityRow(snapshotDate, identity, inventory))),
      ];
      await dependencies.destination.write(snapshotDate, toCsv(rows));
      return { snapshotDate, written: true, ads: inventory.ads.length, identities: inventory.identities.length };
    },
  };
}
