import { describe, expect, it } from "vitest";
import { resolveArticleSlug } from "./articleSlugResolution";

describe("resolveArticleSlug", () => {
  it("serves when the requested slug matches the article's current slug", () => {
    expect(
      resolveArticleSlug({ slug: "obra-da-orla" }, "obra-da-orla"),
    ).toEqual({ type: "serve" });
  });

  it("redirects to the canonical slug when the requested slug is stale", () => {
    expect(
      resolveArticleSlug({ slug: "obra-da-orla" }, "obra-antiga"),
    ).toEqual({ type: "redirect", canonicalSlug: "obra-da-orla" });
  });

  it("redirects when no slug was requested at all", () => {
    expect(resolveArticleSlug({ slug: "obra-da-orla" }, "")).toEqual({
      type: "redirect",
      canonicalSlug: "obra-da-orla",
    });
  });
});
