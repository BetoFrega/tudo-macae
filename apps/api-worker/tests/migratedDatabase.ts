import { Miniflare } from "miniflare";
import { cp, readFile } from "node:fs/promises";

type Options = ConstructorParameters<typeof Miniflare>[0];

/**
 * Migrating the classifieds D1 costs about as much as booting Miniflare, so a suite migrates it
 * once, into `template`, and each test starts from a copy of that persisted database.
 */
export async function copyMigratedDatabase(options: Options, template: string, binding: string, migrations: string[]) {
  const persistence = options.resourcePersistencePath;
  if (typeof persistence !== "string") throw new Error("The runtime needs a resourcePersistencePath to copy the migrated database into.");
  if (!templates.has(template)) templates.set(template, migrate({ ...options, resourcePersistencePath: template }, binding, migrations));
  await templates.get(template);
  await cp(template, persistence, { recursive: true });
}

const templates = new Map<string, Promise<void>>();

async function migrate(options: Options, binding: string, migrations: string[]) {
  const runtime = new Miniflare(options);
  try {
    const db = await runtime.getD1Database(binding);
    // D1 exec requires each complete statement/trigger on one line.
    for (const migration of migrations) await db.exec(await readFile(`apps/api-worker/migrations-classifieds/${migration}`, "utf8"));
  }
  finally {
    await runtime.dispose();
  }
}
