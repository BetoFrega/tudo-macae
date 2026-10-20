# Wayfinder tracker operations

Read this branch only when creating or operating a map of decision tickets. Common GitHub
operations remain in [Issue Tracker](issue-tracker.md).

- **Map**: create one issue labelled `wayfinder:map`; its body holds Destination,
  Notes, Decisions-so-far, Not-yet-specified and Out-of-scope sections.
- **Child ticket**: link an issue as a GitHub sub-issue and apply one
  `wayfinder:<type>` label: `research`, `prototype`, `grilling` or `task`. If
  sub-issues are unavailable, add the child to a task list in the map and put
  `Part of #<map>` at the top of the child body.
- **Blocking**: add a native dependency with
  `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`.
  Obtain the numeric database id with
  `gh api repos/<owner>/<repo>/issues/<number> --jq .id`; neither the issue number nor
  `node_id` is accepted. Use the common body fallback only when native dependencies are
  unavailable.
- **Frontier**: list the map's open children, preserve map order, then drop assigned
  children and any child whose `issue_dependencies_summary.blocked_by` is greater than
  zero. With the body fallback, drop children whose `Blocked by` list contains an open
  issue.
- **Claim**: assign the child to the driving developer before any work. The assignment
  is the claim and must be the session's first write.
- **Resolve**: publish and verify the resolution comment, close the child, then append
  a gist and link to the map's Decisions-so-far.
