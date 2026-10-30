// Fonte única do "qual script para quê": `pnpm run help` e o `check:harness`
// leem daqui. Importar não imprime nada — só a invocação
// direta imprime.
import { realpathSync } from "node:fs";

/** O que uma pessoa ou um agente roda. Um script por propósito, sem sinônimo. */
export const SCRIPT_MENU = [
  { script: "dev", purpose: "Ver o app com hot reload e o Worker de API de pé" },
  {
    script: "dev:full",
    purpose: "Ver o app com a massa completa no Worker, incluindo imagens",
  },
  { script: "test", purpose: "Unitário e integração — sobe o fixture do Worker de API" },
  { script: "test:unit", purpose: "Unitário hermético" },
  {
    script: "test:integration",
    purpose: "Integração — sobe o fixture do Worker de API",
  },
  {
    script: "test:harness",
    purpose:
      "Harness Playwright — controles sintéticos e fixture com aplicação",
  },
  { script: "test:e2e", purpose: "Ponta a ponta — sobe o stack sozinho" },
  {
    script: "test:e2e:diagnostic",
    purpose: "Ponta a ponta sem limite de falhas — diagnóstico explícito",
  },
  {
    script: "test:e2e:full",
    purpose:
      "Aplicação e harness Playwright com uma única inicialização do stack",
  },
  {
    script: "test:e2e:full:diagnostic",
    purpose: "Aplicação e harness sem limite de falhas — diagnóstico explícito",
  },
  {
    script: "typecheck",
    purpose: "Validar tipos e rotas sem build ou servidor",
  },
  { script: "lint", purpose: "Lint" },
  {
    script: "lint:diagnostic",
    purpose: "Diagnosticar ESLint em JSON compacto, sem incorporar fontes",
  },
  {
    script: "lint:boundaries",
    purpose: "Checar interfaces dos packages e isolamento do domínio",
  },
  { script: "build:check", purpose: "O app constrói?" },
  {
    script: "test:mutation",
    purpose: "Mutação unitária completa — somente pedido explícito",
  },
  {
    script: "test:mutation:pure",
    purpose: "Mutação opt-in node — escopo conforme skill kill-mutants",
  },
  {
    script: "test:mutation:component",
    purpose: "Mutação opt-in jsdom — escopo conforme skill kill-mutants",
  },
  {
    script: "test:mutation:integration",
    purpose:
      "Mutação opt-in da integração — escopo conforme skill kill-mutants",
  },
  { script: "probe:edge", purpose: "Medir a borda" },
  {
    script: "probe:image-canary",
    purpose: "Verificar o canário público de imagens",
  },
  {
    script: "probe:image-revocation",
    purpose:
      "Aquecer e verificar a revogação de uma imagem pública descartável",
  },
  { script: "test:worker", purpose: "Executar os testes dos Workers" },
  { script: "typecheck:worker", purpose: "Checar os tipos dos Workers" },
  { script: "check:harness", purpose: "Checar o harness" },
  {
    script: "product:sync",
    purpose: "Gerar o PRODUCT.md do Impeccable a partir do Notion (NOTION_TOKEN)",
  },
  { script: "help", purpose: "Imprimir este cardápio" },
];

/** The build and start contract the delivery pipelines invoke. */
export const PROVIDER_SCRIPTS = ["build", "start"];

/** Lifecycle de instalação: `prepare` instala os hooks do husky depois de `pnpm install`. */
export const LIFECYCLE_SCRIPTS = ["prepare"];

/** `check:harness` reprova qualquer arquivo versionado que cite um destes. */
export const REMOVED_SCRIPTS = [
  "e2e:server",
  "build:local",
  "next:dev",
  "build:test",
  "start:test",
  "app:serve",
  "test:e2e:ui",
];

/** Toda chave que `package.json.scripts` pode ter. */
export function expectedScriptNames() {
  return [
    ...SCRIPT_MENU.map(entry => entry.script),
    ...PROVIDER_SCRIPTS,
    ...LIFECYCLE_SCRIPTS,
  ];
}

export function renderScriptMenu() {
  const width = Math.max(...SCRIPT_MENU.map(entry => entry.script.length));
  const rows = SCRIPT_MENU.map(
    entry => `  pnpm run ${entry.script.padEnd(width)}  ${entry.purpose}`,
  );

  return [
    "Cardápio de scripts:",
    "",
    ...rows,
    "",
    "Mutação focal de agentes: .agents/skills/kill-mutants/SKILL.md.",
    "",
    `Contrato de build e execução: ${PROVIDER_SCRIPTS.join(", ")}.`,
    "Não rode nenhum deles à mão — `pnpm run build:check` é o build local.",
  ].join("\n");
}

function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === import.meta.filename;
  }
  catch {
    return false;
  }
}

if (invokedDirectly()) console.log(renderScriptMenu());
