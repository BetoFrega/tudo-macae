# Pull request triage

Read this branch only when triaging pull requests. Common
GitHub operations remain in [Issue Tracker](issue-tracker.md).

**PRs as a request surface: no.** Change this flag only when the repository chooses to
treat external pull requests as feature requests.

When the flag is `yes`, PRs use the same labels and states as issues, with these
tracker-specific operations:

- **Read**: `gh pr view <number> --comments` and `gh pr diff <number>`.
- **List external PRs**: `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments`;
  keep only `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR` and `NONE` author associations.
- **Comment, label or close**: use `gh pr comment`, `gh pr edit` or `gh pr close`.

GitHub shares one number space across issues and PRs. Resolve a bare `#<number>` with
`gh pr view <number>` and fall back to `gh issue view <number>`.
