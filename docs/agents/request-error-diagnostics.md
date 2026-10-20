# Request error diagnostics

`src/instrumentation.ts` exports Next.js `onRequestError`. In the Node runtime,
each captured server exception emits one JSON log with `event="next.request.error"`
and severity `ERROR`. The record contains the framework route template, request
method, rendering/action context, available revision/service, numeric error digest,
recognized error code, hashes for grouping and code locations from the stack.
Raw request paths, query strings, cookies, authorization, action payloads and
exception messages are not copied into this record. Existing framework logs are
separate and retain their own behavior.

Valid incoming trace IDs are retained. When a project environment variable is
available, `logging.googleapis.com/trace` associates the record with Cloud Logging
request logs, following the [Cloud Run structured logging contract](https://docs.cloud.google.com/run/docs/logging#using-json).
Correlation and code locations may be absent; absence is not proof that a request
never reached the application. In production, the web Worker version
(`x-terms-worker-version`) identifies the deployed build.

The shared Playwright fixture observes responses from the configured application
origin in every browser context it creates, including temporary administrator
contexts. A 5xx fails the test even when the UI recovers. The fixture preserves up
to 50 sanitized response records per test: timestamp, status, method, masked route,
RSC/prefetch flags, available trace ID, body type/hash/size and numeric Next digest.
Response bodies remain in process memory only. A missing body does not erase the
observed HTTP failure. This does not observe requests made outside those browser
contexts or failures that occur only after their teardown.

Playwright attaches `http-failures.json` to the failing local/manual test. Inspect
the attachments in `tests/e2e/test-results/` or the HTML report in
`tests/e2e/playwright-report/`; production logs are a separate source.

To investigate a failure, start with the test location and timestamp from that
file, then query the Workers Logs of the web Worker `tudo-macae-terms-workers` in the
same narrow time window for errors and responses of status 500 or above.

Use `traceId`, the edge request ID, the numeric digest and the Worker version
to correlate records when present. A CDN-generated 500 may have browser evidence
without a `next.request.error` record; the hook cannot observe an upstream failure.
Do not infer a provider cause from that absence alone. Keep raw provider output
local until its contents have been reviewed and sanitized.

Verify the capture, privacy boundary, actual browser response and reporter output:

```sh
npx vitest run --config vitest.unit.config.mts src/requestErrorDiagnostics.test.ts
npm run test:e2e -- --config playwright.harness.config.ts tests/e2e/diagnostics/http-failures.spec.ts
```

These tests deliberately generate synthetic failures. They verify the diagnostic
mechanism and do not reproduce any historical application defect.
