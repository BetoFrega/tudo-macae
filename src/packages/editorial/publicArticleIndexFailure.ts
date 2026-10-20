export type PublicArticleIndexFailureCategory = "configuration" | "canonical-read" | "identity" | "request" | "response" | "payload" | "flag-request" | "flag-response" | "flag-payload" | "unknown";

export class PublicArticleIndexFailure extends Error {
  constructor(public readonly category: PublicArticleIndexFailureCategory, public readonly status?: number) {
    super(category);
  }
}

export function publicArticleIndexFailureEvent(input: {
  operation: "distribution" | "flag" | "projection";
  environment: string;
  release: string;
  error?: unknown;
  stage?: "canonical-read" | "projection";
  correlationId?: string | undefined;
}) {
  const failure = input.error instanceof PublicArticleIndexFailure ? input.error.category : input.stage === "canonical-read" ? "canonical-read" : "unknown";
  const status = input.error instanceof PublicArticleIndexFailure ? input.error.status : undefined;
  return { event: "public_article_index_failure", service: "nextjs", environment: input.environment, release: input.release,
    outcome: "failure", operation: input.operation, failure,
    statusClass: status && status >= 100 && status < 600 ? `${Math.floor(status / 100)}xx` : "none",
    ...(input.correlationId && /^[a-zA-Z0-9_-]{1,128}$/.test(input.correlationId) ? { correlationId: input.correlationId } : {}) };
}
