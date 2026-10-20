import { expect, test } from "vitest";
import { prepareAdPhoto } from "./prepareAdPhoto";

test("qualified uploads retain source bytes until Worker admission, including spoofed payloads", async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const file = new File([bytes], "photo.gif", { type: "image/gif" });
  expect(await prepareAdPhoto(file)).toBe(file);
  expect(new Uint8Array(await (await prepareAdPhoto(file)).arrayBuffer())).toEqual(bytes);
});
test.each([new File([], "empty.png", { type: "image/png" }), new File(["x"], "photo.svg", { type: "image/svg+xml" }), new File([new Uint8Array(1024 * 1024 + 1)], "large.gif", { type: "image/gif" })])("qualified transport rejects invalid file envelopes before admission", async (file) => {
  await expect(prepareAdPhoto(file)).rejects.toThrow();
});
