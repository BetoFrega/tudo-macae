import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { expect } from "./fixtures";
import { pageObject } from "./fixtures/POMs/pageObject";
import { SITE_SEARCH_FAKE_ADDRESS_PATH, type SiteSearchFakeReply } from "../bin/siteSearchFake";

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

export function headerSearch(page: Page) {
  return pageObject(page).getByRole("banner").getByRole("search", { name: "Buscar no Tudo Macaé" });
}
export async function clearScriptedReplies() {
  await fetch(`${await fakeUrl()}/__replies`, { method: "DELETE" });
}
