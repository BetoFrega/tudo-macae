// `pnpm run build` sozinho não passa: o `RootLayout` renderiza `<Header />`, que
// chama `getCategories()` no API Worker. Sem API Worker o build morre em
// "Classifieds authority configuration missing".
//
// Este script permite build local e no gate de entrega: aplica o mesmo
// `setTestEnvVars` que o Playwright e o Vitest usam, sobe o fixture do API
// Worker com o catálogo vazio, e só então constrói. A diferença deliberada para o build de e2e é
// `NEXT_PUBLIC_APP_ENV`, que só aquele define — é ele que libera imagem em
// localhost. Não unifique os dois por isso.
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CANONICAL_APP_ORIGIN } from "./appOrigin.ts";
import { setTestEnvVars } from "./setTestEnvVars.ts";

setTestEnvVars();

const temporaryDirectory = await mkdtemp(join(tmpdir(), "build-check-"));
let fixture;
try {
  const { startAuthenticationFixture } = await import("../apps/api-worker/testing.mjs");
  fixture = await startAuthenticationFixture({
    publicOrigin: CANONICAL_APP_ORIGIN,
    classifiedsQualification: true,
    configurationFile: join(temporaryDirectory, "authentication-runtime.json"),
  });
}
catch (error) {
  console.error("Falha ambiental: o fixture do API Worker não iniciou.", error);
  await rm(temporaryDirectory, { recursive: true, force: true });
  process.exit(1);
}

async function exit(code) {
  await fixture.close();
  await rm(temporaryDirectory, { recursive: true, force: true });
  process.exit(code);
}

const child = spawn("pnpm", ["exec", "next", "build"], {
  stdio: "inherit",
  env: { ...process.env, ...fixture.env, PUBLIC_APP_ORIGIN: CANONICAL_APP_ORIGIN },
});
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("error", (error) => {
  console.error(error);
  void exit(1);
});
child.on("exit", code => void exit(code ?? 1));
