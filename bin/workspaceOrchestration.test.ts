import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";

// These tests run real processes, which the Workers runtime (quality-flare's Tests check) lacks.
const inWorkers = globalThis.navigator?.userAgent === "Cloudflare-Workers";
beforeEach((context) => {
  if (inWorkers) context.skip();
});

const repository = process.cwd();
const directory = mkdtempSync(path.join(tmpdir(), "workspace-orchestration-"));
const turbo = path.join(repository, "node_modules/.bin/turbo");
let base: string;
const rootRuntimeInputs = ["instrumentation-client.ts", "image-loader.js", "tests/_helpers/makePng.ts"];
const e2eCommands = ["test", "test:e2e", "test:e2e:diagnostic", "test:e2e:full", "test:e2e:full:diagnostic", "test:harness", "typecheck"];
function git(...args: string[]) {
  return execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "user.name=Workspace Test", "-c", "user.email=workspace@example.test", ...args], { cwd: directory, encoding: "utf8", stdio: "pipe" }).trim();
}
function write(file: string, content: string) {
  mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
  writeFileSync(path.join(directory, file), content);
}
interface Task { taskId: string; hash: string; dependencies: string[]; resolvedTaskDefinition: { cache: boolean } }
function graph(extra: string[] = [], release = "a".repeat(40), cloudflareEnvironment = "", commands = ["build", "typecheck", "test"]): { tasks: Task[]; packages: string[] } {
  return JSON.parse(execFileSync(turbo, ["run", ...commands, "--dry=json", ...extra], {
    cwd: directory,
    env: { NODE_ENV: "test", PATH: process.env.PATH, TURBO_TELEMETRY_DISABLED: "1", TURBO_SCM_BASE: base, TURBO_SCM_HEAD: "HEAD", RELEASE_SHA: release, CLOUDFLARE_ENV: cloudflareEnvironment },
    encoding: "utf8", stdio: "pipe",
  }));
}
beforeAll(() => {
  if (inWorkers) return;
  for (const file of ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "turbo.json", "tsconfig.json",
    "tests/e2e/package.json", "tests/e2e/turbo.json", "packages/editorial-planning/package.json", "packages/editorial-sourcing/package.json", "packages/editorial-access/package.json", "packages/categories/package.json",
    ...["media", "media-files", "civil-time", "advertiser-identity"].map(name => `packages/${name}/package.json`),
    "packages/ads/package.json", "packages/text-normalization/package.json",
    "apps/public-article-index/package.json", "apps/public-article-index/turbo.json", "packages/article-index-test-runtime/package.json",
    "apps/site-search/package.json", "packages/site-search/package.json", "packages/authentication/package.json", "apps/public-images/package.json", "apps/public-images/turbo.json", "packages/public-image-delivery/package.json",
    "apps/www-origin/package.json", "apps/web-workers/package.json",
    "packages/www-origin-routing/package.json", "packages/terms-page/package.json",
    ...["design-foundations", "react-primitives", "site-layout"].map(name => `packages/${name}/package.json`)]) {
    mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
    copyFileSync(path.join(repository, file), path.join(directory, file));
  }
  for (const file of ["apps/public-article-index/index.ts", "apps/public-article-index/migrations/0001_public_article_summaries.sql",
    "packages/editorial-planning/stories.ts", "packages/editorial-planning/ui.ts", "packages/editorial-sourcing/sourcePolicy.ts", "packages/editorial-sourcing/ui.ts", "packages/editorial-access/credentialPolicy.ts", "packages/editorial-access/ui.ts", "packages/categories/categoryCatalog.ts", "packages/categories/ui.ts", "packages/ads/adUpdate.ts", "packages/text-normalization/slugify.ts", "src/integrations/ads/publication.ts", "packages/advertiser-identity/deletionCleanup.ts", "packages/advertiser-identity/ui.ts", "src/integrations/advertiser-identity/upload.ts",
    "packages/article-index-test-runtime/index.ts", "apps/site-search/index.ts", "packages/site-search/search.ts", "packages/site-search/ui.ts", "packages/authentication/session.ts", "packages/authentication/ui.ts", "packages/media/model.ts", "packages/media/ui.ts", "packages/media-files/fileInspectionProduction.ts", "packages/civil-time/index.ts", "apps/public-images/index.ts", "packages/public-image-delivery/worker.ts", "public/favicon-32x32.png", "apps/www-origin/index.ts", "apps/web-workers/app/layout.tsx", "packages/www-origin-routing/contract.ts",
    "packages/terms-page/terms-and-conditions.md", "src/components/ui/sheet.tsx", "src/lib/normalizedWords.ts",
    "packages/design-foundations/styles.css", "packages/react-primitives/button.ts", "packages/site-layout/navigation.ts", "src/app/termos-e-condicoes/page.tsx", "vitest.unit.config.mts"]) write(file, "// initial\n");
  for (const file of rootRuntimeInputs) write(file, file.endsWith(".json") ? "{}\n" : "// initial\n");
  write("apps/public-article-index/wrangler.jsonc", "{}\n");
  write(".gitignore", ".turbo/\n");
  git("init", "-q");
  git("add", ".");
  git("commit", "-qm", "Initial fixture");
  base = git("rev-parse", "HEAD");
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));

