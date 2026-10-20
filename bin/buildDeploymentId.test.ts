// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { buildDeploymentId } from "./buildDeploymentId";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { force: true, recursive: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "deployment-id-"));
  roots.push(root);
  await mkdir(join(root, "src"));
  await writeFile(join(root, "src", "action.ts"), "export async function action() {}\n");
  return root;
}

describe("buildDeploymentId", () => {
  test("is stable for the same build inputs and changes with source", async () => {
    const root = await fixture();
    const first = buildDeploymentId(root, {});

    expect(first).toMatch(/^source-[a-f0-9]{32}$/u);
    expect(buildDeploymentId(root, {})).toBe(first);

    await writeFile(join(root, "src", "action.ts"), "export async function changed() {}\n");
    expect(buildDeploymentId(root, {})).not.toBe(first);
  });

  test("includes public build environment without exposing its value", async () => {
    const root = await fixture();
    const first = buildDeploymentId(root, { NEXT_PUBLIC_APP_ENV: "first" });
    const second = buildDeploymentId(root, { NEXT_PUBLIC_APP_ENV: "second" });

    expect(second).not.toBe(first);
    expect(first).not.toContain("first");
  });

  test("preserves an explicit Next.js deployment identity", async () => {
    const root = await fixture();
    expect(buildDeploymentId(root, { NEXT_DEPLOYMENT_ID: "explicit-deployment" }))
      .toBe("explicit-deployment");
    expect(() => buildDeploymentId(root, { NEXT_DEPLOYMENT_ID: "bad identity" }))
      .toThrow("deployment identity");
  });
});
