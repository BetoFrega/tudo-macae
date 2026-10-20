import { expect, test } from "vitest";
import { createClassifiedsPhotoDecoder, ClassifiedsPhotoDecodeUnavailable } from "../../classifiedsPhotos";
import { classifiedsFailureCause } from "../../diagnostics";

test.each([9412, 9413])("known Images rejection %s stays an expected domain outcome", async (code) => {
  const decode = createClassifiedsPhotoDecoder({
    async info() { throw Object.assign(new Error("private provider details"), { code }); },
    input() { throw new Error("Unexpected transformation"); },
  });
  await expect(decode(new Uint8Array([1]))).rejects.toMatchObject({ name: "PhotoError", code: "invalid" });
});
test.each([9523, 9422, 9432, 9402, 9999])("Images operational failure %s keeps a bounded provider cause", async (code) => {
  const cause = Object.assign(new Error("private provider details"), { code });
  const decode = createClassifiedsPhotoDecoder({
    async info() { throw cause; },
    input() { throw new Error("Unexpected transformation"); },
  });
  const error = await decode(new Uint8Array([1])).catch(value => value);
  expect(error).toBeInstanceOf(ClassifiedsPhotoDecodeUnavailable);
  expect(error.cause).toBe(cause);
  expect(classifiedsFailureCause(error)).toBe(code === 9999 ? "images_decode_unavailable" : `images_decode_${code}`);
  expect(classifiedsFailureCause(error)).not.toContain(cause.message);
});
