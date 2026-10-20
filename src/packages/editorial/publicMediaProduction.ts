import { PublicMediaReadFailure } from "@tudomacae/editorial-blog/publicMediaContent";
import { PublicBlogRequestError } from "@tudomacae/editorial-blog/publicClient";
import { publicBlogClient } from "./publicBlogProduction";

/** The images Worker's origin read: the API Worker authorizes and serves the bytes. */
/** `HEAD` asks the Worker whether the image is public without its bytes. */
export async function readPublicMediaContent(mediaId: string, digest: string, requestId?: string, method: "GET" | "HEAD" = "GET") {
  try {
    return await publicBlogClient().editorialImage(mediaId, digest, requestId, method);
  }
  catch (error) {
    // A failure the Worker already logged keeps its mark.
    throw new PublicMediaReadFailure("worker", error instanceof PublicBlogRequestError && error.reportedByWorker);
  }
}
