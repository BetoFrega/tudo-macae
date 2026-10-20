export function accountStatusHeaders(requestId: string) {
  return { "Cache-Control": "private, no-store", "Vary": "Cookie", "x-request-id": requestId };
}

export function reportAccountStatusFailure(event: string, route: string, requestId: string, error: unknown) {
  console.error(JSON.stringify({
    event,
    service: process.env.K_SERVICE ?? "next",
    environment: process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV,
    release: process.env.K_REVISION ?? process.env.GITHUB_SHA ?? "unknown",
    outcome: "failed",
    route,
    statusClass: "5xx",
    requestId,
    failureCategory: error instanceof TypeError ? "type_error" : error instanceof SyntaxError ? "syntax_error" : "unexpected",
  }));
}
