import { normalizedWords } from "./normalizedWords";

/**
 * Generates a URL-friendly slug from a title string: its normalized words
 * joined by hyphens, cut to 100 characters without a trailing hyphen, and "-"
 * when no word remains.
 *
 * @example
 * slugify("Carro Honda Civic 2020 - Ótimo Estado!") // "carro-honda-civic-2020-otimo-estado"
 */
export function slugify(text: string): string {
  const slug = normalizedWords(text).join("-").slice(0, 100).replace(/-$/, "");
  return slug || "-";
}
