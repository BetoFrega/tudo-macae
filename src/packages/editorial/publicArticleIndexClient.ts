import { PublicArticleIndexFailure } from "./publicArticleIndexFailure";
import { z } from "zod";
import type { PublicArticleIndexCandidate, PublicArticleSummary } from "@tudomacae/editorial-blog/publicArticleIndex";

const summarySchema = z.strictObject({
  id: z.string().min(1), storyId: z.string().min(1), title: z.string(), slug: z.string().min(1),
  mediaIds: z.array(z.string()), publishedAt: z.number().int().nonnegative(), updatedAt: z.number().int().nonnegative(),
});

export function createPublicArticleIndexClient(configuration: {
  origin: string;
  identityToken(audience: string): Promise<string>;
  request?: typeof fetch;
}) {
  let origin: URL;
  try {
    origin = new URL(configuration.origin);
  }
  catch { throw new PublicArticleIndexFailure("configuration"); }
  if (origin.protocol !== "https:" || origin.pathname !== "/" || origin.search || origin.hash || origin.username || origin.password) {
    throw new PublicArticleIndexFailure("configuration");
  }
  // Workers reject `redirect: "error"`; with "manual" a redirect fails the `ok` check instead of being followed.
  async function request(path: string, init: RequestInit = {}, correlationId?: string) {
    let token: string;
    try {
      token = await configuration.identityToken(origin.origin);
    }
    catch { throw new PublicArticleIndexFailure("identity"); }
    let response: Response;
    try {
      response = await (configuration.request ?? fetch)(new URL(path, origin), {
        ...init, redirect: "manual", signal: AbortSignal.timeout(10_000), cache: "no-store",
        headers: { ...init.headers, "authorization": `Bearer ${token}`, "content-type": "application/json",
          ...(correlationId ? { "x-request-id": correlationId } : {}) },
      });
    }
    catch { throw new PublicArticleIndexFailure("request"); }
    if (!response.ok) throw new PublicArticleIndexFailure("response", response.status);
    return response;
  }
  return {
    async list(at: number, correlationId?: string): Promise<PublicArticleSummary[]> {
      const response = await request(`/summaries?at=${at}`, {}, correlationId);
      try {
        return z.array(summarySchema).parse(await response.json());
      }
      catch { throw new PublicArticleIndexFailure("payload"); }
    },
    async apply(candidate: PublicArticleIndexCandidate, correlationId?: string) {
      const path = `/articles/${encodeURIComponent(candidate.id)}`;
      if (candidate.status === "published" && candidate.publishedAt !== undefined) {
        const { status: _status, ...summary } = candidate;
        await request(path, { method: "PUT", body: JSON.stringify(summarySchema.parse(summary)) }, correlationId);
      }
      else {
        await request(path, { method: "DELETE", body: JSON.stringify({ updatedAt: candidate.updatedAt }) }, correlationId);
      }
    },
    async replace(summaries: PublicArticleSummary[]) {
      await request("/snapshot", { method: "POST", body: JSON.stringify(z.array(summarySchema).parse(summaries)) });
    },
  };
}
