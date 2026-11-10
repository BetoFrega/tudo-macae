import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "vitest";

// These tests run real processes, which the Workers runtime (quality-flare's Tests check) lacks.
const inWorkers = globalThis.navigator?.userAgent === "Cloudflare-Workers";

test.skipIf(inWorkers)("shares a session only inside each real React server render", () => {
  const moduleUrl = pathToFileURL(resolve(process.cwd(), "src/integrations/authentication/renderSessionReader.ts")).href;
  const script = `
    import React, { cache } from "react";
    import { renderToPipeableStream } from "next/dist/compiled/react-server-dom-webpack/server.node.js";
    import { PassThrough } from "node:stream";
    import { AsyncLocalStorage } from "node:async_hooks";
    import assert from "node:assert/strict";
    import { createRenderSessionReader } from ${JSON.stringify(moduleUrl)};

    const context = new AsyncLocalStorage();
    const calls = new Map();
    const reader = createRenderSessionReader({
      cache,
      resolve: async () => {
        const { name, user } = context.getStore();
        calls.set(name, (calls.get(name) ?? 0) + 1);
        if (name === "failure") throw new Error("session authority unavailable");
        return user;
      },
    });
    async function Consumer() {
      const first = await reader();
      const [second, third] = await Promise.all([reader(), reader()]);
      const fourth = await reader();
      const describe = (user) => user ? user.uid + ":" + user.role : "anonymous";
      return React.createElement("p", null, [first, second, third, fourth].map(describe).join("|"));
    }
    async function FailureConsumer() {
      const results = await Promise.allSettled([reader(), reader()]);
      const summary = results.map((result) => result.status === "rejected" ? result.reason.message : "resolved").join(":");
      return React.createElement("p", null, summary);
    }
    async function EmptyConsumer() {
      return React.createElement("p", null, "empty");
    }
    async function render(name, user = { uid: name, role: "editor" }, Component = Consumer) {
      const output = new PassThrough();
      let body = "";
      output.on("data", (chunk) => body += chunk);
      const ended = new Promise((resolve, reject) => { output.on("end", resolve); output.on("error", reject); });
      await context.run({ name, user }, async () => renderToPipeableStream(React.createElement(Component), {}).pipe(output));
      await ended;
      return body;
    }
    const [oneOutput, twoOutput] = await Promise.all([
      render("one", { uid: "one-user", role: "editor" }),
      render("two", { uid: "two-user", role: "admin" }),
    ]);
    assert.equal(calls.get("one"), 1);
    assert.equal(calls.get("two"), 1);
    assert.match(oneOutput, /one-user:editor\|one-user:editor\|one-user:editor\|one-user:editor/);
    assert.match(twoOutput, /two-user:admin\|two-user:admin\|two-user:admin\|two-user:admin/);
    const updatedOutput = await render("one", { uid: "one-user-updated", role: "admin" });
    assert.equal(calls.get("one"), 2);
    assert.match(updatedOutput, /one-user-updated:admin/);
    const anonymousOutput = await render("anonymous", null);
    assert.equal(calls.get("anonymous"), 1);
    assert.match(anonymousOutput, /anonymous\|anonymous\|anonymous\|anonymous/);
    const failureOutput = await render("failure", { uid: "failure", role: "editor" }, FailureConsumer);
    assert.equal(calls.get("failure"), 1);
    assert.match(failureOutput, /session authority unavailable:session authority unavailable/);
    const noConsumerOutput = await render("no-consumer", { uid: "unused", role: "editor" }, EmptyConsumer);
    assert.match(noConsumerOutput, /empty/);
    assert.equal(calls.has("no-consumer"), false);
    const outsideFirst = await context.run({ name: "outside", user: { uid: "outside-first", role: "editor" } }, () => reader());
    const outsideSecond = await context.run({ name: "outside", user: { uid: "outside-second", role: "admin" } }, () => reader());
    assert.equal(outsideFirst.uid, "outside-first");
    assert.equal(outsideSecond.uid, "outside-second");
    assert.equal(calls.get("outside"), 2);
    console.log("render-session-sharing-ok");
  `;
  const result = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "--input-type=module", "-e", script], {
    cwd: process.cwd(), encoding: "utf8", timeout: 15_000,
  });
  expect(result.status, result.stderr || result.stdout).toBe(0);
  expect(result.stdout).toContain("render-session-sharing-ok");
});
