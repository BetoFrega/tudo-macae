---
trigger: when_operating_the_apex_redirect
---

# Apex redirect runbook

The delivery contract is in [Production topology](production-topology.md).
The applied Single Redirect is
[`infra/cloudflare/apex-redirect.json`](../../infra/cloudflare/apex-redirect.json),
a rule object for the zone-level `http_request_dynamic_redirect` ruleset.
This file records the active configuration; neither committing it nor deploying
the application applies it.
Activate only under explicit authorization and read the provider state back.

## Provider location and scope

Cloudflare account `abd87961a304b923acbc329f0b0d1919`, zone
`tudomacae.com.br` (`7d4facb5dc453abcb1bf72c6508245cc`): **Rules → Overview →
Redirect Rules**, rule **Apex to canonical www**, provider rule ID
`41ca84f7e2954f33a4c7b683a28f5152`. The activation and public verification record is
[#1331](https://github.com/BetoFrega/macae-classificados/issues/1331#issuecomment-5849434679).

The hostname equality excludes
`www`, `mcp`, `images` and other subdomains. Both HTTP and HTTPS match; no origin
request is needed, including for `robots.txt` or nonexistent paths.

The rule uses a dynamic target built from the fixed canonical origin plus the
request path, with query preservation enabled. This is the
[Cloudflare hostname-redirect configuration](https://developers.cloudflare.com/fundamentals/manage-domains/redirect-domain/).
The permanent status is appropriate because `www` is the established canonical
host, rather than a temporary origin rollout. Browsers may retain a permanent
redirect after provider rollback; rollback restores fresh requests, not cached
client decisions.

## Apply

1. Confirm the apex DNS record is **Proxied**. Its placeholder has no origin;
   preserve the current redirect rule while preparing any replacement. This
   operation does not change DNS, `www` Worker routes, MCP rules, or SSL settings.
2. Read the Redirect Rules inventory. Create the rule from the versioned object
   as a disabled draft; if it already exists, edit that rule rather than create
   a duplicate. In the dashboard select **Custom filter expression**, paste
   `expression`, choose **Dynamic**, paste `target_url.expression`, and use
   `status_code` and `preserve_query_string` from the object.
3. With authorization, enable only this rule. Place it before any overlapping
   Single Redirect; a terminating redirect stops later rules. Verify that HTTP
   goes directly to HTTPS `www`, rather than assuming precedence over the
   zone's **Always Use HTTPS** setting. Do not disable that setting for the
   whole zone to fix an apex-only redirect.
4. Reopen the rule and read its expression, target, status, query preservation,
   enabled state and order. Record its rule ID in #1331. API operators can read
   `GET /zones/{zone_id}/rulesets/phases/http_request_dynamic_redirect/entrypoint`;
   update only the intended rule, preserving all other rules. Do not replace a
   populated ruleset with this single object.
5. Run the verification below. After successful read-back and public
   measurements, reconcile the recorded configuration and delivery contract
   and record the evidence in the operational ticket. A saved draft is not a
   completed rollout.

API shape and permissions:
[Create a Single Redirect via API](https://developers.cloudflare.com/rules/url-forwarding/single-redirects/create-api/).
The versioned file is one rule, not a complete ruleset or an automatic deployment.

## Verify

```bash
pnpm run probe:edge
```

`redirect.apex.http` and `redirect.apex.https` each sample `/`, an encoded path
with repeated and empty query values, `/robots.txt`, and a nonexistent route.
Requests use GET and do not follow redirects. Each response must match the
delivery contract: exact canonical destination, status, Cloudflare responder
and no App Hosting markers. A same-host HTTP upgrade or lost query is drift.
The existing `cache.document` and `mcp.*` checks cover the unaffected hosts.
Local Playwright runs do not include the Cloudflare control plane; this public
HTTP probe is the relevant end-to-end verification.

## Recovery

Restore the captured, known-good version of **Apex to canonical www** in the
same Redirect Rules screen, then read back its expression, target, status,
query preservation and enabled state. Keep the proxied placeholder DNS.
Disabling the redirect does not recover a prior origin; it makes fresh apex
requests reach a placeholder. Verify HTTP and HTTPS with `pnpm run probe:edge`.
Browser-cached permanent redirects may outlive a provider change.
