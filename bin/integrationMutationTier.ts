// Scope of the integration mutation tier. Runner settings, score history and
// the tier's safety rules live in stryker.integration.config.mjs.
//
// Listed file by file, not globbed: the point of this tier is the code the
// `*.integration.test.ts` suites actually reach. A glob would sweep in code
// that no integration test covers and bury the real signal under no-coverage
// mutants. An entry whose file is deleted must leave this list.
export const integrationMutationScope = [
  "src/packages/demo-seed/index.ts",
  "src/packages/demo-seed/lib/environment.ts",
  "src/packages/demo-seed/lib/accounts.ts",
  "src/packages/demo-seed/lib/activityAreas.ts",
  "src/packages/demo-seed/lib/ads.ts",
  "src/packages/demo-seed/lib/blogPosts.ts",
  "src/packages/demo-seed/lib/businesses.ts",
  "src/packages/demo-seed/lib/classifiedsImages.ts",
  "src/packages/demo-seed/lib/demoClock.ts",
  "src/packages/demo-seed/lib/demoKey.ts",
  "src/packages/demo-seed/lib/worker.ts",
] as const;