const allWorkspaces = ["@tudomacae/editorial-planning", "@tudomacae/editorial-sourcing", "@tudomacae/editorial-access", "@tudomacae/categories", "@tudomacae/authentication", "@tudomacae/ads", "@tudomacae/text-normalization",
  ...["media", "media-files", "civil-time", "advertiser-identity"].map(name => `@tudomacae/${name}`), "site-search-worker", "@tudomacae/site-search", "public-article-index-worker", "@tudomacae/article-index-test-runtime", "//", "@tudomacae/terms-page", "@tudomacae/www-origin-routing", "web-workers-app", "www-origin-worker",
  "public-images-worker", "@tudomacae/public-image-delivery",
  "@tudomacae/design-foundations", "@tudomacae/react-primitives", "@tudomacae/site-layout"];

let defaultGraph: { tasks: Task[]; packages: string[] };
beforeAll(() => {
  if (!inWorkers) defaultGraph = graph();
});

// One representative per input class: app-local, shared package, root-only, cross-workspace asset, D1 migration, root config.
for (const [file, expected] of [
  ["apps/web-workers/app/layout.tsx", ["web-workers-app"]],
  ["packages/www-origin-routing/contract.ts", allWorkspaces],
  ["src/integrations/ads/publication.ts", ["//"]],
  ["public/favicon-32x32.png", ["//", "public-images-worker"]],
  ["apps/public-article-index/migrations/0001_public_article_summaries.sql", ["public-article-index-worker"]],
  ["vitest.unit.config.mts", allWorkspaces],
] as const) {
  test(`selects consumers after changing ${file}`, () => {
    git("reset", "--hard", base);
    const original = readFileSync(path.join(directory, file), "utf8");
    write(file, `${original}// changed\n`);
    git("add", file);
    git("commit", "-qm", "Change fixture");
    // Dependencies may have transit tasks, but only changed consumers execute commands.
    const packages = graph(["--affected"]).packages.sort();
    expect(packages).toEqual([...expected, "@tudomacae/e2e"].sort());
  });
}

test("changes web asset build identity with the release and never caches root side effects", () => {
  git("reset", "--hard", base);
  const first = defaultGraph;
  const second = graph([], "b".repeat(40));
  const build = (tasks: Task[]) => tasks.find(task => task.taskId === "web-workers-app#build")!;
  expect(build(first.tasks).hash).not.toBe(build(second.tasks).hash);
  expect(build(first.tasks).hash).not.toBe(build(graph([], "a".repeat(40), "production").tasks).hash);
  expect(build(first.tasks).dependencies).toContain("@tudomacae/www-origin-routing#build");
  expect(first.tasks.find(task => task.taskId === "//#build")!.resolvedTaskDefinition.cache).toBe(false);
});

for (const file of ["image-loader.js", "package.json", "pnpm-lock.yaml"]) {
  test(`selects every E2E task after changing ${file}`, () => {
    git("reset", "--hard", base);
    const original = readFileSync(path.join(directory, file), "utf8");
    if (file === "package.json") {
      const manifest = JSON.parse(original);
      manifest.dependencies.next = "999.0.0";
      write(file, `${JSON.stringify(manifest, null, 2)}\n`);
    }
    else write(file, `${original}\n`);
    git("add", file);
    git("commit", "-qm", "Change root runtime input");
    const tasks = graph(["--affected", "--filter=@tudomacae/e2e"], "a".repeat(40), "", e2eCommands).tasks;
    expect(tasks.map(task => task.taskId).sort()).toEqual(e2eCommands.map(command => `@tudomacae/e2e#${command}`).sort());
  });
}

test("E2E tasks execute without cached results or a second application build", () => {
  const commands = e2eCommands;
  const result = graph(["--filter=@tudomacae/e2e"], "a".repeat(40), "", commands);
  const tasks = result.tasks;
  expect(tasks).toHaveLength(commands.length);
  for (const task of tasks) {
    expect(task.resolvedTaskDefinition.cache).toBe(false);
    expect(task.dependencies).toEqual([]);
  }
});

test("image delivery deploy cannot be suppressed by cache", () => {
  const result = JSON.parse(execFileSync(turbo, ["run", "deploy", "--filter=public-images-worker", "--dry=json"], {
    cwd: directory, env: { NODE_ENV: "test", PATH: process.env.PATH, TURBO_TELEMETRY_DISABLED: "1" }, encoding: "utf8", stdio: "pipe",
  }));
  expect(result.tasks).toHaveLength(1);
  expect(result.tasks[0].resolvedTaskDefinition.cache).toBe(false);
});

test("both web apps have task edges to each shared UI workspace", () => {
  const tasks = defaultGraph.tasks;
  for (const consumer of ["//", "web-workers-app"]) {
    for (const task of ["build", "typecheck", "test"]) {
      const dependencies = tasks.find(item => item.taskId === `${consumer}#${task}`)!.dependencies;
      for (const workspace of ["design-foundations", "react-primitives", "site-layout"]) {
        expect(dependencies).toContain(`@tudomacae/${workspace}#${task}`);
      }
    }
  }
});

test("index effects are uncached and its checks follow the test runtime dependency", () => {
  const tasks = defaultGraph.tasks;
  expect(tasks.find(task => task.taskId === "public-article-index-worker#test")!.resolvedTaskDefinition.cache).toBe(false);
  expect(tasks.find(task => task.taskId === "public-article-index-worker#typecheck")!.dependencies).toContain("@tudomacae/article-index-test-runtime#typecheck");
  const effects = JSON.parse(execFileSync(turbo, ["run", "deploy", "migrate", "--filter=public-article-index-worker", "--dry=json"], {
    cwd: directory, encoding: "utf8", stdio: "pipe",
  }));
  expect(effects.tasks.map((task: Task) => task.resolvedTaskDefinition.cache)).toEqual([false, false]);
});
