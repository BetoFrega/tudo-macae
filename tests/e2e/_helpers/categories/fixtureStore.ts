import { createClassifiedsClient } from "@tudomacae/classifieds-client/client";
import type { Category } from "@tudomacae/categories/model";
import { workerFixture } from "../../../_helpers/auth/helpers/workerFixture";
export async function fixtureCategoryCatalog() {
  await workerFixture("/find", {});
  return createClassifiedsClient({ origin: process.env.AUTHENTICATION_API_URL!, publicOrigin: process.env.PUBLIC_APP_ORIGIN!, allowLocal: true }).read<Category[]>("categories.catalog", null);
}
export async function deleteCategoryFixture(input: { id: string }) {
  await workerFixture("/delete-category", input);
}
