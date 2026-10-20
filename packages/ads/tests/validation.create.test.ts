import { describe, expect, it } from "vitest";
import {
  adStatusSchema,
  adTitleSchema,
  createAdSchema,
  updateAdSchema,
} from "@tudomacae/ads/validation";
import { accept, omit, reject, validCreateInput, validUpdateInput } from "./validationFixtures";

/**
 * `adRecordSchema` is deliberately absent from this file. Nothing imports it,
 * and it does not even describe the record `adDb.create` writes — `slug` and
 * `images` are missing from it. So its 13 mutants sit inside dead code, which
 * `.claude/skills/kill-mutants/SKILL.md` says to leave rather than cover:
 * tests there would move the score without protecting anything a caller can
 * observe. Finding F10 in the Notion Achados database carries the decision it is waiting for —
 * delete it, or derive the schemas below from it as the sibling features do,
 * which would keep this compatibility entry point aligned with the package.
 */

describe("adStatusSchema", () => {
  it("accepts the two statuses an ad can be in", () => {
    expect(accept(adStatusSchema, "paused")).toBe("paused");
    expect(accept(adStatusSchema, "active")).toBe("active");
  });

  it("rejects a status outside that set", () => {
    expect(reject(adStatusSchema, "sold")).toEqual([
      { path: [], code: "invalid_value" },
    ]);
    expect(reject(adStatusSchema, "")).toEqual([
      { path: [], code: "invalid_value" },
    ]);
  });
});

describe("adTitleSchema", () => {
  it("requires at least one character", () => {
    expect(reject(adTitleSchema, "")).toEqual([
      { path: [], code: "too_small" },
    ]);
    expect(accept(adTitleSchema, "a")).toBe("a");
  });

  it("allows 140 characters and no more", () => {
    const atLimit = "a".repeat(140);
    expect(accept(adTitleSchema, atLimit)).toBe(atLimit);
    expect(reject(adTitleSchema, "a".repeat(141))).toEqual([
      { path: [], code: "too_big" },
    ]);
  });
});

describe("createAdSchema", () => {
  it("accepts a valid input unchanged", () => {
    expect(accept(createAdSchema, validCreateInput)).toEqual(validCreateInput);
  });

  it("requires every identifying field to be non-empty", () => {
    for (const field of [
      "categoryId",
      "subcategoryId",
      "advertiserProfileId",
    ]) {
      expect(
        reject(createAdSchema, { ...validCreateInput, [field]: "" }),
      ).toEqual([{ path: [field], code: "too_small" }]);
    }
  });

  it("reports a missing field as a missing field, not as an empty one", () => {
    expect(reject(createAdSchema, omit(validCreateInput, "categoryId"))).toEqual([
      { path: ["categoryId"], code: "invalid_type" },
    ]);
  });

  it("carries the title length rule, reported against the title", () => {
    expect(
      reject(createAdSchema, { ...validCreateInput, title: "a".repeat(141) }),
    ).toEqual([{ path: ["title"], code: "too_big" }]);
    expect(
      accept(createAdSchema, { ...validCreateInput, title: "a".repeat(140) })
        .title,
    ).toHaveLength(140);
  });

  it("does not accept userId or status from the caller", () => {
    const parsed = accept(createAdSchema, {
      ...validCreateInput,
      userId: "user-1",
      status: "active",
    });
    expect(parsed).toEqual(validCreateInput);
  });
});

/**
 * Creation and update retain these aliases while the package owns their text
 * contract; its public-boundary test covers all four length edges.
 */
describe.each([
  {
    name: "createAdSchema",
    schema: createAdSchema,
    withText: (text: string) => ({ ...validCreateInput, text }),
  },
  {
    name: "updateAdSchema",
    schema: updateAdSchema,
    withText: (text: string) => ({ ...validUpdateInput, text }),
  },
])("$name text length", ({ schema, withText }) => {
  it("requires at least 10 characters", () => {
    expect(reject(schema, withText("a".repeat(9)))).toEqual([
      { path: ["text"], code: "too_small" },
    ]);
    expect(accept(schema, withText("a".repeat(10))).text).toHaveLength(10);
  });

  it("allows 1000 characters and no more", () => {
    expect(accept(schema, withText("a".repeat(1000))).text).toHaveLength(1000);
    expect(reject(schema, withText("a".repeat(1001)))).toEqual([
      { path: ["text"], code: "too_big" },
    ]);
  });
});
