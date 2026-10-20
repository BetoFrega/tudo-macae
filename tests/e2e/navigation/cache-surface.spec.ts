import { readFile } from "node:fs/promises";
import { e2eRenderer } from "../../../bin/e2eStack";
import { expect, test } from "../_helpers/fixtures";
import { pageObject } from "../_helpers/fixtures/POMs/pageObject";
import { SITE_SEARCH_FAKE_TOKEN } from "../bin/siteSearchFake";

const BUILD_DEPLOYMENT_ID = /^source-[a-f0-9]{32}$/u;

/**
 * The one revision a document names. Next marks `<html data-dpl-id>` and both
 * renderers version static URLs with `?dpl=`; two different values in one
 * document mean the shell and its assets come from different builds.
 */
function deploymentIdFrom(html: string) {
  const ids = new Set([
    ...html.matchAll(/<html[^>]+data-dpl-id="([A-Za-z0-9._-]+)"/gu),
    ...html.matchAll(/\bdpl=([A-Za-z0-9._-]+)/gu),
  ].map(match => match[1]));
  expect([...ids]).toHaveLength(1);
  return [...ids][0];
}

/** Server Action requests: Next sends `next-action`; vinext sends `x-rsc-action`. */
function isServerAction(headers: Record<string, string>) {
  return typeof (headers["next-action"] ?? headers["x-rsc-action"]) === "string";
}

const root = new URL("../../../", import.meta.url);

/** The revisions the build compiled in, read from each renderer's own output. */
async function builtDeploymentIds() {
  if (e2eRenderer() === "vinext") {
    // vinext inlines `deploymentId` from `next.config.ts` into the Worker bundle.
    const worker = await readFile(new URL("dist/server/index.js", root), "utf8");
    return [...new Set(worker.match(/source-[a-f0-9]{32}/gu))];
  }
  const [routesManifest, serverManifest] = await Promise.all([
    readFile(new URL(".next/routes-manifest.json", root), "utf8"),
    readFile(new URL(".next/required-server-files.json", root), "utf8"),
  ]).then(files => files.map(file => JSON.parse(file)));

  expect(serverManifest.config.deploymentId).toBe(routesManifest.deploymentId);
  expect(serverManifest.config.experimental.runtimeServerDeploymentId).not.toBe(true);
  return [routesManifest.deploymentId];
}

test("Contrato HTTP: invalidação privada, HTML público e revisão PPR", async ({ request }) => {
  await test.step("Invalidação global indisponível", async () => {
    expect((await request.get("/nuke-cache")).status()).toBe(404);
  });
  await test.step("HTML da home respeita a decisão por visitante", async () => {
    const response = await request.get("/");
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("private");
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(response.headers()["cdn-cache-control"]).toBe("no-store");
  });
  await test.step("Recursos públicos preservam cache mesmo com identidade de apresentação", async () => {
    for (const path of ["/api/navegacao-publica", "/sitemap.xml", "/robots.txt", "/site.webmanifest"]) {
      const baseline = await request.get(path);
      const identified = await request.get(path, { headers: { cookie: `session=synthetic-invalid; ph_${SITE_SEARCH_FAKE_TOKEN}_posthog=synthetic-identity` } });
      expect(baseline.status()).toBe(200);
      expect(identified.status()).toBe(200);
      expect(identified.headers()["cache-control"]).toBe(baseline.headers()["cache-control"]);
      expect(identified.headers()["cdn-cache-control"]).toBe(baseline.headers()["cdn-cache-control"]);
      expect(identified.headers()["cache-control"]).not.toContain("private");
      expect(identified.headers()["cache-control"]).not.toContain("no-store");
    }
    const session = await request.get("/api/autenticacao/sessao");
    expect(session.status()).toBe(200);
    expect(session.headers()["cache-control"]).toBe("private, no-store");
  });
  await test.step("Shell PPR e servidor usam a mesma revisão", async () => {
    const [dynamicResponse, pprResponse] = await Promise.all([
      request.get("/"),
      request.get("/publicar"),
    ]);

    const dynamicDeploymentId = deploymentIdFrom(await dynamicResponse.text());
    const pprDeploymentId = deploymentIdFrom(await pprResponse.text());

    expect(dynamicDeploymentId).toBeTruthy();
    expect(pprDeploymentId).toBe(dynamicDeploymentId);
  });
});

test("A revisão servida identifica navegação e Server Actions por deployment", async ({ page, loginPage, userCredentials, userSidebar }) => {
  const response = await page.goto("/");

  if (!response) {
    throw new Error("Navigation did not produce an HTTP response.");
  }

  const html = await response.text();
  const deploymentId = deploymentIdFrom(html);

  expect(deploymentId).toBeTruthy();
  expect(html).toContain(`?dpl=${deploymentId}`);

  await loginPage.login(userCredentials.email, userCredentials.password);
  await expect(pageObject(page).getByRole("button", { name: "Minha conta", exact: true }).filter({ visible: true })).toBeVisible();
  await userSidebar.open();
  const actionRequest = page.waitForRequest(request => isServerAction(request.headers()));
  await userSidebar.logout();
  expect((await actionRequest).headers()["x-deployment-id"]).toBe(deploymentId);
});

test("O servidor preserva a revisão embutida no build", async ({ request }) => {
  const builtIds = await builtDeploymentIds();
  const response = await request.get("/");
  expect(response.status()).toBe(200);

  expect(builtIds).toHaveLength(1);
  expect(builtIds[0]).toMatch(BUILD_DEPLOYMENT_ID);
  expect(deploymentIdFrom(await response.text())).toBe(builtIds[0]);
});
