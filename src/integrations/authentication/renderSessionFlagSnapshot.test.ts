import { cache } from "react";
import { expect, test, vi } from "vitest";
import { createRenderFlagSnapshot, createRenderSessionReader } from "./renderSessionReader";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushBackgroundWork() {
  await Promise.resolve();
  await Promise.resolve();
}

test("session reads stay nonblocking while one flag refresh updates and expires the snapshot", async () => {
  let time = 0;
  const firstRefresh = deferred<boolean>();
  const secondRefresh = deferred<boolean>();
  const evaluate = vi.fn()
    .mockReturnValueOnce(firstRefresh.promise)
    .mockReturnValueOnce(secondRefresh.promise);
  const snapshot = createRenderFlagSnapshot({ evaluate, refreshIntervalMs: 60_000, now: () => time });
  let cookieUser = "first-cookie";
  const resolve = vi.fn(async () => ({ uid: cookieUser }));
  const readUser = createRenderSessionReader({
    cache,
    resolve,
    sharingEnabled: () => snapshot.read(),
  });

  expect(await readUser()).toEqual({ uid: "first-cookie" });
  expect(await readUser()).toEqual({ uid: "first-cookie" });
  expect(snapshot.read()).toBe(false);
  await flushBackgroundWork();
  expect(evaluate).toHaveBeenCalledOnce();
  expect(resolve).toHaveBeenCalledTimes(2);

  firstRefresh.resolve(true);
  await flushBackgroundWork();
  expect(snapshot.read()).toBe(true);
  cookieUser = "updated-cookie";

  time = 60_000;
  const latestUser = await readUser();
  expect(latestUser).toEqual({ uid: "updated-cookie" });
  expect(snapshot.read()).toBe(false);
  expect(await readUser()).toEqual({ uid: "updated-cookie" });
  await flushBackgroundWork();
  expect(evaluate).toHaveBeenCalledTimes(2);
  secondRefresh.resolve(false);
  await flushBackgroundWork();
  expect(snapshot.read()).toBe(false);
});

test("failed flag refresh stays closed, backs off, and reports once per outage", async () => {
  let time = 0;
  const failedRefresh = deferred<boolean>();
  const retryRefresh = deferred<boolean>();
  const recoveredRefresh = deferred<boolean>();
  const postRecoveryFailure = deferred<boolean>();
  const evaluate = vi.fn()
    .mockReturnValueOnce(failedRefresh.promise)
    .mockReturnValueOnce(retryRefresh.promise)
    .mockReturnValueOnce(recoveredRefresh.promise)
    .mockReturnValueOnce(postRecoveryFailure.promise);
  const onFailure = vi.fn();
  const snapshot = createRenderFlagSnapshot({ evaluate, refreshIntervalMs: 60_000, now: () => time, onFailure });
  const resolve = vi.fn(async () => null);
  const readUser = createRenderSessionReader({ cache, resolve, sharingEnabled: () => snapshot.read() });

  expect(snapshot.read()).toBe(false);
  expect(await readUser()).toBeNull();
  await flushBackgroundWork();
  expect(evaluate).toHaveBeenCalledOnce();
  failedRefresh.reject(new Error("provider unavailable"));
  await flushBackgroundWork();
  expect(snapshot.read()).toBe(false);
  expect(onFailure).toHaveBeenCalledOnce();

  time = 59_999;
  expect(snapshot.read()).toBe(false);
  expect(evaluate).toHaveBeenCalledOnce();
  time = 60_000;
  expect(await readUser()).toBeNull();
  expect(snapshot.read()).toBe(false);
  await flushBackgroundWork();
  expect(evaluate).toHaveBeenCalledTimes(2);
  retryRefresh.reject(new Error("provider still unavailable"));
  await flushBackgroundWork();
  expect(onFailure).toHaveBeenCalledOnce();

  time = 120_000;
  expect(snapshot.read()).toBe(false);
  await flushBackgroundWork();
  expect(evaluate).toHaveBeenCalledTimes(3);
  recoveredRefresh.resolve(true);
  await flushBackgroundWork();
  expect(snapshot.read()).toBe(true);

  time = 180_000;
  expect(snapshot.read()).toBe(false);
  expect(await readUser()).toBeNull();
  await flushBackgroundWork();
  expect(evaluate).toHaveBeenCalledTimes(4);
  postRecoveryFailure.reject(new Error("new outage"));
  await flushBackgroundWork();
  expect(onFailure).toHaveBeenCalledTimes(2);
});
