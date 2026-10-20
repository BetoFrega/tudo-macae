import type { MediaSearchDependencies, MediaReferenceLookup, UnreferencedStagedMediaReportInput } from "../search";
import { validateMediaSearchInput, normalizeMediaSearchText, encodeMediaSearchCursor, type MediaSearchInput, type ValidatedMediaSearchInput } from "./mediaSearchPolicy";

type ScanQuery = Parameters<MediaSearchDependencies["scan"]>[0];
type ScannedMedia = Awaited<ReturnType<MediaSearchDependencies["scan"]>>[number];

function scanLimitFor(validated: ValidatedMediaSearchInput): number {
  const hasTextFilter = validated.text || validated.credit || validated.provenance;
  return hasTextFilter ? Math.min(250, Math.max(50, validated.limit * 5)) : validated.limit + 1;
}

function scanQuery(validated: ValidatedMediaSearchInput, limit: number): ScanQuery {
  return {
    limit,
    ...(validated.kind ? { kind: validated.kind } : {}),
    ...(validated.status ? { status: validated.status } : {}),
    ...(validated.cursor ? { cursor: { createdAt: validated.cursor.createdAt, id: validated.cursor.id } } : {}),
  };
}

function matchesTextFilters(media: ScannedMedia, validated: ValidatedMediaSearchInput): boolean {
  const text = normalizeMediaSearchText(`${media.alt} ${media.caption}`);
  const credit = normalizeMediaSearchText(media.provenance.credit);
  const provenance = normalizeMediaSearchText(Object.values(media.provenance).join(" "));
  return (!validated.text || text.includes(validated.text))
    && (!validated.credit || credit.includes(validated.credit))
    && (!validated.provenance || provenance.includes(validated.provenance));
}

/** More matches than returned resume after the last one returned; a full scan resumes after the last candidate. */
function nextCursorSource({ matches, media, candidates, limit, scanLimit }: {
  matches: ScannedMedia[];
  media: ScannedMedia[];
  candidates: ScannedMedia[];
  limit: number;
  scanLimit: number;
}): ScannedMedia | undefined {
  const lastReturned = media.at(-1);
  if (matches.length > limit && lastReturned) return lastReturned;
  return candidates.length === scanLimit ? candidates.at(-1) : undefined;
}

export function buildMediaSearch({ scan }: MediaSearchDependencies) {
  async function search(input: MediaSearchInput = {}) {
    const validated = validateMediaSearchInput(input);
    const scanLimit = scanLimitFor(validated);
    const candidates = await scan(scanQuery(validated, scanLimit));
    const matches = candidates.filter(media => matchesTextFilters(media, validated));
    const media = matches.slice(0, validated.limit);
    const cursorSource = nextCursorSource({ matches, media, candidates, limit: validated.limit, scanLimit });
    return {
      media,
      ...(cursorSource ? { nextCursor: encodeMediaSearchCursor({ filters: validated.filters, createdAt: cursorSource.createdAt, id: cursorSource.id }) } : {}),
    };
  }
  return {
    search,
    async reportUnreferenced(input: UnreferencedStagedMediaReportInput, references: MediaReferenceLookup) {
      const page = await search({ ...input, status: "staged" });
      const referenced = await Promise.all(page.media.map(media => references.hasReference(media.id)));
      return {
        media: page.media.filter((_media, index) => !referenced[index]),
        ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
      };
    },
  };
}
