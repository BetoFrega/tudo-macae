import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import ts from "typescript";
import vinext from "vinext";
import { defineConfig } from "vite";

// The browser bundle inlines NEXT_PUBLIC_* at build time; Wrangler vars reach only the
// server. The production build takes them from its vars, their single source. Other
// builds supply none, so their browser keeps analytics off.
if (process.env.CLOUDFLARE_ENV === "production") {
  const wrangler = ts.parseConfigFileTextToJson("wrangler.web.jsonc", readFileSync(new URL("./wrangler.web.jsonc", import.meta.url), "utf8"));
  const vars: Record<string, string> = wrangler.config?.env?.production?.vars ?? {};
  for (const [name, value] of Object.entries(vars)) {
    if (name.startsWith("NEXT_PUBLIC_")) process.env[name] ??= value;
  }
}

// Builds the Next app in `src/app` as the web Worker (ADR 0046).
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: [
      { find: /^next\/image$/u, replacement: fileURLToPath(new URL("./web-worker/image.tsx", import.meta.url)) },
      { find: /^@\/packages\/editorial\/articleSitemapProduction$/u, replacement: fileURLToPath(new URL("./web-worker/articleSitemapProduction.ts", import.meta.url)) },
    ],
  },
  // Evaluate modules in import order across chunks: `web-worker/outboundBindings.ts` must
  // patch fetch before vinext's fetch cache captures it, or calls bypass the service bindings.
  environments: { rsc: { build: { rolldownOptions: { output: { strictExecutionOrder: true } } } } },
  plugins: [
    // "use cache" lives in one Durable Object shared by every isolate (`web-worker/dataCache.ts`).
    vinext({ cache: { data: { adapter: fileURLToPath(new URL("./web-worker/dataCache.ts", import.meta.url)) } } }),
    cloudflare({
      configPath: "./wrangler.web.jsonc",
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
      // Locally the index answers the `ARTICLE_INDEX` binding (`e2e-stack.mjs` migrates its D1);
      // a deployment build (`CLOUDFLARE_ENV`) binds the deployed index instead.
      ...(process.env.CLOUDFLARE_ENV ? {} : { auxiliaryWorkers: [{ configPath: "./apps/public-article-index/wrangler.jsonc" }] }),
    }),
  ],
});
