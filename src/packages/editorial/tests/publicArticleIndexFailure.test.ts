import { expect, test } from "vitest";
import { PublicArticleIndexFailure, publicArticleIndexFailureEvent } from "../publicArticleIndexFailure";

test("preserves a bounded failure category, status and correlation without serializing private error text", () => {
  const event = publicArticleIndexFailureEvent({ operation: "distribution", environment: "production", release: "release", error: new PublicArticleIndexFailure("response", 401), correlationId: "operation-1" });
  expect(event).toMatchObject({ failure: "response", statusClass: "4xx", correlationId: "operation-1" });
  const privateFailure = publicArticleIndexFailureEvent({ operation: "distribution", environment: "test", release: "release", error: new Error("private-token@example.com"), stage: "canonical-read", correlationId: "private@email" });
  expect(privateFailure).toMatchObject({ failure: "canonical-read", statusClass: "none" });
  expect(JSON.stringify(privateFailure)).not.toContain("private");
});
