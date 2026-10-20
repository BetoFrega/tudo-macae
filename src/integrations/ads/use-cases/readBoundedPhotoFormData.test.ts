import { expect, test } from "vitest";
import { InvalidPhotoBytes, PhotoUploadTooLarge, readBoundedPhotoFormData } from "./readBoundedPhotoFormData";

test("parses a multipart photo request without a content-length header", async () => {
  const form = new FormData();
  form.set("images", "[]");
  const request = new Request("http://localhost/upload", { method: "POST", body: form });
  request.headers.delete("content-length");
  expect((await readBoundedPhotoFormData(request)).get("images")).toBe("[]");
});

test("stops an oversized chunked request before parsing unused parts", async () => {
  const bytes = new Uint8Array(4 * 1024 * 1024 + 1);
  const request = new Request("http://localhost/upload", {
    method: "POST",
    headers: { "content-type": "multipart/form-data; boundary=test" },
    body: bytes,
  });
  request.headers.delete("content-length");
  await expect(readBoundedPhotoFormData(request)).rejects.toBeInstanceOf(PhotoUploadTooLarge);
});

test("rejects surplus and unreferenced files before decoding", async () => {
  const form = new FormData();
  form.set("images", "[]");
  for (let index = 0; index < 4; index++) form.set(`file-${index}`, new File(["invalid"], `${index}.png`, { type: "image/png" }));
  await expect(readBoundedPhotoFormData(new Request("http://localhost/upload", { method: "POST", body: form }))).rejects.toBeInstanceOf(InvalidPhotoBytes);
});
