import path from "node:path";
/**
 * The e2e stack inherits its children's output, but Playwright discards a
 * web server's stdout unless configured otherwise. Keeping it visible makes
 * build and server failures diagnosable in both local runs and CI.
 */
export async function checkE2eSupervisorOutputIsPiped({
  failures,
  readFile,
  repositoryRoot,
}) {
  const playwrightConfig = await readFile(
    path.join(repositoryRoot, "tests/e2e/playwright.config.ts"),
    "utf8",
  );
  const webServerStart = playwrightConfig.search(/\bwebServer\s*:\s*\{/);
  const webServerBlock = webServerStart === -1
    ? ""
    : playwrightConfig.slice(webServerStart).match(
      /^webServer\s*:\s*\{[\s\S]*?^  \},$/m,
    )?.[0] ?? "";
  if (!/^    stdout: "pipe",$/m.test(webServerBlock)) {
    failures.push(
      "tests/e2e/playwright.config.ts must set webServer.stdout to \"pipe\" so build and server output reaches Playwright",
    );
  }
}
