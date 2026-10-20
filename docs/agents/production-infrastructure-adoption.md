# Production infrastructure adoption

Load this operational procedure only when importing the existing Cloudflare zone into
versioned infrastructure is explicitly in scope. The current control boundary and
governance gaps remain in [production operations](production-operations.md).

1. Mint a Cloudflare API token scoped read-only to this zone and make it available to the
   authorized local and CI environments.
2. Enumerate DNS records, redirect and cache rules, managed `robots.txt` / Content
   Signals, WAF and bot settings, and SSL mode through the API.
3. Import every object before authoring resource blocks so state describes what exists.
4. Require the first `terraform plan` to be empty. Any proposed change means the import
   or configuration is incomplete.
5. Commit only after the empty plan; widen the token to write only when an authorized
   apply workflow needs it.

Applying a partial import can destroy unrepresented production rules. The empty-plan gate
is the completion criterion, not a best-effort check.
