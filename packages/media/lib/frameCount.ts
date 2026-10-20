import { staticMediaContentTypeFromSignature } from "./fileSignature";

class MalformedImage extends TypeError {
  constructor() {
    super("malformed image container");
  }
}

function byte(bytes: Uint8Array, offset: number) {
  const value = bytes[offset];
  if (value === undefined) throw new MalformedImage();
  return value;
}

/** Skips GIF data sub-blocks and returns the offset after their terminator. */
function skipSubBlocks(bytes: Uint8Array, offset: number) {
  let position = offset;
  for (let size = byte(bytes, position); size; size = byte(bytes, position)) position += size + 1;
  return position + 1;
}

const colorTableBytes = (packed: number) => packed & 0x80 ? 3 * 2 ** ((packed & 0x07) + 1) : 0;

function gifFrames(bytes: Uint8Array) {
  let position = 13 + colorTableBytes(byte(bytes, 10));
  let frames = 0;
  for (;;) {
    const block = byte(bytes, position);
    if (block === 0x3b) return frames;
    if (block === 0x21) position = skipSubBlocks(bytes, position + 2);
    else if (block === 0x2c) {
      frames += 1;
      position = skipSubBlocks(bytes, position + 11 + colorTableBytes(byte(bytes, position + 9)));
    }
    else throw new MalformedImage();
  }
}

const fourCC = (bytes: Uint8Array, offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
const littleEndian32 = (bytes: Uint8Array, offset: number) => byte(bytes, offset) + byte(bytes, offset + 1) * 0x100 + byte(bytes, offset + 2) * 0x10000 + byte(bytes, offset + 3) * 0x1000000;

function webpFrames(bytes: Uint8Array) {
  let frames = 0;
  for (let position = 12; position < bytes.length;) {
    const size = littleEndian32(bytes, position + 4);
    if (position + 8 + size > bytes.length) throw new MalformedImage();
    if (fourCC(bytes, position) === "ANMF") frames += 1;
    position += 8 + size + (size & 1);
  }
  return Math.max(frames, 1);
}

/**
 * Frames that a full decoder would expose as pages, read from the container alone: GIF image
 * descriptors and WebP animation frames. PNG counts as one page, like the source decoder, which
 * keeps only the default image of an APNG. A container that ends early throws `TypeError`.
 */
export function mediaFrameCount(bytes: Uint8Array): number {
  const contentType = staticMediaContentTypeFromSignature(bytes);
  if (contentType === "image/gif") return gifFrames(bytes);
  if (contentType === "image/webp") return webpFrames(bytes);
  return 1;
}
