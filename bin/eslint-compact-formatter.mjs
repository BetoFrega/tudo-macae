import path from "node:path";

const PARSER_RULE = "<parser>";

function relativeFilePath(filePath, cwd) {
  const relativePath = path.relative(cwd, filePath);
  return relativePath ? relativePath.split(path.sep).join("/") : path.basename(filePath);
}

function severityName(severity) {
  return severity === 2 ? "error" : "warning";
}

/**
 * Render actionable ESLint findings without repeating the linted source.
 *
 * @param {import("eslint").ESLint.LintResult[]} results
 * @param {import("eslint").ESLint.LintResultData} context
 */
export default function compactFormatter(results, context) {
  const findings = results.flatMap(result => result.messages.map(message => ({
    column: message.column,
    fatal: message.fatal === true,
    filePath: relativeFilePath(result.filePath, context.cwd),
    line: message.line,
    message: message.message,
    ruleId: message.ruleId,
    severity: severityName(message.severity),
  })));
  const ruleCounts = new Map();

  for (const finding of findings) {
    const rule = finding.ruleId ?? PARSER_RULE;
    ruleCounts.set(rule, (ruleCounts.get(rule) ?? 0) + 1);
  }

  return JSON.stringify({
    summary: {
      errors: findings.filter(finding => finding.severity === "error").length,
      files: results.filter(result => result.messages.length > 0).length,
      rules: Object.fromEntries([...ruleCounts].sort(([left], [right]) => (
        left.localeCompare(right)
      ))),
      warnings: findings.filter(finding => finding.severity === "warning").length,
    },
    findings,
  }, null, 2);
}
