import { globSync, readFileSync } from "node:fs";
import { defineConfig, mergeConfig } from "vitest/config";
import ordinary from "./vitest.config.mts";

const unit = mergeConfig(ordinary, {
  test: { exclude: ["**/*.integration.test.{ts,tsx}"] },
});

// Sharing one module graph between files (`isolate: false`) cuts the suite's
// time and CPU by about a third, but only files that leave no state behind can
// share it. A file that mocks modules or touches the environment or globals
// keeps a fresh one, and so does a file that writes to a browser global or a
// prototype.
const keepsState = new RegExp([
  /vi\.(mock|doMock|stubEnv|stubGlobal|resetModules)|process\.env/.source,
  /\b(globalThis|global|window|document|navigator)\.[\w.]+\s*=[^=]/.source,
  /\.prototype\.\w+\s*=[^=]/.source,
  /Object\.(defineProperty|assign)\(\s*(globalThis|global|window|document|navigator|\w+\.prototype)\b/.source,
].join("|"));
// Paths become include globs, and Next.js route folders such as `[id]` would
// otherwise read as character classes.
const literal = (file: string) => file.replace(/[\\[\]{}()*?!+@]/g, "\\$&");
const stateful = globSync(unit.test.include, { exclude: unit.test.exclude })
  .filter((file) => keepsState.test(readFileSync(file, "utf8")))
  .map(literal);

export default defineConfig({
  test: {
    // Process and signal suites have short protocol timeouts. Unbounded file
    // parallelism can starve their child processes and fabricate failures.
    maxWorkers: 4,
    projects: [
      { ...unit, test: { ...unit.test, name: "isolated", include: stateful } },
      {
        ...unit,
        test: {
          ...unit.test,
          name: "shared",
          isolate: false,
          exclude: [...unit.test.exclude, ...stateful],
        },
      },
    ],
  },
});
