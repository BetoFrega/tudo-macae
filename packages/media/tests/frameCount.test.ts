import sharp from "sharp";
import { expect, test } from "vitest";
import { mediaFrameCount } from "../fileInspection";

const frame = (background: string) => sharp({ create: { width: 8, height: 8, channels: 3, background } }).png().toBuffer();
const animated = async (format: "gif" | "webp") => new Uint8Array(await sharp([await frame("red"), await frame("blue")], { join: { animated: true } })[format]().toBuffer());

test.each(["gif", "webp"] as const)("counts the frames of an animated %s", async (format) => {
  expect(mediaFrameCount(await animated(format))).toBe(2);
});

test.each(["gif", "webp", "png", "jpeg"] as const)("counts one frame in a static %s", async (format) => {
  expect(mediaFrameCount(new Uint8Array(await sharp(await frame("red"))[format]().toBuffer()))).toBe(1);
});

test.each(["gif", "webp"] as const)("refuses a truncated %s container", async (format) => {
  const bytes = await animated(format);
  expect(() => mediaFrameCount(bytes.subarray(0, bytes.length - 12))).toThrow(TypeError);
});
