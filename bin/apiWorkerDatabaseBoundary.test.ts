import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

// Each context keeps its own D1 database (docs/adr/0045-separate-api-worker-databases.md).
const worker = "apps/api-worker";
const sequences = { authentication: "migrations", classifieds: "migrations-classifieds", editorial: "migrations-editorial" } as const;

const migrations = (directory: string) => readdirSync(join(worker, directory)).filter(file => file.endsWith(".sql"))
  .map(file => ({ file, sql: readFileSync(join(worker, directory, file), "utf8") }));

function createdObjects(directory: string) {
  return migrations(directory).flatMap(({ sql }) =>
    [...sql.matchAll(/CREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX|TRIGGER|VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi)].map(match => match[1]!));
}

test("each migration sequence creates only its own context's objects", () => {
  expect(createdObjects(sequences.classifieds).filter(name => !name.startsWith("classifieds_"))).toEqual([]);
  expect(createdObjects(sequences.editorial).filter(name => !name.startsWith("editorial_"))).toEqual([]);
  for (const { file, sql } of migrations(sequences.authentication)) expect(sql, file).not.toMatch(/classifieds_|editorial_/);
  for (const { file, sql } of migrations(sequences.classifieds)) expect(sql, file).not.toMatch(/editorial_/);
  for (const { file, sql } of migrations(sequences.editorial)) expect(sql, file).not.toMatch(/classifieds_/);
});

/** Bindings are read only where a context is composed; any other module receives its database. */
const compositionRoots = {
  AUTHENTICATION_DB: ["lib/serveApiRequest.ts", "production.ts"],
  CLASSIFIEDS_DB: ["production.ts"],
  EDITORIAL_DB: ["production.ts"],
};

function sources(directory = ""): string[] {
  return readdirSync(join(worker, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return ["node_modules", "tests", "dist"].includes(entry.name) ? [] : sources(path);
    return /\.(ts|mjs)$/.test(entry.name) && !entry.name.endsWith(".test.ts") && entry.name !== "env.d.ts" ? [path] : [];
  });
}

test("database bindings are read only by their composition roots", () => {
  const readers = Object.fromEntries(Object.keys(compositionRoots).map(binding => [binding,
    sources().filter(path => new RegExp(`\\benv\\.${binding}\\b|\\b${binding}:\\s*D1Database`).test(readFileSync(join(worker, path), "utf8"))).sort()]));
  expect(readers).toEqual(compositionRoots);
});
