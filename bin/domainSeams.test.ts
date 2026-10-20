import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import {
  assertProtectionPreserved,
  assertReplacedSourcesRetired,
  assertRetiredSourcesRemoved,
  describeProbeFailure,
  inspectDomainImports,
  probeDomainEntry,
  protectDomainSeam,
  protectDomainSeams,
} from "./domain-seams.mjs";

// These tests run real processes or resolve symlinks, which the Workers runtime
// (quality-flare's Tests check) lacks.
const inWorkers = globalThis.navigator?.userAgent === "Cloudflare-Workers";

const dirs: string[] = [];
function fixture(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "domain-seams-"));
  dirs.push(root);
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(join(root, name, ".."), { recursive: true });
    writeFileSync(join(root, name), content);
  }
  return root;
}
afterEach(() => dirs.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));

test("rejects direct and transitive infrastructure dependencies while accepting pure code", () => {
  const root = fixture({ "entry.ts": "export { value } from \"./policy\";", "policy.ts": "import { readFile } from \"node:fs\"; export const value = readFile;" });
  expect(inspectDomainImports(join(root, "entry.ts"), root)).toEqual(expect.arrayContaining([expect.stringContaining("node:fs")]));
  writeFileSync(join(root, "entry.ts"), "import \"pg\";");
  expect(inspectDomainImports(join(root, "entry.ts"), root)).toEqual(expect.arrayContaining([expect.stringContaining("pg")]));
  writeFileSync(join(root, "entry.ts"), "export const calculate = (n: number) => n + 1;");
  expect(inspectDomainImports(join(root, "entry.ts"), root)).toEqual([]);
});

test("requires resolvable dynamic imports and follows type-only imports", () => {
  const root = fixture({ "entry.ts": "export type { X } from \"pg\";" });
  expect(inspectDomainImports(join(root, "entry.ts"), root)).not.toEqual([]);
  writeFileSync(join(root, "entry.ts"), "const name = \"node:fs\"; void import(name);");
  expect(inspectDomainImports(join(root, "entry.ts"), root)).toEqual([expect.stringContaining("Unresolved dynamic")]);
});

test("allows expansion but rejects disappearing capabilities and operations", () => {
  const entry = { id: "drafts", entry: "drafts.ts", operations: ["save", "read"], probe: "probe.ts" };
  expect(() => assertProtectionPreserved([entry], [{ ...entry, operations: [...entry.operations, "list"] }])).not.toThrow();
  expect(() => assertProtectionPreserved([entry], [])).toThrow();
  expect(() => assertProtectionPreserved([entry], [{ ...entry, operations: ["save"] }])).toThrow("Protection reduction");
  expect(() => assertProtectionPreserved([entry], [{ ...entry, entry: "empty.ts" }])).toThrow("Protection reduction");
});

test("accepts one explicit replacement while rejecting ambiguous or unknown replacements", () => {
  const entry = { id: "writers", entry: "writers.ts", operations: ["write"], probe: "writers.probe.ts" };
  const replacement = {
    id: "history",
    entry: "history.ts",
    operations: ["read"],
    probe: "history.probe.ts",
    replaces: [entry.id],
  };
  expect(() => assertProtectionPreserved([entry], [replacement])).not.toThrow();
  expect(() => assertProtectionPreserved([replacement], [replacement]))
    .not.toThrow();
  expect(() => assertProtectionPreserved([entry], [entry, replacement]))
    .toThrow("cannot coexist");
  expect(() => assertProtectionPreserved([entry], [
    replacement,
    { ...replacement, id: "other-history" },
  ])).toThrow("only one replacement");
  expect(() => assertProtectionPreserved([entry], [
    { ...replacement, replaces: ["unknown"] },
  ])).toThrow("must name");
});

test("removes a seam only when it is retired explicitly with a reason", () => {
  const entry = { id: "writers", entry: "writers.ts", operations: ["write"], probe: "writers.probe.ts" };
  const kept = { id: "drafts", entry: "drafts.ts", operations: ["save"], probe: "drafts.probe.ts" };
  const retired = [{ id: "writers", reason: "No consumer remains." }];
  expect(() => assertProtectionPreserved([entry, kept], [kept])).toThrow("Protection reduction");
  expect(() => assertProtectionPreserved([entry, kept], [kept], retired)).not.toThrow();
  expect(() => assertProtectionPreserved([entry, kept], [entry, kept], retired)).toThrow("cannot stay protected");
  expect(() => assertProtectionPreserved([entry, kept], [kept], [{ id: "writers", reason: " " }])).toThrow("requires an id and a reason");
  expect(() => assertProtectionPreserved([entry, kept], [kept], [...retired, ...retired])).toThrow("only once");
});

