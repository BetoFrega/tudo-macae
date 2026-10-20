# Triage labels

The skills use canonical workflow and category purposes. This file maps each purpose
to the label that exists in this repository's GitHub tracker.

| Kind | Canonical purpose | Tracker label | Meaning |
| --- | --- | --- | --- |
| workflow | needs triage | `needs-triage` | Maintainer investigation or evaluation is required |
| workflow | needs information | `needs-info` | Waiting for information from the reporter |
| workflow | ready for agent | `ready-for-agent` | Fully specified for autonomous execution |
| workflow | ready for human | `ready-for-human` | Human implementation or judgment is required |
| workflow | will not fix | `wontfix` | Intentionally not planned |
| category | low information density | `low-info-density` | Content reported as reducible without losing relevant evidence |

Use the mapped tracker label whenever a skill names its canonical purpose. Workflow
labels describe the issue's current state; the low-information-density category is
additive and remains present while the report moves through triage.
