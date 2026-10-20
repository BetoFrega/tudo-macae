---
record: adr
id: "0035"
status: historical
decided: 2026-09-06
---

# 35. Accept the combined App Hosting build/runtime baseline in staging

## Context and decision

On 2026-09-06 retain the existing firebaseapphosting.computeRunner baseline for the
staging service account rather than redesigning the provider's combined build/runtime
identity. At that decision point App Hosting used the backend account for both roles;
the provider grant includes artifact/Storage writes and build updates. Independently
scope/review reset permissions instead of claiming the runtime has only reset authority.

## Alternatives and consequences

This is an explicit exception to absolute least privilege for that historical staging
boundary, not permission for broader grants, production or unrelated retained roles.
The separate firebaseauth.admin audit was unresolved. Reconsider when identities are
separated or the provider changes. Verify provider role with
`gcloud iam roles describe roles/firebaseapphosting.computeRunner --format=json`
and compare actual bindings separately. The historical account model is described in
[App Hosting service accounts](https://firebase.google.com/docs/app-hosting/about-app-hosting#the_app_hosting_backend_service_account).

## Scope and amendments

The old 0018 runtime filename is a pointer because it collided with publication 0018.
This record applies only to staging. [0022](0022-production-only-with-disposable-e2e.md)
chooses the replacement topology; neither its acceptance nor this historical status
proves external retirement or establishes a production permission exception.
