import { expect, test, vi } from "vitest";

vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("@/features/categories/actions/getCategories", () => ({
  getCategories: async () => [
    { id: "jobs", name: "Empregos", slug: "empregos", isActive: true, privateField: "hidden" },
    { id: "inactive", name: "Inativa", slug: "inativa", isActive: false },
  ],
}));

import { GET } from "./route";

test("public navigation exposes only active link fields", async () => {
  const response = await GET();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    categories: [{ id: "jobs", name: "Empregos", slug: "empregos", isActive: true }],
    sections: [],
  });
});
