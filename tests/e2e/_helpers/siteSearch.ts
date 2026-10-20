import { readFile } from "node:fs/promises";
import type { BrowserContext, Page } from "@playwright/test";
import { expect } from "./fixtures";
import { pageObject } from "./fixtures/POMs/pageObject";
import { playwrightTarget } from "../../../bin/playwrightTarget";
import {
  SITE_SEARCH_FAKE_ADDRESS_PATH,
  SITE_SEARCH_FAKE_TOKEN,
  type SiteSearchFakeReply,
} from "../bin/siteSearchFake";

export async function fakeUrl() {
  return (JSON.parse(await readFile(SITE_SEARCH_FAKE_ADDRESS_PATH, "utf8")) as { url: string }).url;
}

export async function scriptReply(query: string, reply: SiteSearchFakeReply) {
  const response = await fetch(`${await fakeUrl()}/__replies`, {
    method: "PUT",
    body: JSON.stringify({ query, reply }),
  });
  expect(response.status).toBe(204);
}

export async function releaseReply(query: string) {
  const response = await fetch(`${await fakeUrl()}/__replies/release`, {
    method: "POST", body: JSON.stringify({ query }),
  });
  expect(response.status).toBe(204);
}

export async function enableSearchAudience(uid: string) {
  const response = await fetch(`${await fakeUrl()}/__search-audience`, {
    method: "PUT", body: JSON.stringify({ uid }),
  });
  expect(response.status).toBe(204);
}

/** A stale synthetic identity only exercises the server's disabled/failure states. */
export async function actAs(context: BrowserContext, distinctId: string) {
  await context.addCookies([{
    name: `ph_${SITE_SEARCH_FAKE_TOKEN}_posthog`,
    value: encodeURIComponent(JSON.stringify({ distinct_id: distinctId, $user_state: "identified" })),
    domain: new URL(playwrightTarget().origin).hostname,
    path: "/",
    sameSite: "Lax",
  }]);
}

export function headerSearch(page: Page) {
  return pageObject(page).getByRole("banner").getByRole("search", { name: "Buscar no Tudo Macaé" });
}
export async function clearScriptedReplies() {
  await fetch(`${await fakeUrl()}/__replies`, { method: "DELETE" });
}
