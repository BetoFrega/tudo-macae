import { expect, test } from "vitest";
import { z } from "zod";
import { createClassifiedsPersistence, createClassifiedsCapabilities } from "../classifieds";
import { PersistenceLimit, type PersistenceMetrics } from "@tudomacae/classifieds-persistence";
import { now, capability, classifiedsDatabase } from "./classifiedsRuntimeHarness";

const entries = z.array(z.object({ id: z.string(), slug: z.string(), lastModified: z.number().optional() }).strict());

test("sitemap lists only discoverable D1 ads, newest first, with their last public change", async () => {
  const store = createClassifiedsPersistence({ database: await classifiedsDatabase() });
  const records = [
    ["older", { createdAt: now - 2 }],
    ["updated", { createdAt: now - 1, updatedAt: now + 5 }],
    ["newest", { createdAt: now, publicationState: "published" }],
    ["pending", { createdAt: now, publicationState: "pending" }],
    ["paused", { createdAt: now, status: "paused" }],
    ["deleting", { createdAt: now, deleting: true }],
  ] as const;
  for (const [id, extra] of records) {
    await store.importRecord({ kind: "ad", id, body: { userId: "owner", status: "active", slug: id, ...extra } });
  }
  expect(entries.parse((await capability("ads.sitemap", {})).value)).toEqual([
    { id: "newest", slug: "newest", lastModified: now },
    { id: "updated", slug: "updated", lastModified: now + 5 },
    { id: "older", slug: "older", lastModified: now - 2 },
  ]);
  expect((await capability("ads.sitemap", { after: "cursor" })).error).toBeDefined();
});

test("sitemap reads one bounded indexed statement without returning ad bodies", async () => {
  const store = createClassifiedsPersistence({ database: await classifiedsDatabase() });
  const large = "x".repeat(550_000);
  for (let index = 0; index < 3; index++) {
    await store.importRecord({ kind: "ad", id: `large-${index}`, body: { userId: "owner", createdAt: now + index, status: "active", slug: String(index), historicalMetadata: large } });
  }
  const metrics: PersistenceMetrics[] = [];
  const measured = createClassifiedsPersistence({ database: await classifiedsDatabase(), observe: (value) => {
    metrics.push(value);
  } });
  const reader = createClassifiedsCapabilities({ persistence: measured, correlationId: "sitemap", now: () => now });
  expect(entries.parse(await reader.read("ads.sitemap", {})).map(entry => entry.id)).toEqual(["large-2", "large-1", "large-0"]);
  expect(metrics).toHaveLength(1);
  expect(metrics[0]).toMatchObject({ operation: "page", statements: 1 });
  expect(metrics[0]!.returnedBytes).toBeLessThan(1_000);
  expect((await measured.adSitemap(2)).map(row => row.id)).toEqual(["large-2", "large-1"]);
  for (const limit of [0, 50_002, 1.5]) await expect(measured.adSitemap(limit)).rejects.toBeInstanceOf(PersistenceLimit);
});
