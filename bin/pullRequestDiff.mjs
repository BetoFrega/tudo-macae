export const DOCUMENTATION_FAST_PATH = "documentation-fast-path";
export const FULL_TEST_PATH = "full-test-path";

const documentationPath = /^docs\/(?:[^/]+\/)*[^/]+\.md$/;
const ordinaryStatuses = new Set(["added", "modified", "removed"]);

function isDocumentationMarkdown(path) {
  return typeof path === "string"
    && !path.includes("\\")
    && !path.includes("..")
    && documentationPath.test(path);
}

function selectFullTestPath(reason) {
  return { plan: FULL_TEST_PATH, reason };
}

function fileRejectionReason(file) {
  if (!file || typeof file !== "object") return "ambiguous-file";
  if (!isDocumentationMarkdown(file.filename)) return "non-documentation-path";
  if (ordinaryStatuses.has(file.status)) {
    return file.previous_filename === undefined ? null : "ambiguous-file";
  }
  if (file.status === "renamed" && isDocumentationMarkdown(file.previous_filename)) return null;
  return "ambiguous-file";
}

/**
 * Chooses the CI plan for one immutable pull-request fixed point.
 *
 * Callers must pass the complete, paginated file list only after they have
 * verified that the pull request still has the event's base and head SHAs.
 * Any incomplete observation intentionally keeps the expensive test path.
 */
export function classifyPullRequestDiff(snapshot) {
  if (!snapshot || snapshot.complete !== true) return selectFullTestPath("incomplete-diff");
  if (typeof snapshot.baseSha !== "string" || typeof snapshot.headSha !== "string") return selectFullTestPath("ambiguous-fixed-point");
  if (!Array.isArray(snapshot.files) || snapshot.files.length === 0) return selectFullTestPath("unexpected-empty-diff");

  for (const file of snapshot.files) {
    const reason = fileRejectionReason(file);
    if (reason) return selectFullTestPath(reason);
  }

  return { plan: DOCUMENTATION_FAST_PATH, reason: "documentation-only-diff" };
}
