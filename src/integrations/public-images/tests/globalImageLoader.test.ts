import { afterEach, describe, expect, test, vi } from "vitest";
// Asserts how Next itself applies `images.loaderFile`, which the app module passes through unchanged.
// eslint-disable-next-line no-restricted-imports
import { getImageProps } from "next/image";
import loader from "../../../../image-loader";

afterEach(() => vi.unstubAllEnvs());

describe("global image loader", () => {
  test("leaves any source unchanged", () => {
    expect(loader({ src: "https://example.com/photo.jpg", width: 320, quality: undefined })).toBe("https://example.com/photo.jpg");
  });

  test("emits the authorized source directly instead of an extension or optimizer URL in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production");
    const src = "/redacao/revisoes/review-1/midias/media-1?signature=fixture";
    const { props } = getImageProps({ src, alt: "Private preview", width: 320, height: 180, loader });
    expect(props.src).toBe(src);
    expect(props.srcSet).not.toMatch(/_fah|_next\/image|images\.tudomacae/u);
    expect(props.srcSet).toContain(`${src} 1x`);
  });
});
