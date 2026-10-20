// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PROVIDER_SCRIPTS,
  REMOVED_SCRIPTS,
  SCRIPT_MENU,
  expectedScriptNames,
  renderScriptMenu,
} from "./scripts-help.mjs";

const rendered = renderScriptMenu();
const packageScripts = JSON.parse(
  readFileSync("package.json", "utf8"),
).scripts as Record<string, string>;

describe("renderScriptMenu", () => {
  it("routes agent mutation to the focal recipe and labels full runs explicitly", () => {
    expect(rendered).toContain(".agents/skills/kill-mutants/SKILL.md");
    expect(rendered).toContain("Mutação focal de agentes");
    expect(SCRIPT_MENU.find(entry => entry.script === "test:mutation")?.purpose)
      .toContain("somente pedido explícito");
  });

  it("offers every script in the menu, so `npm run help` can be the only menu", () => {
    for (const { script, purpose } of SCRIPT_MENU) {
      expect(rendered).toContain(`npm run ${script}`);
      expect(rendered).toContain(purpose);
    }
  });

  it("names the provider contract, which the reader must not invoke by hand", () => {
    for (const script of PROVIDER_SCRIPTS) expect(rendered).toContain(script);
    expect(rendered).toContain("build:check");
  });

  it("offers no script it also calls removed — the abort message reads as advice", () => {
    for (const script of REMOVED_SCRIPTS) {
      expect(rendered).not.toContain(`npm run ${script}`);
    }
  });
});

describe("expectedScriptNames", () => {
  it("is the menu plus the contract, which is what check:harness compares against", () => {
    expect(expectedScriptNames()).toEqual(
      expect.arrayContaining([...SCRIPT_MENU.map(entry => entry.script), ...PROVIDER_SCRIPTS]),
    );
  });

  it("names nothing twice, or the bijection check would pass on a duplicate", () => {
    const names = expectedScriptNames();

    expect(new Set(names).size).toBe(names.length);
  });
});

describe("development scripts", () => {
  it("runs the full development stack with demo images enabled", () => {
    expect(packageScripts["dev:full"]).toBe(
      "DEMO_SEED_IMAGES=1 npm run dev",
    );
  });
});
