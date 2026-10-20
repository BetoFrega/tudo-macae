import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import { responseFailure } from "@tudomacae/editorial-media/client";
import { reportMediaFailure, workerMedia } from "@/packages/media-api";

// A refusal or absence belongs to this session, so no cache may keep it for a later preview.
const noStore = { "Cache-Control": "private, no-store" };

/** The Worker's answer with its sanitized bytes; a refusal or absence carries no body. */
async function workerContent(response: Response) {
  if (!response.ok) {
    await response.body?.cancel();
    if (response.status >= 500) reportMediaFailure(responseFailure(response), "media.content", "/midia/[id]");
    return new Response(null, { status: response.status === 401 || response.status === 403 || response.status === 404 ? response.status : 503, headers: noStore });
  }
  return new Response(response.body, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": response.headers.get("content-type") ?? "image/webp",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** The Worker's answer; an unreachable Worker is a bodiless 503. */
async function fromWorker(id: string) {
  try {
    return await workerContent(await (await workerMedia()).content(id));
  }
  catch (error) {
    reportMediaFailure(error, "media.content", "/midia/[id]");
    return new Response(null, { status: 503, headers: noStore });
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  if (!user.isAdmin && !user.isEditor) {
    return new Response(null, { status: 403 });
  }

  const { id } = await params;
  return fromWorker(id);
}
