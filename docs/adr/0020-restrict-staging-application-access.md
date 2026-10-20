---
record: adr
id: "0020"
status: superseded
decided: 2026-09-07
---

# 20. Restrict staging application access through Cloudflare Access

Shared understanding confirmed by the maintainer on 2026-09-07; implementation
remains pending. Place the staging web application and its APIs
behind Cloudflare Access at `staging.tudomacae.com.br`, with origin validation that
prevents alternate Firebase/App Hosting or Cloud Run URLs from bypassing access
control. Prefer signed Access assertions validated for signature, issuer, audience
and expiry. A header's presence alone is not proof of authorization.

Human access is limited to the maintainer's explicitly allowed email, without an IP
restriction; any future additional person requires explicit, temporary access.
GitHub workflows and local automation use separate, independently revocable service
credentials. Broad GitHub runner IP allowlists do not identify this repository's
workflows and are not the access boundary. Access credentials grant entry only:
product authentication, operational reset authority under ADR 0016 and editorial
credentials under ADR 0014 remain separate and required where applicable.

Failure of Access or origin validation denies access, with no automatic public
fallback. Firebase Storage files and the external image-processing function are
explicitly outside this work: their direct URLs retain their existing access
behavior. This decision restricts the application, not every staging resource.

Implementation must coordinate canonical-origin configuration, deployment probes,
reset transports, browser tests and local tools. Protection must precede any reuse
of application responses from Cloudflare or App Hosting caches, including static
assets and previously cached responses; a runtime check alone does not demonstrate
this. Verify the actual provider delivery path before selecting the enforcement
mechanism. ADR 0017's production caching policy is unchanged; this staging boundary
must not be weakened to preserve unauthenticated cache delivery.

Acceptance requires successful authorized human and machine access, successful
staging workflows, rejection of unauthorized requests and invalid proofs, and no
unauthenticated bypass through alternate application URLs or cached responses.
Provider settings and live acceptance evidence belong in a staging access runbook
when implemented; this decision does not assert that any protection is deployed.

References: [Access service tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/),
[origin assertion validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/),
and [GitHub runner IP guidance](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).

The [pre-reorganization record](https://github.com/BetoFrega/macae-classificados/blob/7da1e3af1bb963d42cc75578463816155a63c3e9/docs/adr/0020-restrict-staging-application-access.md) preserves earlier dated wording and superseded clauses.

## Scope and amendments

Follow [0022](0022-production-only-with-disposable-e2e.md) for the replacement
architecture. This historical rationale does not establish external retirement.
