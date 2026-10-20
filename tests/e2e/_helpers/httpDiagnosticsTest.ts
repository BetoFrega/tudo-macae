import { test as base, type Browser, type TestInfo } from "@playwright/test";
import { createExpectedRenderFailureScope, httpFailureAttachment, observeHttpFailures, type HttpFailure } from "./httpDiagnostics";

export type HttpDiagnosticsTestInfo = {
  project: { use: { baseURL?: string | undefined } };
  attach: TestInfo["attach"];
};

/**
 * Every context created through `browser` while `use` runs is observed. The 5xx
 * attachment is written and an unexpected failure is thrown after `use` returns.
 * Exposed separately from the fixture so response classification can be verified
 * without a nested Playwright run.
 */
export async function withHttpDiagnostics(
  { browser, expectedRenderFailure }: { browser: Browser; expectedRenderFailure: ReturnType<typeof createExpectedRenderFailureScope> },
  testInfo: HttpDiagnosticsTestInfo,
  use: () => Promise<void>,
) {
  const createContext = browser.newContext.bind(browser);
  const failures: HttpFailure[] = [];
  const pending: Promise<void>[] = [];
  const observations: ReturnType<typeof observeHttpFailures>[] = [];
  browser.newContext = async (...args) => {
    const context = await createContext(...args);
    const baseURL = testInfo.project.use.baseURL;
    if (!baseURL) throw new Error("HTTP diagnostics require the application's baseURL");
    observations.push(observeHttpFailures(context, failures, pending, new URL(baseURL).origin, expectedRenderFailure));
    return context;
  };
  try {
    await use();
  }
  finally {
    browser.newContext = createContext;
    await Promise.all(pending);
    if (failures.length) await testInfo.attach(httpFailureAttachment, {
      body: Buffer.from(JSON.stringify(failures.slice(0, 50))), contentType: "application/json",
    });
  }
  if (failures.length > 50) throw new Error("HTTP diagnostics exceeded the attachment limit");
  if (failures.length && observations.some(item => item.otherHttpError)) throw new Error("HTTP 5xx observed alongside another HTTP error");
  if (failures.some(failure => !failure.expected)) throw new Error("HTTP 5xx observed; see sanitized http-failures.json");
}

export const httpDiagnosticsTest = base.extend<{ httpDiagnostics: void; expectedRenderFailure: ReturnType<typeof createExpectedRenderFailureScope> }>({
  expectedRenderFailure: async ({}, use) => {
    await use(createExpectedRenderFailureScope());
  },
  httpDiagnostics: [async ({ browser, expectedRenderFailure }, use, testInfo) => {
    await withHttpDiagnostics({ browser, expectedRenderFailure }, testInfo, () => use());
  }, { auto: true }],
});
