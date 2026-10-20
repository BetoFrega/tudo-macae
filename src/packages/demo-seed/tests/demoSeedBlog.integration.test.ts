// @vitest-environment node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createEditorialBlogClient } from "@tudomacae/editorial-blog/client";
import type { BlogPost } from "@tudomacae/editorial-blog/blog";
import { seedDemoData, type DemoSeedSummary } from "../index";
import { DEMO_PASSWORD } from "./demoSeedFixture";

const DAY = 24 * 60 * 60 * 1000;
/** The README's newsroom mass, spelled out so a change to the data file has to change this promise too. */
const articles = [
  { title: "Obras de duplicação na Rodovia Amaral Peixoto exigem mudanças no acesso aos bairros de Macaé", status: "published", createdDaysAgo: 5, publishedDaysAgo: 4.5 },
  { title: "Câmara aprova iluminação de LED para o Centro", status: "published", createdDaysAgo: 3, publishedDaysAgo: 2.5 },
  { title: "Defesa Civil alerta para chuva forte na orla", status: "published", createdDaysAgo: 2, publishedDaysAgo: 1.5 },
  { title: "Temporal causa alagamentos em Cavaleiros", status: "draft", createdDaysAgo: 0.5 },
] as const;
const publicOrigin = "https://www.tudomacae.com.br";
let fixture: Awaited<ReturnType<typeof import("../../../../apps/api-worker/testing.mjs")["startAuthenticationFixture"]>>;
let directory: string;
let bootTime: number;
let runs: DemoSeedSummary[];

let editorSession: string | undefined;

/** Signs in once: the fixture rate-limits sign-ins, and the seed runs spend some of that budget. */
async function editorPosts(): Promise<BlogPost[]> {
  const origin = fixture.env.AUTHENTICATION_API_URL;
  if (!editorSession) {
    const signIn = await fetch(new URL("/api/auth/sign-in/email", origin), {
      method: "POST",
      headers: { "content-type": "application/json", "origin": publicOrigin },
      body: JSON.stringify({ email: "editor@demo.local", password: DEMO_PASSWORD }),
    });
    const session = /session=([^;]+)/u.exec(signIn.headers.get("set-cookie") ?? "")?.[1];
    if (!session) throw new Error(`Editor sign-in failed (${signIn.status})`);
    editorSession = decodeURIComponent(session);
  }
  const blog = createEditorialBlogClient({ origin, publicOrigin, allowLocal: true });
  const page = await blog.list(undefined, editorSession);
  return Promise.all(page.items.map(async item => (await blog.read(item.id, editorSession!))!));
}

/** Its own fixture, so the posts it counts are only the ones these seed runs wrote. */
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "demo-seed-blog-"));
  const configurationFile = join(directory, "fixture.json");
  const { startAuthenticationFixture } = await import("../../../../apps/api-worker/testing.mjs");
  fixture = await startAuthenticationFixture({ publicOrigin, configurationFile, classifiedsQualification: true,
    offeringFlagHost: undefined, mediaUploadOrigin: undefined });
  vi.stubEnv("AUTHENTICATION_FIXTURE_CONFIGURATION", configurationFile);
  vi.stubEnv("AUTHENTICATION_API_URL", fixture.env.AUTHENTICATION_API_URL);
  vi.stubEnv("PUBLIC_APP_ORIGIN", publicOrigin);
  vi.stubEnv("NEXT_RUNTIME", "nodejs");
  vi.stubEnv("NODE_ENV", "development");
  const first = await seedDemoData();
  // A run that stopped after saving a post leaves it dated at save time; the next run has to date it.
  const interrupted = (await editorPosts()).find(post => post.status === "published")!;
  const { controllerOrigin } = JSON.parse(await readFile(configurationFile, "utf8")) as { controllerOrigin: string };
  const now = Date.now();
  const backdate = await fetch(new URL("/backdate-post", controllerOrigin), {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: interrupted.id, createdAt: now, publishedAt: now }),
  });
  if (!backdate.ok) throw new Error(`Fixture refused /backdate-post (${backdate.status})`);
  bootTime = Date.now();
  runs = [first, await seedDemoData()];
}, 240_000);

afterAll(async () => {
  vi.unstubAllEnvs();
  await fixture?.close();
  await rm(directory, { recursive: true, force: true });
});

describe("seedDemoData Matérias", () => {
  it("writes each Matéria once as a Blog post", async () => {
    const posts = await editorPosts();
    expect(posts.map(post => post.content.title).sort()).toEqual(articles.map(article => article.title).sort());
    for (const run of runs) expect(run).toMatchObject({ seeded: true, articles: articles.length });
  });

  it("dates each post by its offset from boot and publishes only the published ones", async () => {
    const posts = new Map((await editorPosts()).map(post => [post.content.title, post]));
    for (const article of articles) {
      const post = posts.get(article.title)!;
      expect(post.status).toBe(article.status);
      expect(post.createdAt).toBeCloseTo(bootTime - article.createdDaysAgo * DAY, -4);
      if (article.status === "published") expect(post.publishedAt).toBeCloseTo(bootTime - article.publishedDaysAgo * DAY, -4);
      else expect(post.publishedAt).toBeUndefined();
    }
  });
});
