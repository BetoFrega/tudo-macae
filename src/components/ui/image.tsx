// The app's one `next/image` import. Next honours `images.loaderFile` and builds the srcset itself,
// so this module passes it through. The vinext build swaps it for `web-worker/image.tsx`
// (`vite.vinext.config.ts`), which matches the exact specifier `@/components/ui/image`: a relative
// import of this file escapes the swap and ships vinext's single loader call without a srcset.
// Both modules export the same names; a name added here and not there fails the vinext build.
export { default } from "next/image";
export type { ImageProps } from "next/image";
