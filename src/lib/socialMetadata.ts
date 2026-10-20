import type { Metadata } from "next";

export const DEFAULT_SOCIAL_IMAGE = {
  url: "/social-preview.png",
  width: 1200,
  height: 630,
  alt: "Tudo Macaé — notícias e classificados de Macaé",
} as const;

interface SocialImage {
  url: string;
  alt?: string;
}

interface OpenGraphInput {
  title: string;
  description: string;
  url: string;
  type?: "article" | "website";
  images?: SocialImage[];
}

export function createSocialDescription(
  description: string | null | undefined,
  fallback: string,
): string {
  return description?.trim().substring(0, 160) || fallback;
}

/**
 * Every public share target carries an image. Content images take precedence;
 * routes without one use the brand mark so messaging clients can still render
 * a complete card.
 */
export function createOpenGraph({
  title,
  description,
  url,
  type = "website",
  images,
}: OpenGraphInput): NonNullable<Metadata["openGraph"]> {
  return {
    title,
    description,
    url,
    type,
    siteName: "Tudo Macaé",
    locale: "pt_BR",
    images: images?.length
      ? images.map(image => ({
          url: image.url,
          ...(image.alt ? { alt: image.alt } : {}),
        }))
      : [{ ...DEFAULT_SOCIAL_IMAGE }],
  };
}
