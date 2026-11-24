---
trigger: when_loading_sending_or_stopping_business_invitation_emails
---

# Business invitations

The API Worker e-mails the owner of a claimable Business an invitation to take over its
page. The rule lives in `packages/advertiser-identity/lib/businessInvitations.ts`, the
D1 records in `apps/api-worker/lib/db/classifiedsBusinessInvitations.ts`, and the text in
`apps/api-worker/lib/businessInvitationMail.ts`. Beto approves every change to the text
before the next send.

## Release

The hourly maintenance sends up to `businessInvitationsPerRun` invitations only while
both Flagship booleans (app `tudo-macae`) are on:

- `business-claim`: the claim page the invitation links to;
- `business-invitation-email`: the sending itself. Create it off; turn it off to stop
  sending at once.

Each run logs `classifieds.business_invitations.send` with `sent`, `failed` and
`skipped` counts and no address.

## Loading recipients

Addresses are personal data: they never enter the repository, a ticket or a log. An
operator with Cloudflare access inserts them straight into production D1
(`tudo-macae-classifieds-production`), one row per Business id:

```sql
INSERT INTO classifieds_records (kind, namespace, id, body, version)
VALUES ('operation', 'business_invitations', ?1,
  json_object('email', ?2, 'status', 'pending', 'createdAt', ?3, 'attempts', 0),
  lower(hex(randomblob(16))))
ON CONFLICT(kind, namespace, id) DO NOTHING;
```

`?1` is the Business id, `?2` the address and `?3` the epoch milliseconds of the load.
`DO NOTHING` keeps a reload from resetting an invitation that already went out.
`apps/api-worker/tests/classifiedsRuntimeBusinessInvitationTests.ts` runs this statement,
so a schema change that breaks it fails there.

## States

| Status | Meaning |
| --- | --- |
| `pending` | Waits for the next run; a provider failure returns it here until 3 attempts. |
| `sending` | Written before the provider call. An interrupted run leaves it here and never resends. |
| `sent` | Delivered to the provider at `sentAt`. |
| `failed` | Three provider failures; `failureCode` keeps the last error name. |
| `skipped` | `not_claimable` (claimed or removed first) or `suppressed` (address unsubscribed). |

## Unsubscribe

Each sent invitation links to `/convites/descadastrar/<token>`. The page changes nothing
until the recipient presses its button, because mail scanners open links. The button
calls `invitations.unsubscribe`, which needs no session and stores a SHA-256 digest of
the address in `email_suppressions`; every later invitation to that address is skipped.
