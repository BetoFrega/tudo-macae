import type { SupplySnapshotDestination } from "@tudomacae/advertiser-identity/supplySnapshot";

/** Hive-style `date=` partitions let the PostHog R2 source read each day's file as a new append-only batch. */
export const supplySnapshotKey = (snapshotDate: string) => `classifieds-supply/date=${snapshotDate}/supply.csv`;

export function createR2SupplySnapshotDestination(bucket: R2Bucket): SupplySnapshotDestination {
  return {
    async exists(snapshotDate) {
      return (await bucket.head(supplySnapshotKey(snapshotDate))) !== null;
    },
    async write(snapshotDate, csv) {
      await bucket.put(supplySnapshotKey(snapshotDate), csv, { httpMetadata: { contentType: "text/csv; charset=utf-8" } });
    },
  };
}
