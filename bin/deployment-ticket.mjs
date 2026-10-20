import { execFileSync } from "node:child_process";
const repository = process.env.GITHUB_REPOSITORY;
if (repository !== "BetoFrega/tudo-macae") throw new Error("Unexpected repository.");
const api = (path, args = []) => JSON.parse(execFileSync("gh", ["api", `repos/${repository}/${path}`, ...args], { encoding: "utf8" }));
const marker = "<!-- production-delivery-blocked -->";
const pages = JSON.parse(execFileSync("gh", ["api", "--paginate", "--slurp", `repos/${repository}/issues?state=open&per_page=100`], { encoding: "utf8" }));
const issue = pages.flat().find(item => !item.pull_request && item.user?.login === "github-actions[bot]" && item.body?.includes(marker));
const success = process.env.CHECKS_RESULT === "success" && process.env.PRODUCTION_RESULT === "success" && process.env.WORKERS_RESULT === "success";
const url = `https://github.com/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`;
const repairGuidance = "Deploy bloqueado ou produção sem comprovação. Inspecione os passos e artifacts desta execução e identifique uma causa concreta antes de corrigi-la. Prepare uma PR ligada a este ticket usando `Repairs delivery #<n>` no corpo, cuja entrega esperada restaure a entrega da `main`; o incidente permanece aberto para que apenas uma entrega bem-sucedida o feche. A correção pode estar no produto, nos testes, no harness ou no pipeline. Depois desse diagnóstico, aplique explicitamente o rótulo `no-issue` somente se a PR satisfizer esses critérios. A política canônica e os limites da exceção estão em [Production delivery](https://github.com/BetoFrega/tudo-macae/blob/main/docs/agents/production-delivery.md). Se houve alteração de produção, consulte os artifacts api-worker-recovery e workers-recovery antes de recuperar as versões anteriores.";
const body = `${marker}\n\nSHA: ${process.env.RELEASE_SHA}\n\nExecução: ${url}\n\nChecks: ${process.env.CHECKS_RESULT}. API Worker: ${process.env.PRODUCTION_RESULT}. Workers: ${process.env.WORKERS_RESULT}.\n\n${success ? "Entrega e verificação de produção concluídas." : repairGuidance}`;
if (issue) {
  api(`issues/${issue.number}/comments`, ["--method", "POST", "-f", `body=${body}`]);
  if (success) api(`issues/${issue.number}`, ["--method", "PATCH", "-f", "state=closed"]);
  else api(`issues/${issue.number}`, ["--method", "PATCH", "-f", `body=${body}`]);
}
else if (!success) api("issues", ["--method", "POST", "-f", "title=Corrigir bloqueio da entrega de produção", "-f", `body=${body}`, "-f", "labels[]=needs-triage"]);
