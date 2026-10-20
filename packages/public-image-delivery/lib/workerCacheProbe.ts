import { authorizeEditorialCacheProbe } from "../probeAuthorization";
import { publicImagePresetWidths, editorialCacheProbeHeader, editorialCacheVariantHeader } from "../contract";
import type {
  ParsedImageRequest,
  PublicImageWorkerConfiguration,
  PublicImageWorkerDependencies,
} from "./workerTypes";

type ProbeMode = "1" | "all";
type ProbeVariant = { preset: ParsedImageRequest["preset"]; width: number; format: ParsedImageRequest["format"] };

function noStoreResponse(status: number): Response {
  return new Response(null, { status, headers: { "cache-control": "no-store" } });
}

/** A complete probe covers every preset of the class, since all of them share the purged cache tag. */
function probeVariants(mode: ProbeMode, parsed: ParsedImageRequest): ProbeVariant[] {
  if (mode === "1") return [{ preset: parsed.preset, width: parsed.width, format: parsed.format }];
  const presets: Record<string, readonly number[]> = publicImagePresetWidths[parsed.imageClass];
  return Object.entries(presets).flatMap(([preset, widths]) => widths.flatMap(width =>
    (["avif", "webp", "jpeg"] as const).map(format => ({ preset: preset as ParsedImageRequest["preset"], width, format }))));
}

function rejectedAuthorizationResponse(
  dependencies: PublicImageWorkerDependencies,
  parsed: ParsedImageRequest,
  configuration: PublicImageWorkerConfiguration,
): Response {
  dependencies.log({
    cache: "uninspected",
    ...(configuration.editorialCacheProbeSecret ? {} : { failure: "configuration" }),
    imageClass: parsed.imageClass,
    preset: parsed.preset,
    reason: "cache_probe_authorization",
    result: "rejected",
    status: 403,
  });
  return noStoreResponse(403);
}

async function residentVariant(
  dependencies: PublicImageWorkerDependencies,
  cacheUrl: URL,
  variants: readonly ProbeVariant[],
): Promise<ProbeVariant | undefined> {
  // Inspect locally instead of issuing a network request for every cache entry.
  for (let offset = 0; offset < variants.length; offset += 5) {
    const batch = variants.slice(offset, offset + 5);
    const matches = await Promise.all(batch.map(async ({ preset, width, format }) => {
      const variantUrl = new URL(cacheUrl);
      variantUrl.pathname = variantUrl.pathname.replace(/^(\/v1\/[a-z]+)\/[a-z]+\/\d+\//, `$1/${preset}/${width}/`);
      variantUrl.searchParams.set("format", format);
      return !!await dependencies.cache.match(new Request(variantUrl));
    }));
    const resident = batch.find((_variant, index) => matches[index]);
    if (resident) return resident;
  }
  return undefined;
}

// Editorial keeps its established `width/format` label; Hosted classes also name the preset.
function variantLabel(parsed: ParsedImageRequest, resident: ProbeVariant): string {
  return parsed.imageClass === "editorial" ? `${resident.width}/${resident.format}` : `${resident.preset}/${resident.width}/${resident.format}`;
}

function probeResultResponse(
  dependencies: PublicImageWorkerDependencies,
  parsed: ParsedImageRequest,
  mode: ProbeMode,
  resident: ProbeVariant | undefined,
): Response {
  const present = resident !== undefined;
  dependencies.log({ cache: present ? "hit" : "miss", imageClass: parsed.imageClass,
    preset: parsed.preset, result: present ? "cache_present" : "cache_absent", status: present ? 200 : 404 });
  return new Response(null, { status: present ? 200 : 404,
    headers: { [editorialCacheProbeHeader]: mode, "cache-control": "no-store",
      ...(resident ? { [editorialCacheVariantHeader]: variantLabel(parsed, resident) } : {}) } });
}

// Read-only probes inspect variants without fetching an origin,
// creating a variant, or exposing image bytes.
export async function editorialCacheProbeResponse(
  dependencies: PublicImageWorkerDependencies,
  request: Request,
  parsed: ParsedImageRequest,
  configuration: PublicImageWorkerConfiguration,
  cacheUrl: URL,
): Promise<Response> {
  const mode = request.headers.get(editorialCacheProbeHeader);
  if (request.method !== "HEAD" || (mode !== "1" && mode !== "all")) return noStoreResponse(400);
  if (mode === "all" && !await authorizeEditorialCacheProbe(request, configuration.editorialCacheProbeSecret)) {
    return rejectedAuthorizationResponse(dependencies, parsed, configuration);
  }
  let resident: ProbeVariant | undefined;
  try {
    resident = await residentVariant(dependencies, cacheUrl, probeVariants(mode, parsed));
  }
  catch {
    dependencies.log({ cache: "uninspected", imageClass: parsed.imageClass, preset: parsed.preset,
      result: "rejected", failure: "cache", status: 502 });
    return noStoreResponse(502);
  }
  return probeResultResponse(dependencies, parsed, mode, resident);
}
