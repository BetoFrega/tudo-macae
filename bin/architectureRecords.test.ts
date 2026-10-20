// @vitest-environment node
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { checkArchitectureRecords } from "./architectureRecords.mjs";

const roots: string[] = [];

async function check(files: Record<string, string>, includeIndex = true) {
  const contextRoot = await mkdtemp(path.join(tmpdir(), "architecture-records-"));
  roots.push(contextRoot);
  const recordFiles = Object.keys(files).filter(file => file.startsWith("docs/adr/")
    && !["docs/adr/README.md", "docs/adr/TEMPLATE.md"].includes(file));
  const fixtureFiles = { ...files };
  if (includeIndex && recordFiles.length && !Object.hasOwn(files, "docs/adr/README.md")) {
    fixtureFiles["docs/adr/README.md"] = recordFiles
      .map(file => `[Record](${path.basename(file)})`).join("\n");
  }
  for (const [filename, contents] of Object.entries(fixtureFiles)) {
    const destination = path.join(contextRoot, filename);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, contents);
  }
  return checkArchitectureRecords({ contextRoot });
}

function record(id: string, status = "accepted", decided = "2026-09-11") {
  return `---\nrecord: adr\nid: "${id}"\nstatus: ${status}\ndecided: ${decided}\n---\n\n# ${Number(id)}. A structural choice\n`;
}

