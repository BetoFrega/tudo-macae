// @vitest-environment node
import { describe } from "vitest";
import { registerAccountAndBusinessTests } from "./demoSeedBusinessTests";
import { registerAdTests } from "./demoSeedAdTests";
import { registerCategoryTests } from "./demoSeedCategoryTests";
import { registerDemoSeedFixture } from "./demoSeedFixture";
import { registerImageTests } from "./demoSeedImageTests";

/**
 * One file on purpose: the seed owns fixed `demo-` IDs in the shared emulator and
 * the groups below depend on this order (the image groups mutate what the
 * earlier ones read). Splitting into separate test files would let vitest run
 * them in parallel and make each file's cleanup delete the other's data.
 */
registerDemoSeedFixture();

describe("seedDemoData", () => {
  registerCategoryTests();
  registerAccountAndBusinessTests();
  registerAdTests();
  registerImageTests();
});
