# Orquestração de Testes / Test Harness

Orquestração de Testes prepara, isola, executa e diagnostica o ambiente compartilhado
em que a aplicação é verificada. Não possui a estratégia de cobertura nem os dados de
negócio criados pelos testes.

## Linguagem

**Bloco de emuladores / Emulator Block**:
Conjunto determinístico e exclusivo de portas derivado para um worktree, usado em conjunto por Firestore, Storage, UI e serviços coordenados.
_Evitar_: Porta aleatória, emulador isolado

**Coleção de testes / Test Collection**:
Membership canônico de casos executados juntos por uma entrada pública do harness, como as coleções standalone e application do Playwright.
_Evitar_: Pasta de testes, glob avulso

**Fixture / Fixture**:
Dependência que o Playwright injeta num teste de ponta a ponta, como Page Object, credencial ou invalidador de cache. Não é massa de dados nem Seed de demonstração.
_Evitar_: Massa de dados, seed

**Preflight / Preflight**:
Verificação anterior à execução que recusa ambiente incompatível antes de iniciar trabalho cujo resultado seria enganoso.
_Evitar_: Teste, tentativa automática de correção

**Falha ambiental / Environmental Failure**:
Falha causada pela indisponibilidade ou incompatibilidade comprovada do ambiente de execução, distinguida de defeito da aplicação e acompanhada de diagnóstico acionável.
_Evitar_: Teste quebrado, flake
