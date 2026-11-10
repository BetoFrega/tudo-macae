const providerDetailLimit = 800;
const ansiEscape = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "gu");
const blockEnd = /If you think this is a bug|Logs were written to/u;

/** Wrangler's `[ERROR]` block, without the bindings table and module list that precede it. */
function errorBlock(stderr) {
  const lines = stderr.split("\n");
  const start = lines.findIndex(line => line.includes("[ERROR]"));
  if (start < 0) return "";
  const end = lines.findIndex((line, index) => index > start && blockEnd.test(line));
  return lines.slice(start, end < 0 ? undefined : end)
    .map(line => line.trim().replace(/^✘\s*\[ERROR\]\s*/u, ""))
    .filter(Boolean)
    .join(" ")
    .slice(0, providerDetailLimit);
}

/** Names the failed command, its exit, the provider code and the provider's own explanation. */
export function wranglerFailureMessage(args, error) {
  const stderr = String(error.stderr ?? "").replace(ansiEscape, "");
  const providerCode = stderr.match(/\[code: (\d+)\]/u)?.[1];
  const cause = error.code ?? `exit ${error.status ?? "unknown"}`;
  const detail = errorBlock(stderr);
  return `Wrangler ${args[0]} failed (${cause}${providerCode ? `, code ${providerCode}` : ""})${detail ? `: ${detail}` : ""}`;
}
