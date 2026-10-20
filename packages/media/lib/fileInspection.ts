import { mediaUploadContentTypes, mediaUploadLimits } from "../ingestionPolicy";
import { staticMediaContentTypeFromSignature } from "./fileSignature";

export interface StaticMediaFileDetails {
  contentType: (typeof mediaUploadContentTypes)[number];
  width: number;
  height: number;
  pages: number;
}

export interface StaticMediaFileInspectionDependencies {
  decode(bytes: Uint8Array): Promise<StaticMediaFileDetails>;
}

function isAdmissibleDimension(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= mediaUploadLimits.maxDimension;
}

function hasAdmissibleShape(details: StaticMediaFileDetails): boolean {
  return isAdmissibleDimension(details.width)
    && isAdmissibleDimension(details.height)
    && details.width * details.height <= mediaUploadLimits.maxPixels
    && details.pages === 1;
}

/** Shared local admission policy; decoders supply only facts observed from bytes. */
export function createStaticMediaFileInspection(dependencies: StaticMediaFileInspectionDependencies) {
  return {
    async inspect(bytes: Uint8Array): Promise<StaticMediaFileDetails> {
      const contentType = staticMediaContentTypeFromSignature(bytes);
      if (!contentType || bytes.length === 0 || bytes.length > mediaUploadLimits.maxBytes) throw new TypeError("invalid media file");
      const details = await dependencies.decode(bytes);
      if (details.contentType !== contentType || !hasAdmissibleShape(details)) throw new TypeError("invalid media file");
      return details;
    },
  };
}