test("rejects a retired seam while its factory or probe remains", () => {
  const root = fixture({
    "writers.ts": "export type Writer = string;\nexport function createWriters() {}",
    "writers.probe.ts": "export async function run() {}",
  });
  const previous = [{ id: "writers", entry: "writers.ts", factory: "createWriters", operations: ["write"], probe: "writers.probe.ts" }];
  const retired = [{ id: "writers", reason: "No consumer remains." }];
  expect(() => assertRetiredSourcesRemoved(previous, retired, root)).toThrow("must leave the tree");
  writeFileSync(join(root, "writers.ts"), "export type Writer = string;");
  expect(() => assertRetiredSourcesRemoved(previous, retired, root)).toThrow("must leave the tree");
  rmSync(join(root, "writers.probe.ts"));
  expect(() => assertRetiredSourcesRemoved(previous, retired, root)).not.toThrow();
});

test("rejects a replacement while the old protected source remains active", () => {
  const root = fixture({ "writers.ts": "export function createWriters() {}" });
  const previous = [{
    id: "writers",
    entry: "writers.ts",
    operations: ["write"],
    probe: "writers.probe.ts",
  }];
  const current = [{
    id: "history",
    entry: "history.ts",
    operations: ["read"],
    probe: "history.probe.ts",
    replaces: ["writers"],
  }];

  expect(() => assertReplacedSourcesRetired(previous, current, root))
    .toThrow("must be retired");
  rmSync(join(root, "writers.ts"));
  expect(() => assertReplacedSourcesRetired(previous, current, root))
    .not.toThrow();
});

test.skipIf(inWorkers)("isolated import detects incidental global network effects", () => {
  const root = fixture({ "entry.mjs": "await globalThis.fetch(\"https://example.invalid\");", "probe.mjs": "export async function run() {}" });
  expect(() => probeDomainEntry(join(root, "entry.mjs"), join(root, "probe.mjs"))).toThrow();
  writeFileSync(join(root, "entry.mjs"), "export const value = 42;");
  writeFileSync(join(root, "probe.mjs"), "export async function run(module) { if (module.value !== 42) throw new Error(\"Wrong result\"); }");
  expect(() => probeDomainEntry(join(root, "entry.mjs"), join(root, "probe.mjs"))).not.toThrow();
});

test("construction and execution effects fail the isolated probe", () => {
  const root = fixture({ "entry.mjs": "export function create() { return globalThis.fetch(\"https://example.invalid\"); }", "probe.mjs": "export async function run(module) { await module.create(); }" });
  expect(() => probeDomainEntry(join(root, "entry.mjs"), join(root, "probe.mjs"))).toThrow();
});

test("a registered operation must actually execute in the isolated probe", () => {
  const root = fixture({
    "entry.mjs": "export function create() { return { save: async () => 1, read: async () => 2 }; }",
    "probe.mjs": "export async function run(entry) { await entry.create().save(); }",
  });
  expect(() => probeDomainEntry(join(root, "entry.mjs"), join(root, "probe.mjs"), { factory: "create", operations: ["save", "read"] })).toThrow();
});

test.skipIf(inWorkers)("a failing probe names its seam and keeps the probe failure as the cause", () => {
  const root = fixture({
    "tsconfig.json": "{}",
    "entry.mjs": "export function create() { return { save: async () => 1 }; }",
    "probe.mjs": "export async function run() {}",
  });
  const item = { id: "drafts", entry: "entry.mjs", probe: "probe.mjs", factory: "create", operations: ["save"] };
  let failure: unknown;
  try {
    protectDomainSeam(item, root);
  }
  catch (error) {
    failure = error;
  }
  expect(failure).toMatchObject({ message: "Domain seam probe failed: drafts", cause: expect.any(Error) });
  const cause = (failure as Error).cause as Error & Record<string, unknown>;
  expect(cause.message).toMatch(/^Probe exited with status 1\n/);
  expect(cause.message.match(/Protected operation was not exercised: save/g)).toHaveLength(1);
  expect(cause).not.toHaveProperty("stdout");
  expect(cause).not.toHaveProperty("output");
  writeFileSync(join(root, "probe.mjs"), "export async function run(entry) { await entry.create().save(); }");
  expect(() => protectDomainSeam(item, root)).not.toThrow();
});

