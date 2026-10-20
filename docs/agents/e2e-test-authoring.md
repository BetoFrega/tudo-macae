---
trigger: when_writing_e2e_tests
---

# E2E Test Authoring

Use Playwright for user journeys, component interactions and browser-visible
feature behaviour. Before writing a case, follow
[Test Selection](test-selection.md) for its tier and E2E composition. Before
execution, follow [Test Harness Operation](test-harness-operation.md) for
invocation planning, the E2E stack and environmental diagnosis.

Run UI mode on a stable port with:

```bash
npm run test:e2e -- --ui-port=53413
```

The suite has `retries: 0`. A flaky test is a defect; fix the cause instead of
adding retries.

## Fixtures and login

Tests compose fixtures from:

- `tests/e2e/_helpers/fixtures/index.ts`
- `tests/e2e/_helpers/auth/auth-test-utils.ts`
- `tests/e2e/_helpers/ads/ads-test-utils.ts`

Use `userCredentials`, `adminUserCredentials`, `adFixture`, `categoryFixture`
and `userWithClaims` rather than assembling their state manually. A role claim
only reaches the app in a session cookie minted after the claim exists:

```ts
test("editor can publish", async ({ userWithClaims }) => {
  const editor = await userWithClaims({ editor: true });
  // The fixture grants the claim before login and cleans the user up.
});
```

Write claims through `updateCustomClaims`; never call `setCustomUserClaims`,
which replaces the complete claim object. Use `window.login()` through the
authentication helper for explicit login flows.

## Page objects and clicks

Page objects live in `tests/e2e/_helpers/*/POMs/`. Never call Playwright's
`.click()` directly. In a page object use `this.click`; in a spec import the
shared helper:

```ts
import { click } from "../_helpers/click";

await click(page.getByRole("link", { name: "Ver Usuários" }));
```

The helper waits and retries in-app navigation after hydration. Pass
`ensureVisible` for a target in a dropdown that a lost click may close.

## Locators

Make a locator identify the intended element before asserting on it. Scope it
to the narrowest stable container and use the element's role when one exists.
When a literal names the complete label, status or control, pass
`{ exact: true }`; keep substring matching only when containment is the
behaviour under test.

Server components can render more than once. Select the active copy with
`filter({ visible: true })` when only one rendering is user-visible. Use
`first()`, `last()` or `nth()` only when position is part of the interface
contract, not to silence an unexplained strict-mode failure. Put locators reused
across journeys in their page object.

## Server actions and navigation

`click()` only confirms that the click landed; it does not wait for a server
action. Before asserting effects, wait for the action's success signal: a URL
change, a dialog closing, or the affected row disappearing. The response is the
first point at which Next.js has applied its invalidation.

A server-component redirect inside `<Suspense>` can arrive after `goto()`
resolves. For a route that bounces, wait for the final URL before another
navigation; otherwise the redirect can abort it.

Use the same fixture mutation path locally and in GitHub Actions. Category fixtures
use `createCategoryThroughApp`, including the subcategory and completion of the
administrator context. Public cache refresh is part of the application's
mutation contract: wait for its success signal before reading the result.
Legacy malformed preconditions may be persisted through their explicit fixture
helpers before their first read; publish them through the application's UI.

## Isolation

All workers share the API Worker fixture and the Next.js cache. Every fixture
needs a unique name via `makeRandomString()` and cleanup after `use()`. Do not
assume an empty store, assert global-list counts or totals, or assert global absence unless
the test created and deleted that exact entity. Locate the entity your fixture
created instead.

The suite is pinned to one worker because the shared cache remains racy even
when fixture data is isolated. Keep that pin; parallel runs have demonstrated
non-deterministic reads with little wall-time benefit.
