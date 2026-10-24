# Classifieds cutover

Classifieds authority moved from Firebase to the API Worker (D1 records, Hosted Images photos) in production on 2026-10-12 ([#1719](https://github.com/BetoFrega/macae-classificados/issues/1719)); the legacy photo bucket closed to anonymous reads the same day ([#1999](https://github.com/BetoFrega/macae-classificados/issues/1999)). `main` carries neither the legacy runtime ([#2022](https://github.com/BetoFrega/macae-classificados/issues/2022)) nor the export and transfer tooling: no further transfer is planned (Beto, 2026-10-13). The runbook, operator setup and source-window procedure that ran the cut live in the history of this file and of `docs/agents/classifieds-source-window.md`.

## Current state

- `classifieds_authority` in the Classifieds D1 reads `worker`; a SQL trigger rejects returning to `legacy`. The API Worker no longer reads the table: production always serves Classifieds (`git grep -n classifiedsQualification -- apps/api-worker/production.ts`).
- `www` is served by the web Worker, which has no Firebase writer. The Cloud Run revisions of `tudo-macae-www` built from `main` carry `CLASSIFIEDS_FIREBASE_WRITES=suspended` in their environment; no router version allowed in [recovery](www-origin-runbook.md#deploy-and-recovery) reaches them.

## Recovery

- **Fix forward:** no remote switch closes Classifieds and the post-cut writes exist only in D1. Fix and redeploy the API Worker; Firebase writes stay suspended. Traffic rollback does not restore source authority. Rollback floors (Beto, 2026-10-13):
  - **API Worker:** version `a8cd6aac` and later. Versions released before [#2009](https://github.com/BetoFrega/macae-classificados/pull/2009) read the PostHog flag `classifieds-api` and fail closed without it; the floor excludes them, so the flag may be archived.
  - **`www`:** web Worker versions only; a router rollback never reaches Cloud Run ([why](www-origin-runbook.md#deploy-and-recovery)). Only Cloud Run revisions older than [#1979](https://github.com/BetoFrega/macae-classificados/pull/1979) read the [retired ad sitemap resources](www-origin-runbook.md#retired-ad-sitemap-resources), which may therefore be deleted.

  Archiving the flag and deleting those resources are production operations that each need their own authorization.
- **Photo bucket closure:** reversible on its own and independent of the authority: `gcloud storage buckets update gs://<photo bucket> --no-public-access-prevention` restores the per-object ACLs, which reopens removed photos at their raw URL (`storage.googleapis.com`; the Firebase REST URL answered 401 through App Check on 2026-10-12). Revert only to restore an anonymous reader of the bucket that the closure broke. In production the photo bucket is `macaetem-dev.firebasestorage.app`.

## Retired transfer infrastructure

Nothing in this tree uses the GitHub environment `classifieds-cutover` (secret `CLASSIFIEDS_TRANSFER_CLOUDFLARE_API_TOKEN`, variables `CLASSIFIEDS_D1_ID`, `CLOUDFLARE_ACCOUNT_ID`, `CLASSIFIEDS_EXPORT_WIF_PROVIDER`, `CLASSIFIEDS_EXPORT_ACCOUNT`), the workload identity pool `github-classifieds-export` or the service account `classifieds-export@macaetem-dev` (`rg -n 'classifieds-cutover|CLASSIFIEDS_EXPORT|CLASSIFIEDS_TRANSFER|classifieds-export' .github src bin packages apps` prints nothing). Deleting them is a production operation that needs its own authorization.
