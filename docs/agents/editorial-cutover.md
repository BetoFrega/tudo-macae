# Editorial cutover

Blog and editorial Media authority moved from Firebase to the API Worker (editorial D1 `tudo-macae-editorial-<env>`, Hosted Images) ([#2051](https://github.com/BetoFrega/macae-classificados/issues/2051)). It followed the [Classifieds cutover](classifieds-cutover.md). The runbook that drove the window, its gates and the transfer tool live in this file's and the repository's history.

## Outcome

Done on 2026-10-16.

- **Import:** `apply` [run 38828111596](https://github.com/BetoFrega/macae-classificados/actions/runs/38828111596) imported 4081 records and reported 2572 `unchanged`.
- **Parity:** `compare` runs [38830811478](https://github.com/BetoFrega/macae-classificados/actions/runs/38830811478) and [38831919420](https://github.com/BetoFrega/macae-classificados/actions/runs/38831919420) both reported `same: 6653, missing: 0, changed: 0, extra: 0`.
- **Promotion:** about 01:10Z, with `npx wrangler d1 execute tudo-macae-editorial-production --remote --command "UPDATE editorial_authority SET authority = 'worker' WHERE id = 1"`. A trigger refuses any return to `legacy`.
- **After promotion:** `compare` [run 38833640817](https://github.com/BetoFrega/macae-classificados/actions/runs/38833640817) also reported `same: 6653, missing: 0, changed: 0, extra: 0`, so no late Firebase write needed a manual copy.
- **Drain:** confirmed by the elapsed default request timeout after the traffic move, plus Beto's decision to proceed. No request-log evidence was recorded.

Check the current authority: `npx wrangler d1 execute tudo-macae-editorial-production --remote --command "SELECT authority FROM editorial_authority"`.

## Recovery

Writes made after promotion exist only in D1. Fix forward on the API Worker.

`www` is served by the web Worker, which has no Firebase writer. The Cloud Run revisions of `tudo-macae-www` built from `main` carry `EDITORIAL_FIREBASE_WRITES=suspended`, older ones write Firebase directly, and no router version allowed in [recovery](www-origin-runbook.md#deploy-and-recovery) reaches either.

## After the cut

The application no longer contains the Firebase Admin SDK, the Firebase editorial adapters, the `legacy` branches, the editorial Firestore indexes, the demo seed's editorial Firestore modules or the transfer tool. The D1 `editorial_authority` table and the Worker's `/api/editorial/authority` route remain, and the Worker's routes still require `worker`.

What remains, each its own change:

- **Admin cleanup:** an admin may delete the repository variable `EDITORIAL_FIREBASE_WRITES`, which no workflow reads, as well as the `editorial-transfer` GitHub environment and its transfer service account.
- **Deployed indexes:** the deployed editorial composite indexes stay; the repository no longer deploys or deletes Firestore indexes.
- **Firebase data:** production data and resources go with the Firebase project, not piecemeal.
- **Unused domain seams:** `article-catalog`, `editorial-access` `editorAuthorization` and `editorial-sourcing` `permissions` lost their Firebase consumers. Retire them through `domain-seams.retired.json` or give them a Worker consumer.
