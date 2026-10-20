import { fixture, forgetSession, signIn, updateRoles } from "./worker";
import accountData from "./data/accounts.json";

/**
 * The one password every demo account answers to. Documented in
 * `src/packages/demo-seed/README.md` and printed at boot, because a demo
 * account nobody can sign in to is decoration.
 *
 * Safe to hard-code only because `shouldSeedDemoData` refuses to run anywhere
 * but `next dev`, whose accounts live in the in-memory API Worker fixture.
 */
export const DEMO_PASSWORD = "demo1234";

/**
 * What a demo account is allowed to do. See `rolesFor` for how each role maps
 * onto the platform's role vocabulary.
 */
type DemoAccountRole = "advertiser" | "editor" | "admin";

interface DemoAccount {
  key: string;
  email: string;
  displayName: string;
  role: DemoAccountRole;
}

const accounts: readonly DemoAccount[] = accountData as DemoAccount[];

/** The named accounts, in the order the boot log should print them. */
const namedAccountKeys = ["admin", "editor", "advertiser"] as const;

/**
 * The complete role state a data-file role implies — both roles named,
 * granted or revoked, never a partial grant.
 *
 * Spelling out the revocations is what makes the data file the truth: flip an
 * account from `admin` to `advertiser` in `accounts.json` and the seed takes
 * the role away, instead of leaving an admin nobody can explain.
 *
 * `advertiser` is the absence of both: the platform grants no advertiser role,
 * everyone signed in may advertise.
 */
function rolesFor(role: DemoAccountRole) {
  return {
    admin: role === "admin",
    editor: role === "editor",
  };
}

interface FixtureAccount {
  uid: string;
  claims: { admin?: boolean; editor?: boolean };
}

function holdsRoles(account: FixtureAccount, role: DemoAccountRole): boolean {
  const roles = rolesFor(role);
  return (account.claims.admin === true) === roles.admin
    && (account.claims.editor === true) === roles.editor;
}

/** Only granted roles are stored, so an account without roles has no claims. */
function grantedClaims(role: DemoAccountRole) {
  return Object.fromEntries(Object.entries(rolesFor(role)).filter(([, granted]) => granted));
}

/**
 * Creates every demo account in the API Worker and returns the uid each data
 * file key resolves to.
 *
 * The fixture's account route creates a verified Better Auth account with its
 * roles in one step. An account that already exists — the dev server restarted
 * against the same fixture — is reused; its roles are brought back to the data
 * file through the administrator's `updateRoles`, the path /admin uses.
 *
 * Sequential on purpose: a boot-time job with no deadline worth racing.
 */
export async function seedAccounts(): Promise<ReadonlyMap<string, string>> {
  const uidByKey = new Map<string, string>();
  const drifted: { uid: string; email: string; role: DemoAccountRole }[] = [];

  for (const account of accounts) {
    const existing = await fixture<FixtureAccount | null>("/find", { email: account.email });
    if (existing) {
      uidByKey.set(account.key, existing.uid);
      if (!holdsRoles(existing, account.role)) drifted.push({ uid: existing.uid, email: account.email, role: account.role });
      continue;
    }
    const created = await fixture<{ uid: string }>("/create", {
      email: account.email,
      password: DEMO_PASSWORD,
      claims: grantedClaims(account.role),
      emailVerified: true,
    });
    uidByKey.set(account.key, created.uid);
  }

  if (drifted.length > 0) {
    const administrator = await signIn(accountEmail("admin"), DEMO_PASSWORD);
    for (const { uid, email, role } of drifted) {
      await updateRoles(administrator, uid, rolesFor(role));
      // A session keeps the roles it was signed in with.
      forgetSession(email);
    }
  }

  return uidByKey;
}

/** The e-mail a data-file account key signs in with. */
export function accountEmail(key: string): string {
  const account = accounts.find(candidate => candidate.key === key);
  if (!account) throw new Error(`Demo data names account "${key}", which accounts.json does not define.`);
  return account.email;
}

/** The named accounts and their e-mails, for the boot log. */
export function namedCredentials(): {
  email: string;
  role: DemoAccountRole;
}[] {
  return namedAccountKeys.map((key) => {
    const account = accounts.find(candidate => candidate.key === key)!;
    return { email: account.email, role: account.role };
  });
}
