"use client";
import { forwardRef, type ComponentProps } from "react";
// In the vinext build `next/image` resolves to vinext's shim; importing it by that specifier, never
// `@/components/ui/image`, keeps this module from replacing its own dependency. Aliasing `next/image`
// itself to this module makes vinext resolve its shim back here, so `<Image>` renders itself until the
// Worker exceeds its limits (cloudflare/vinext#4262).
import VinextImage from "next/image";
import { publicImageDeviceSizes, publicImageSizes } from "@tudomacae/public-image-delivery/contract";
import directImageLoader from "../image-loader.js";

// Named, not `export *`: in the RSC environment `next/image` is vinext's virtual module, which
// @vitejs/plugin-rsc cannot read from disk to expand a "use client" star export.
export type { ImageProps } from "next/image";

type VinextImageProps = ComponentProps<typeof VinextImage>;
type Loader = NonNullable<VinextImageProps["loader"]>;

const deviceSizes: readonly number[] = publicImageDeviceSizes;
const allSizes = [...publicImageDeviceSizes, ...publicImageSizes].sort((left, right) => left - right);

// Next.js's candidate selection (`getWidths` in next/dist/shared/lib/get-img-props): loaders only ever
// receive configured widths, which the classifieds photo routes require (any other `w` answers 400).
function candidateWidths(width: number | undefined, sizes: string | undefined) {
  if (sizes) {
    const percentages = Array.from(sizes.matchAll(/(^|\s)(1?\d?\d)vw/gu), match => Number.parseInt(match[2]!, 10));
    if (percentages.length === 0) return { widths: allSizes, kind: "w" as const };
    const smallest = deviceSizes[0]! * Math.min(...percentages) * 0.01;
    return { widths: allSizes.filter(size => size >= smallest), kind: "w" as const };
  }
  if (width === undefined) return { widths: deviceSizes, kind: "w" as const };
  const widths = [...new Set([width, width * 2].map(target => allSizes.find(size => size >= target) ?? allSizes.at(-1)!))];
  return { widths, kind: "x" as const };
}

function numeric(value: number | `${number}` | undefined) {
  return value === undefined ? undefined : Number(value);
}

function intrinsicWidth(src: VinextImageProps["src"], width: VinextImageProps["width"]) {
  if (width !== undefined) return numeric(width);
  if (typeof src === "object" && "width" in src) return src.width;
  return undefined;
}

// vinext ignores `images.loaderFile` and calls a loader once with `width: imgWidth ?? 0` and no srcset,
// so this resolves src and srcset the way Next.js does and hands vinext a loader that returns them.
// The vinext build swaps `src/components/ui/image.tsx` for this module; `next build` never loads it.
// @expires 2026-12-24 delete this module and its alias once vinext honours `images.loaderFile` and
// builds a custom loader's srcset (cloudflare/vinext#3686).
const Image = forwardRef<HTMLImageElement, VinextImageProps>(function Image({ loader, ...props }, ref) {
  if (props.unoptimized) return <VinextImage ref={ref} {...props} />;
  const appLoader: Loader = loader ?? directImageLoader;
  const sizes = props.sizes ?? (props.fill ? "100vw" : undefined);
  const width = props.fill ? undefined : intrinsicWidth(props.src, props.width);
  const quality = numeric(props.quality);
  const load = (candidate: number) => appLoader({ src, width: candidate, ...(quality === undefined ? {} : { quality }) });
  const src = typeof props.src === "string" ? props.src : "default" in props.src ? props.src.default.src : props.src.src;
  const { widths, kind } = candidateWidths(width, sizes);
  const srcSet = widths
    .map((candidate, index) => `${load(candidate)} ${kind === "w" ? candidate : index + 1}${kind}`)
    .join(", ");
  const resolvedSrc = load(widths.at(-1)!);
  const { sizes: _sizes, ...rest } = props;
  // vinext's props type omits `srcSet`, but its loader branch forwards unknown props to the <img>.
  const imgAttributes: Record<string, string> = { srcSet, ...(kind === "w" && sizes ? { sizes } : {}) };
  return <VinextImage ref={ref} {...rest} {...imgAttributes} loader={() => resolvedSrc} />;
});

export default Image;
