import { z } from "zod";

export const captureIdContract = z.string().trim().min(1).max(128);

export function articleIsVisible(article: { status: string; publishedAt?: number }, now: number): boolean {
  return article.status === "published" && article.publishedAt !== undefined
    && Number.isFinite(article.publishedAt) && article.publishedAt <= now;
}
