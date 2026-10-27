---
record: adr
id: "0006"
status: accepted
decided: 2026-08-21
---

# 6. `overrides` para advisories em dependências transitivas

## Context

Os alertas do Dependabot deste repositório caem, na prática, em dois grupos. O
primeiro se resolve sozinho: o pacote vulnerável é transitivo, mas o range de
quem o puxa já aceita a versão corrigida, e `npm update` basta. O segundo não:
quem puxa o pacote pina uma versão exata, ou o conserto veio num major que o
range não alcança. Nesse caso não há bump possível sem esperar o upstream —
que pode levar meses para um pacote que só roda em ferramenta de
desenvolvimento.

Esperar deixa o alerta aberto e treina a equipe a ignorar a lista. Forçar a
versão com `overrides` do npm resolve o alerta hoje, ao custo de o lockfile
passar a conter uma combinação que o autor do pacote nunca testou.

## Decision

Usamos `overrides` no `package.json` para os advisories que o range não alcança,
sob três condições:

1. **O override é o mais estreito possível.** Prefira `{"pai": {"vulnerável":
"versão"}}` a um override global do pacote vulnerável — o global atinge
   caminhos que não estavam no alerta.
2. **A superfície usada é conferida antes.** Ler o call site no `node_modules`
   do pai e confirmar que a API que ele usa sobreviveu ao bump. `grep -rn
"<pacote>" node_modules/<pai>/build` custa segundos.
3. **Cada entrada tem condição de remoção no guia operacional.** Override sem
   condição de saída vira permanente por esquecimento.

Não vale a nota expirável do ADR 2 porque `package.json` é JSON e não aceita
comentário; a validade fica no guia operacional.

## Operational maintenance

[Override maintenance](../agents/dependency-overrides.md) owns the entries and exit
conditions; `pnpm-workspace.yaml` owns executable values.

## Consequences

### Positivo

- `npm audit` fica em zero, e a lista do Dependabot volta a significar algo.
- O override estreito não muda a resolução dos caminhos que não estavam no alerta.

### Negativo

- O lockfile carrega combinações que o autor do pacote pai não testou; uma
  quebra aparece em runtime, não na instalação.
- O registro operacional é manutenção manual: um override removido sem atualizar o
  guia deixa a linha mentindo.

## Scope and amendments

On 2026-10-27, [ADR 0047](0047-use-pnpm-as-the-package-manager.md) moved the
overrides to `pnpm-workspace.yaml`, written as `"parent>child": version`. The three
conditions still apply, and `pnpm audit` takes the place of `npm audit`. YAML accepts
comments, but exit conditions stay in the operational guide so that one source owns
them.

The [pre-reorganization record](https://github.com/BetoFrega/macae-classificados/blob/7da1e3af1bb963d42cc75578463816155a63c3e9/docs/adr/0006-npm-overrides-for-transitive-advisories.md) preserves earlier dated wording and superseded clauses.
