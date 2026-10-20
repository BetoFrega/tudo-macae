import { describe, expect, it } from "vitest";
import { articleJsonLdImageUrls, buildNewsArticleJsonLd } from "./newsArticleJsonLd";

describe("buildNewsArticleJsonLd", () => {
  const article = {
    title: "A obra da orla começa em setembro",
    body: "A Prefeitura confirmou o início da obra da orla nesta segunda-feira, depois de meses de espera pela comunidade local.",
    publishedAt: Date.parse("2026-08-20T14:30:00-03:00"),
  };

  it("includes headline, description, datePublished and image when there is media", () => {
    const jsonLd = buildNewsArticleJsonLd({
      article,
      imageUrls: ["https://storage.googleapis.com/bucket/orla.png"],
    });

    expect(jsonLd).toEqual({
      "@context": "https://schema.org",
      "@type": "NewsArticle",
      "headline": article.title,
      "description": article.body.substring(0, 160),
      "datePublished": new Date(article.publishedAt).toISOString(),
      "image": ["https://storage.googleapis.com/bucket/orla.png"],
    });
  });

  it("omits image when the article has no media, instead of pointing at nothing", () => {
    const jsonLd = buildNewsArticleJsonLd({ article, imageUrls: [] });

    expect(jsonLd).not.toHaveProperty("image");
  });

  it("uses only explicit header media for JSON-LD and keeps the legacy gallery", () => {
    const mediaUrls = { old1: "/media/old1", old2: "/media/old2", inline: "/media/inline" };
    const legacy = { media: [{ id: "old1" }, { id: "old2" }, { id: "inline" }], legacyHeaderMediaIds: ["old1", "old2"] };
    expect(articleJsonLdImageUrls({ article: legacy, mediaUrls, origin: "https://example.test" }))
      .toEqual(["https://example.test/media/old1", "https://example.test/media/old2"]);
    expect(articleJsonLdImageUrls({
      article: { ...legacy, leadMediaId: "old2" }, mediaUrls, origin: "https://example.test",
    })).toEqual(["https://example.test/media/old2"]);
    expect(articleJsonLdImageUrls({
      article: { ...legacy, leadMediaId: null }, mediaUrls, origin: "https://example.test",
    })).toEqual([]);
  });
});
