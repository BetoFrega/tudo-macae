const ACCENTED = "áàãâäéèêëíìîïóòõôöúùûüçñ";
const UNACCENTED = "aaaaaeeeeiiiiooooouuuucn";
const accentedLetter = new RegExp(`[${ACCENTED}]`, "g");

/**
 * Splits text into lowercase ASCII words for accent-insensitive comparison.
 *
 * Only the Portuguese accented letters above lose their accent; every run of
 * any other character, including other accented letters and combining marks,
 * separates words. Slugs are built from these words and recomputed from titles
 * on read (Topic identity, business canonical paths), so folding a new letter
 * changes existing identities and requires a slug migration.
 *
 * @example
 * normalizedWords("Feira de Ciência, 2027!") // ["feira", "de", "ciencia", "2027"]
 */
export function normalizedWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(accentedLetter, letter => UNACCENTED.charAt(ACCENTED.indexOf(letter)))
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}
