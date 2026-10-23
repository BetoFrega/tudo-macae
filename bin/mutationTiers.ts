export type MutationTier = {
  name: string;
  mutate: readonly string[];
  tests: readonly string[];
};

export const unitMutationTierByName = {
  pure: {
    name: "pure",
    mutate: [
      "bin/agentHarnessChecker.mjs",
      "bin/agentHarnessContextPointers.mjs",
      "bin/agentHarnessE2e.mjs",
      "bin/agentHarnessFiles.mjs",
      "bin/agentHarnessHooks.mjs",
      "bin/agentHarnessRetiredContext.mjs",
      "bin/agentHarnessScripts.mjs",
      "bin/agentHarnessSkills.mjs",
      "bin/checkAgentHarnessCli.mjs",
      "bin/scripts-help.mjs",
      "eslint-rules/no-portuguese-identifiers.js",
      "src/lib/**/*.ts",
      "packages/advertiser-identity/phonePresentation.ts",
      "packages/text-normalization/*.ts",
      "packages/civil-time/index.ts",
      "packages/ads/validation.ts",
      "packages/ads/management.ts",
      "!src/lib/**/*.test.ts",
      "src/features/*/validation.ts",
      "src/proxy.ts",
      "src/proxyHandler.ts",
      "packages/editorial-access/activity.ts",
      "packages/editorial-media/mediaCorrectionPolicy.ts",
      "packages/editorial-media/mediaCorrection.ts",
      "packages/editorial-sourcing/sourcePermissionCapabilities.ts",
      "packages/editorial-sourcing/sourcePermissionPolicy.ts",
      "packages/ads/lib/adListingTags.ts",
      "packages/media/model.ts",
    ],
    // Named file by file rather than globbed over `src/features/*`: this
    // runner is node-only, and a feature-root test that needs the DOM would
    // fail here for the environment rather than for the code.
    tests: [
      "packages/text-normalization/tests/*.test.ts",
      "packages/civil-time/tests/saoPauloDateTime.test.ts",
      "packages/ads/tests/validation.*.test.ts",
      "packages/ads/tests/management.test.ts",
      "bin/agentHarnessChecker*.test.ts",
      "bin/check-agent-harness.*.test.ts",
      "bin/scripts-help.test.ts",
      "eslint-rules/no-portuguese-identifiers.*.test.js",
      "src/lib/**/*.test.ts",

      "src/features/*/validation.test.ts",
      "src/proxy.test.ts",
      "src/proxyHandler.test.ts",
      "packages/editorial-access/tests/editorialActivity.test.ts",
      "packages/editorial-media/tests/mediaCorrectionPolicy.test.ts",
      "packages/editorial-media/tests/mediaCorrection.test.ts",
      "packages/editorial-sourcing/tests/editorialSourcePermissionPolicy.test.ts",
      "packages/ads/tests/adListingTags.test.ts",
      "packages/media/tests/model.test.ts",
      "bin/setTestEnvVars.test.ts",
    ],
  },
  component: {
    name: "component",
    mutate: [
      "src/instrumentation.ts",
      "packages/media/lib/imageProcessing.ts",
      "src/features/users/components/UserList.tsx",
      "src/app/redacao/layout.tsx",
      "src/components/ui/area-navigation.tsx",
      "src/features/news/components/ArticleDraftForm.tsx",
      "src/features/news/components/CorrectionsList.tsx",
      "src/packages/news-cache/lib/articleCache.ts",
      "src/features/ads/actions/createAd.ts",
      "src/features/ads/actions/deleteAd.ts",
      "src/features/ads/actions/getFilteredAds.ts",
      "src/features/ads/actions/updateAd.ts",
      "src/features/ads/actions/updateAdStatus.ts",
      "src/features/ads/actions/uploadAdImage.ts",
      "src/features/ads/hooks/useAdFormLogic.ts",
      "src/features/advertiser-profile/actions/uploadProfilePhoto.ts",
      "src/features/media/actions/getMediaOptions.ts",
      "src/features/media/actions/getMedia.ts",
      "src/features/media/actions/updateMedia.ts",
      "packages/media/lib/ui/MediaEditDialog.tsx",
      "packages/media/lib/ui/MediaForm.tsx",
      "packages/media/lib/ui/MediaImage.tsx",
      "packages/media/lib/ui/MediaMetadataFields.tsx",
      "packages/media/lib/ui/MediaPicker.tsx",
      "packages/media/lib/ui/MediaPickerOptions.tsx",
      "packages/media/lib/ui/MediaPickerPreview.tsx",
      "packages/media/lib/mediaForm.ts",
      "src/features/media/mediaOptions.ts",
      "src/app/midia/[id]/route.ts",
      "src/features/navigation/UserSidebar.tsx",
      "src/features/authentication/AuthContext.tsx",
      "packages/authentication/lib/ui/AuthContext.tsx",
      "packages/authentication/lib/ui/LoginModal.tsx",
      "src/features/authentication/actions/getCurrentUser.ts",
      "src/features/authentication/readBrowserSession.ts",
      "src/features/authentication/passwordLoginRequest.ts",
    ],
    tests: [
      "src/**/*.test.{ts,tsx}",
      "packages/authentication/tests/**/*.test.{ts,tsx}",
      "packages/media/tests/**/*.test.{ts,tsx}",
      "!src/**/*.integration.test.ts",
    ],
  },
} as const satisfies Record<string, MutationTier>;

export type UnitMutationTierName = keyof typeof unitMutationTierByName;

export const unitMutationTiers: readonly MutationTier[] = Object.values(
  unitMutationTierByName,
);

export type MutationTierRun = {
  tierName: UnitMutationTierName;
  exitCode: number;
  output: string;
};

export function summarizeMutationTierRuns(runs: readonly MutationTierRun[]) {
  const indexByTier = new Map<string, number>(
    unitMutationTiers.map((tier, index) => [tier.name, index]),
  );

  const orderedRuns = [...runs].sort(
    (a, b) => indexByTier.get(a.tierName)! - indexByTier.get(b.tierName)!,
  );

  return {
    exitCode: runs.some(run => run.exitCode !== 0) ? 1 : 0,
    orderedRuns,
  };
}
