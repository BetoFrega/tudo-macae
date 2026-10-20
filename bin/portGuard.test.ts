// @vitest-environment node
import { describe, test, expect } from "vitest";
import {
  conflictReport,
  findPortConflicts,
  parseListenerPid,
  parseWorkingDirectory,
} from "./portGuard.ts";

describe("findPortConflicts", () => {
  test("says nothing when the whole block is free", async () => {
    expect(await findPortConflicts([1, 2, 3], async () => null)).toEqual([]);
  });

  test("reports every occupied port, in the order the block declares them", async () => {
    const owners = new Map([
      [2, { pid: 42, cwd: "/elsewhere" }],
      [3, { pid: 7, cwd: null }],
    ]);

    expect(await findPortConflicts([1, 2, 3], async port => owners.get(port) ?? null))
      .toEqual([
        { port: 2, owner: { pid: 42, cwd: "/elsewhere" } },
        { port: 3, owner: { pid: 7, cwd: null } },
      ]);
  });
});

describe("conflictReport", () => {
  test("names the directory the offending process is running in — the whole point of failing here", () => {
    const report = conflictReport(
      [{ port: 24_976, owner: { pid: 42, cwd: "/Users/dev/other-worktree" } }],
      "/Users/dev/this-worktree",
    );

    expect(report).toContain("24976");
    expect(report).toContain("/Users/dev/other-worktree");
    expect(report).toContain("42");
  });

  test("says so plainly when the owner cannot be identified, instead of printing nothing", () => {
    const report = conflictReport(
      [{ port: 24_976, owner: { pid: null, cwd: null } }],
      "/Users/dev/this-worktree",
    );

    expect(report).toContain("24976");
    expect(report.toLowerCase()).toContain("could not");
  });

  test("names this worktree, so a reader knows whose block was refused", () => {
    const report = conflictReport(
      [{ port: 1, owner: { pid: null, cwd: null } }],
      "/Users/dev/this-worktree",
    );

    expect(report).toContain("/Users/dev/this-worktree");
  });
});

describe("parseListenerPid", () => {
  test("takes the first listener when lsof reports several", () => {
    expect(parseListenerPid("4321\n4322\n")).toBe(4321);
  });

  test("is null when nothing is listening", () => {
    expect(parseListenerPid("")).toBe(null);
    expect(parseListenerPid("\n")).toBe(null);
  });
});

describe("parseWorkingDirectory", () => {
  test("reads the cwd out of lsof's field output", () => {
    expect(parseWorkingDirectory("p4321\nfcwd\nn/Users/dev/other-worktree\n"))
      .toBe("/Users/dev/other-worktree");
  });

  test("is null when lsof answered without a name field", () => {
    expect(parseWorkingDirectory("p4321\nfcwd\n")).toBe(null);
  });
});
