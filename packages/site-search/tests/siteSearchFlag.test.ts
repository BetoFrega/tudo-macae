import { describe, expect, test, vi } from "vitest";
import {
  createSiteSearchFlag,
  siteSearchDistinctId,
  siteSearchPublicDistinctId,
} from "../flag";

function cookie(value: unknown) {
  return encodeURIComponent(JSON.stringify(value));
}

describe("site search audience", () => {
  test("reads the value Next already decoded, even when a field holds escapes", () => {
    expect(siteSearchDistinctId(JSON.stringify({
      distinct_id: "account-uid-1",
      $user_state: "identified",
      $initial_person_info: { u: "https://www.tudomacae.com.br/?utm=%22x%22" },
    }))).toBe("account-uid-1");
  });

  test("evaluates an identified PostHog person by their distinct id", () => {
    expect(siteSearchDistinctId(cookie({ distinct_id: "account-uid-1", $user_state: "identified" })))
      .toBe("account-uid-1");
  });

  test.each([
    ["no cookie", undefined],
    ["an anonymous visitor", cookie({ distinct_id: "0190-anon", $user_state: "anonymous" })],
    ["a malformed cookie", "%E0%A4%A"],
    ["a non-object cookie", cookie("text")],
    ["an oversized id", cookie({ distinct_id: "x".repeat(300), $user_state: "identified" })],
  ])("shares one public decision for %s", (_label, value) => {
    expect(siteSearchDistinctId(value)).toBe(siteSearchPublicDistinctId);
  });
});

describe("site search flag", () => {
  test("enables only after an explicit true decision", async () => {
    const evaluate = vi.fn().mockResolvedValue(true);
    const flag = createSiteSearchFlag({ evaluate, now: () => 0 });

    await expect(flag.enabled("maintainer")).resolves.toBe(true);
    expect(evaluate).toHaveBeenCalledWith("maintainer");
  });

  test.each([
    ["disabled", false],
    ["absent", undefined],
    ["malformed", "true"],
  ])("keeps the established experience when the decision is %s", async (_label, decision) => {
    const flag = createSiteSearchFlag({ evaluate: async () => decision, now: () => 0 });

    await expect(flag.enabled("maintainer")).resolves.toBe(false);
  });

  test("keeps the established experience and reports once when evaluation fails", async () => {
    const record = vi.fn();
    const evaluate = vi.fn().mockRejectedValue(new Error("offline with private detail"));
    const flag = createSiteSearchFlag({ evaluate, now: () => 0, record });

    await expect(flag.enabled("maintainer")).resolves.toBe(false);
    await expect(flag.enabled("maintainer")).resolves.toBe(false);
    expect(evaluate).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledExactlyOnceWith({ enabled: false, failure: "evaluation" });
  });

  test("reuses a decision per audience for a bounded time", async () => {
    let clock = 0;
    const evaluate = vi.fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false);
    const flag = createSiteSearchFlag({ evaluate, now: () => clock });

    await expect(flag.enabled("maintainer")).resolves.toBe(true);
    await expect(flag.enabled("visitor")).resolves.toBe(false);
    clock = 29_999;
    await expect(flag.enabled("maintainer")).resolves.toBe(true);
    clock = 30_000;
    await expect(flag.enabled("maintainer")).resolves.toBe(false);
    expect(evaluate).toHaveBeenCalledTimes(3);
  });

  test("shares one evaluation among concurrent requests for the same audience", async () => {
    let resolve: (value: unknown) => void = () => {};
    const evaluate = vi.fn(() => new Promise(done => (resolve = done)));
    const flag = createSiteSearchFlag({ evaluate, now: () => 0 });

    const decisions = Promise.all([flag.enabled("site-search-public"), flag.enabled("site-search-public")]);
    resolve(true);
    await expect(decisions).resolves.toEqual([true, true]);
    expect(evaluate).toHaveBeenCalledOnce();
  });

  test("bounds the number of remembered audiences", async () => {
    const evaluate = vi.fn().mockResolvedValue(true);
    const flag = createSiteSearchFlag({ evaluate, now: () => 0 });

    for (let index = 0; index <= 500; index += 1) await flag.enabled(`person-${index}`);
    await flag.enabled("person-0");
    expect(evaluate).toHaveBeenCalledTimes(502);
  });
});
