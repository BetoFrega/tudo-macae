import path from "node:path";

const historicalMarker = "<!-- context-reference: historical -->";

async function readRetiredReferences(contextRoot, failures, readFile) {
  const retirementsPath = path.join(
    contextRoot,
    ".agents",
    "context-retirements.json",
  );
  try {
    const retirements = JSON.parse(await readFile(retirementsPath, "utf8"));
    const retiredReferences = retirements.retiredReferences;
    if (
      !Array.isArray(retiredReferences)
      || retiredReferences.some(reference => (
        typeof reference !== "string" || reference.length === 0
      ))
    ) throw new Error("retiredReferences must be an array of non-empty strings");
    return retiredReferences;
  }
  catch (error) {
    if (error.code !== "ENOENT") {
      failures.push(`.agents/context-retirements.json is invalid: ${error.message}`);
    }
    return [];
  }
}

async function readOptionalFile(readFile, sourcePath) {
  try {
    return await readFile(sourcePath, "utf8");
  }
  catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function reportRetiredReferences({ contextRoot, failures }, sourcePath, contents, retiredReferences) {
  for (const [lineIndex, line] of contents.split("\n").entries()) {
    if (line.trimEnd().endsWith(historicalMarker)) continue;

    for (const retiredReference of retiredReferences) {
      if (!line.includes(retiredReference)) continue;
      failures.push(
        `${path.relative(contextRoot, sourcePath)}:${lineIndex + 1} actively `
        + `references retired context ${retiredReference}`,
      );
    }
  }
}

export async function checkRetiredContextReferences(
  { contextRoot, failures, readFile },
  markdownFiles,
) {
  const retiredReferences = await readRetiredReferences(contextRoot, failures, readFile);
  if (retiredReferences.length === 0) return;

  for (const sourcePath of markdownFiles) {
    const contents = await readOptionalFile(readFile, sourcePath);
    if (contents === null) continue;
    reportRetiredReferences({ contextRoot, failures }, sourcePath, contents, retiredReferences);
  }
}
