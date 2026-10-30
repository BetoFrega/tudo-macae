import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { createArticleIndexTestRuntime as createRuntime, createArticleIndexTestIdentity } from "@tudomacae/article-index-test-runtime";

export { createArticleIndexTestIdentity, TEST_ARTICLE_INDEX_ORIGIN } from "@tudomacae/article-index-test-runtime";

export function createArticleIndexTestRuntime(
  identity?: Awaited<ReturnType<typeof createArticleIndexTestIdentity>>,
  withoutMigrations = false,
) {
  return createRuntime({
    ...(identity ? { identity } : {}),
    withoutMigrations,
    build(directory) {
      execFileSync("pnpm", ["--filter", "public-article-index-worker", "run", "build", "--outdir", directory], {
        stdio: "pipe", env: { ...process.env, WRANGLER_LOG_PATH: join(directory, "wrangler.log") },
      });
    },
  });
}
