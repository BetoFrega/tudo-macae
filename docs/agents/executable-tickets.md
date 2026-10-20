# Executable tickets

Read this branch when preparing a ticket that an agent can execute. Common GitHub
operations remain in [Issue Tracker](issue-tracker.md).

## Model and effort recommendation

Every actionable ticket recommends a Claude and an OpenAI model and reasoning effort
for both implementation and code review. Calculate each recommendation independently
with [Model Selection](model-selection.md).

Bodies are written in Portuguese, so use:

```markdown
## Modelo e esforço recomendados

- **Implementação**
  - **Claude**: <modelo>, esforço `<nível>` — <por quê, uma linha>
  - **OpenAI**: <modelo>, esforço `<nível>` — <por quê, uma linha>
- **Revisão de código**
  - **Claude**: <modelo>, esforço `<nível>` — <por quê, uma linha>
  - **OpenAI**: <modelo>, esforço `<nível>` — <por quê, uma linha>
```

Place the section near the top of the body, after any parent and blocking context, so
the recommendation is read before execution. Choose providers and operations
independently, and make each one specific to this ticket rather than inheriting a
parent or sibling recommendation.

Tickets still in triage do not need recommendations. Add them when a ticket becomes
`ready-for-agent`; spec and parent issues that nobody implements directly are exempt.

## Ticket granularity

Use the last responsible moment: create only the tickets relevant to the next useful
round, preserving reversible design choices until evidence requires them. Five to ten
tickets is a useful planning range, not a quota.
