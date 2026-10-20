# Harness de Agentes / Agent Harness

O Harness de Agentes governa as fontes comportamentais e os mecanismos pelos quais
Codex, Claude e Antigravity descobrem e aplicam as instruções do repositório.

## Linguagem

**Fonte canônica / Canonical Source**:
Documento ou diretório que possui uma regra compartilhada e é alterado diretamente. Superfícies derivadas apenas apontam ou traduzem protocolos.
_Evitar_: Cópia principal, versão preferida

**Adapter / Adapter**:
Superfície fina que traduz caminho, matcher, timeout ou protocolo de uma Fonte canônica para um agente específico, sem repetir sua política.
_Evitar_: Fonte canônica, regra duplicada

**Skill / Skill**:
Pacote de instruções carregado quando o pedido ou a descrição ativa suas ramificações. Uma skill bloqueada por upstream é um snapshot exato, não uma extensão local.
_Evitar_: Prompt genérico, comando

**Hook / Hook**:
Verificação executada pelo agente em um evento do ciclo de ferramentas. A política permanece compartilhada; wrappers adaptam apenas o protocolo de cada agente.
_Evitar_: Skill, regra residente

**Ponteiro de contexto / Context Pointer**:
Referência residente que nomeia uma fonte fora do contexto atual e declara as condições que exigem carregá-la.
_Evitar_: Manifesto central, link ornamental
