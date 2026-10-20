/** Shared by application and harness collections. */
export const standaloneHarnessTests = [
  "**/page-object-readiness.spec.ts",
  "**/fixture-readiness.spec.ts",
  "**/click-readiness.spec.ts",
  "**/diagnostics/http-failures.spec.ts",
];

export const applicationHarnessTests = ["**/fixture-cleanup.spec.ts"];
export const harnessTests = [...standaloneHarnessTests, ...applicationHarnessTests];
