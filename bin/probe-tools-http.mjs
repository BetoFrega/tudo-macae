function isExpectedRejection(check, response, payload) {
  const deleteRejected = check.id === "sessionDeleteRejected";
  return response.status === (deleteRejected ? 405 : 401)
    && payload?.version === 1
    && payload?.error?.code === (deleteRejected ? "validationFailed" : "unauthenticated")
    && (!deleteRejected || response.headers.get("allow") === "POST");
}

function bypassesEdgeCache(response) {
  return response.headers.get("cache-control")?.includes("no-store")
    && !["HIT", "STALE", "UPDATING", "REVALIDATED"].includes(response.headers.get("cf-cache-status") ?? "")
    && response.headers.get("cf-mitigated") !== "challenge";
}

try {
  const checks = await Promise.all([
    {
      id: "tools",
      path: "/tools/v1",
      init: {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation: "list_story_queue", input: {} }),
      },
    },
    { id: "sessionIssue", path: "/sessions/v1", init: { method: "POST" } },
    { id: "sessionDeleteRejected", path: "/sessions/v1", init: { method: "DELETE" } },
  ].map(async (check) => {
    const response = await fetch(`https://mcp.tudomacae.com.br${check.path}`, {
      ...check.init,
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });
    const payload = await response.json().catch(() => null);
    const passed = isExpectedRejection(check, response, payload) && bypassesEdgeCache(response);
    return { id: check.id, passed, status: response.status };
  }));
  const passed = checks.every(check => check.passed);
  console.log(JSON.stringify({ passed, checks }));
  process.exitCode = passed ? 0 : 1;
}
catch {
  console.log(JSON.stringify({ passed: false, error: "transportFailure" }));
  process.exitCode = 1;
}