function pointer(id: string, body: string) {
  return record(id, "transferred").replace("record: adr", "record: pointer") + body;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe("architectural record integrity", () => {
  test("accepts an absent ADR directory and ignores the template", async () => {
    expect(await check({})).toEqual([]);
    expect(await check({ "docs/adr/TEMPLATE.md": "id: NNNN\n" })).toEqual([]);
  });

  test("accepts canonical metadata behind a lint directive", async () => {
    expect(await check({
      "docs/adr/0002-expiring-notes.md": `<!-- eslint-disable local/no-expired-notes -->\n${record("0002")}`,
    })).toEqual([]);
  });

  test("rejects two canonical decisions with the same ID", async () => {
    const failures = await check({
      "docs/adr/0018-publication.md": record("0018"),
      "docs/adr/0018-runtime.md": record("0018"),
    });
    expect(failures.join("\n")).toContain("duplicates canonical ADR id 0018");
  });

  test("does not silently ignore a decision with a malformed filename", async () => {
    expect((await check({ "docs/adr/36-editions.md": record("0036") })).join("\n"))
      .toContain("four-digit ADR filename prefix");
  });

  test("allows a legacy pointer to share an ID without becoming another decision", async () => {
    expect(await check({
      "docs/adr/0018-publication.md": record("0018"),
      "docs/adr/0035-runtime.md": record("0035", "historical"),
      "docs/adr/0018-runtime.md": `---\nrecord: pointer\nid: "0018"\nstatus: transferred\ndecided: 2026-09-06\n---\n\n# 18. Legacy runtime path\n\n[Canonical choice](0035-runtime.md)\n`,
    })).toEqual([]);
  });

  test("rejects metadata, filename and title that identify different decisions", async () => {
    const failures = await check({
      "docs/adr/0009-credentials.md": record("0010").replace("# 10.", "# 11."),
    });
    expect(failures.join("\n")).toContain("filename prefix");
    expect(failures.join("\n")).toContain("title must identify ADR 0010");
  });

  test.each(["2026-02-31", "2026-13-01", "tomorrow"])("rejects invalid date %s", async (decided) => {
    const failures = await check({ "docs/adr/0001-toolchain.md": record("0001", "accepted", decided) });
    expect(failures.join("\n")).toContain("calendar date or explicit unknown");
  });

  test("preserves an explicitly unknown imported decision date", async () => {
    expect(await check({ "docs/adr/0017-cache.md": record("0017", "accepted", "unknown") })).toEqual([]);
  });

  test("rejects duplicate fields and a second legacy status source", async () => {
    const failures = await check({
      "docs/adr/0016-staging.md": record("0016", "superseded")
        .replace("status: superseded", "status: superseded\nstatus: accepted")
        + "\n## Status\n\nAccepted\n",
    });
    expect(failures.join("\n")).toContain("repeats metadata status");
    expect(failures.join("\n")).toContain("only in metadata");
  });

  test("rejects missing metadata and an invalid architectural status", async () => {
    expect((await check({ "docs/adr/0001-npm.md": "# 1. npm\n" })).join("\n"))
      .toContain("requires ADR metadata");
    expect((await check({ "docs/adr/0001-npm.md": record("0001", "transferred") })).join("\n"))
      .toContain("invalid architectural status transferred");
  });

  test("a pointer needs transferred status and an internal destination", async () => {
    const contents = record("0031").replace("record: adr", "record: pointer")
      + "\n[History](https://example.com/history.md)\n";
    const failures = await check({ "docs/adr/0031-moderation.md": contents });
    expect(failures.join("\n")).toContain("pointer status must be transferred");
    expect(failures.join("\n")).toContain("local Markdown destination");
  });

  test("a fenced example cannot provide a pointer destination", async () => {
    const contents = record("0031", "transferred").replace("record: adr", "record: pointer")
      + "\n```markdown\n[Example](../product/example.md)\n```\n";
    expect((await check({ "docs/adr/0031-moderation.md": contents })).join("\n"))
      .toContain("local Markdown destination");
  });

  test.each([
    "# Wrong title\n\n# 1. Expected number\n",
    "# 2. Wrong number\n\n# 1. Expected number\n",
  ])("validates the first heading rather than a later numbered heading: %s", async (headings) => {
    const contents = record("0001").replace("# 1. A structural choice\n", headings);
    expect((await check({ "docs/adr/0001-toolchain.md": contents })).join("\n"))
      .toContain("title must identify ADR 0001");
  });

  test("allows status-code sections and non-metadata Date prose", async () => {
    expect(await check({
      "docs/adr/0001-toolchain.md": record("0001") + "\n## Status codes\n\nDate: supplied by the caller.\n",
    })).toEqual([]);
  });

  test("accepts a primary heading with a code-formatted title", async () => {
    expect(await check({
      "docs/adr/0001-toolchain.md": record("0001").replace("A structural choice", "`npm`"),
    })).toEqual([]);
  });

  test("rejects the legacy decision date and amendment declaration", async () => {
    expect((await check({
      "docs/adr/0001-toolchain.md": record("0001") + "\nDate: 2026-09-11. Amended: 2026-09-18.\n",
    })).join("\n")).toContain("only in metadata");
  });

  test.each([
    "<!-- [Canonical](../product/contract.md) -->",
    "`[Canonical](../product/contract.md)`",
    "~~~markdown\n[Canonical](../product/contract.md)\n~~~",
    "    [Canonical](../product/contract.md)",
    "\t[Canonical](../product/contract.md)",
    "Canonical](../product/contract.md)",
    "\\[Canonical](../product/contract.md)",
    "[contract]: ../product/contract.md",
    "![Canonical](../product/contract.md)",
  ])("rejects non-navigable pointer destinations: %s", async (body) => {
    expect((await check({ "docs/adr/0031-moderation.md": pointer("0031", body) })).join("\n"))
      .toContain("local Markdown destination");
  });

  test.each([
    "- Contract\n    - [Canonical](../product/contract.md)",
    "[Canonical][contract]\n\n[contract]: ../product/contract.md",
    "[contract][]\n\n[contract]: <../product/contract.md>",
    "[contract]\n\n[contract]: ../product/contract.md",
  ])("accepts navigable reference-style pointer links: %s", async (body) => {
    expect(await check({ "docs/adr/0031-moderation.md": pointer("0031", body) })).toEqual([]);
  });

  test("rejects a relocation pointer whose only destination is itself", async () => {
    expect((await check({
      "docs/adr/0031-moderation.md": pointer("0031", "[Canonical](./0031-moderation.md#rules)"),
    })).join("\n")).toContain("other than itself");
  });

  test("rejects an existing destination outside the checkout, including a sibling with the same prefix", async () => {
    const fixtureRoot = await mkdtemp(path.join(tmpdir(), "architecture-destination-"));
    roots.push(fixtureRoot);
    const contextRoot = path.join(fixtureRoot, "repo");
    const directory = path.join(contextRoot, "docs", "adr");
    const sibling = path.join(fixtureRoot, "repo-sibling");
    await mkdir(directory, { recursive: true });
    await mkdir(sibling);
    await writeFile(path.join(sibling, "contract.md"), "# External contract\n");
    await writeFile(path.join(directory, "README.md"), "[Record](0031-moderation.md)\n");
    await writeFile(path.join(directory, "0031-moderation.md"),
      pointer("0031", "[Canonical](../../../repo-sibling/contract.md)"));

    const failures = await checkArchitectureRecords({ contextRoot });
    expect(failures.join("\n")).toContain("destination must stay inside the repository");
    expect(failures.join("\n")).toContain("local Markdown destination");
  });

  test("rejects pointer cycles but accepts a chain reaching a contract", async () => {
    const files = {
      "docs/adr/0031-first.md": pointer("0031", "[Next](0032-second.md)"),
      "docs/adr/0032-second.md": pointer("0032", "[Next](0031-first.md)"),
    };
    expect((await check(files)).filter(failure => failure.includes("non-pointer destination")))
      .toHaveLength(2);
    expect(await check({
      ...files,
      "docs/adr/0032-second.md": pointer("0032", "[Contract](../product/contract.md)"),
    })).toEqual([]);
  });

  test("requires the discovery index when records exist", async () => {
    expect((await check({ "docs/adr/0001-toolchain.md": record("0001") }, false)).join("\n"))
      .toContain("README.md is required");
  });

  test("reports a record omitted from the index and an indexed stale path", async () => {
    const failures = await check({
      "docs/adr/0001-toolchain.md": record("0001"),
      "docs/adr/README.md": "[Missing](0002-retired.md)\n",
    });
    expect(failures.join("\n")).toContain("must link to 0001-toolchain.md");
    expect(failures.join("\n")).toContain("stale record 0002-retired.md");
  });
});
