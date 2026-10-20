import { afterEach } from "vitest";
import { setTestEnvVars } from "./bin/setTestEnvVars";

setTestEnvVars();

if (typeof document !== "undefined") {
  await import("@testing-library/jest-dom/vitest");
  // Files in the shared unit project load Testing Library once, so its own
  // cleanup would only unmount the first file's renders.
  const { cleanup } = await import("@testing-library/react");
  afterEach(() => cleanup());
}
