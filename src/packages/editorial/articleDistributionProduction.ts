import { PublicArticleIndexFailure, publicArticleIndexFailureEvent } from "./publicArticleIndexFailure";
import { createPublicArticleIndexClient } from "./publicArticleIndexClient";
import { metadataIdentityToken } from "./lib/publicArticleIndexIdentity";

export function createProductionPublicArticleIndexClient() {
  if (!process.env.PUBLIC_ARTICLE_INDEX_URL) throw new PublicArticleIndexFailure("configuration");
  return createPublicArticleIndexClient({ origin: process.env.PUBLIC_ARTICLE_INDEX_URL, identityToken: metadataIdentityToken });
}

export function logPublicArticleIndexFailure(operation: "distribution" | "flag" | "projection", correlationId?: string, error?: unknown, stage?: "canonical-read" | "projection") {
  console.error(JSON.stringify(publicArticleIndexFailureEvent({ operation, environment: process.env.NODE_ENV ?? "unknown",
    release: process.env.SOURCE_SHA ?? process.env.K_REVISION ?? "unknown", error, correlationId, ...(stage ? { stage } : {}) })));
}