test("probe failure description distinguishes timeout, signal and missing runner, and bounds stderr", () => {
  expect(describeProbeFailure({ code: "ETIMEDOUT", signal: "SIGTERM", status: null, stderr: "" })).toBe("Probe timed out after 15000ms");
  expect(describeProbeFailure({ signal: "SIGKILL", status: null, stderr: "late\n" })).toBe("Probe killed by SIGKILL\nlate");
  expect(describeProbeFailure({ code: "ENOENT", message: "spawnSync node ENOENT" })).toBe("Probe could not run: spawnSync node ENOENT");
  expect(describeProbeFailure({ code: "ENOBUFS", signal: "SIGTERM", status: null, stderr: "" })).toBe("Probe exceeded the output buffer (stdout or stderr too large)");
  const description = describeProbeFailure({ status: 1, stderr: `Error: real cause\n${"x".repeat(5000)}END` });
  expect(description).toMatch(/^Probe exited with status 1\nError: real cause\nx+\n\.\.\.\nx+END$/);
  expect(description.length).toBeLessThan(2100);
});

test.skipIf(inWorkers)("follows declared workspace exports and still rejects transitive infrastructure", () => {
  const root = fixture({
    "package.json": JSON.stringify({ name: "consumer", workspaces: ["packages/*"], dependencies: { "@tudomacae/policy": "*" } }),
    "tsconfig.json": JSON.stringify({ compilerOptions: { moduleResolution: "bundler", module: "esnext" } }),
    "entry.ts": "export { value } from \"@tudomacae/policy/policy\";",
    "packages/policy/package.json": JSON.stringify({ name: "@tudomacae/policy", exports: { "./policy": "./policy.ts" } }),
    "packages/policy/policy.ts": "export const value = 1;",
  });
  mkdirSync(join(root, "node_modules/@tudomacae"), { recursive: true });
  symlinkSync(join(root, "packages/policy"), join(root, "node_modules/@tudomacae/policy"));
  expect(inspectDomainImports(join(root, "entry.ts"), root)).toEqual([]);
  writeFileSync(join(root, "packages/policy/policy.ts"), "import \"pg\";");
  expect(inspectDomainImports(join(root, "entry.ts"), root)).toEqual(expect.arrayContaining([expect.stringContaining("pg")]));
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "consumer" }));
  expect(inspectDomainImports(join(root, "entry.ts"), root)).toEqual(expect.arrayContaining([expect.stringContaining("Undeclared")]));
});

test.skipIf(inWorkers)("probing seams side by side reports the first failing seam in registry order", async () => {
  const root = fixture({
    "tsconfig.json": "{}",
    "entry.mjs": "export function create() { return { save: async () => 1 }; }",
    "good.mjs": "export async function run(entry) { await entry.create().save(); }",
    "bad.mjs": "export async function run() {}",
  });
  const seam = (id: string, probe: string) => ({ id, entry: "entry.mjs", probe, factory: "create", operations: ["save"] });
  await expect(protectDomainSeams([seam("first", "good.mjs"), seam("second", "bad.mjs"), seam("third", "bad.mjs")], root)).rejects.toMatchObject({
    message: "Domain seam probe failed: second",
    cause: expect.objectContaining({ message: expect.stringMatching(/^Probe exited with status 1\n[\s\S]*Protected operation was not exercised: save/) }),
  });
  await expect(protectDomainSeams([seam("first", "good.mjs"), seam("again", "good.mjs")], root)).resolves.toBeUndefined();
  await expect(protectDomainSeams([seam("probe", "bad.mjs"), { id: "unbuilt", entry: "entry.mjs", probe: "good.mjs", operations: ["save"] }], root)).rejects.toThrow("Domain seam probe failed: probe");
});
