import ts from "typescript";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = dirname(fileURLToPath(import.meta.url));
const environment = process.argv[2];
if (!["qualification", "production"].includes(environment))
  throw new Error("Choose qualification or production explicitly");
const databaseId = process.env.AUTHENTICATION_D1_ID;
const classifiedsDatabaseId = process.env.CLASSIFIEDS_D1_ID;
const audience = process.env.AUTHENTICATION_API_ORIGIN;
const serviceAccount = process.env.AUTHENTICATION_RUNTIME_ACCOUNT;
if (
  !databaseId
  || !/^[a-f\d-]{36}$/i.test(databaseId)
  || !classifiedsDatabaseId
  || !/^[a-f\d-]{36}$/i.test(classifiedsDatabaseId)
  || classifiedsDatabaseId === databaseId
  || !audience
  || new URL(audience).protocol !== "https:"
  || new URL(audience).origin !== audience
  || !serviceAccount?.endsWith(".iam.gserviceaccount.com")
)
  throw new Error(
    "API Worker deployment requires distinct authentication and Classifieds D1 ids, HTTPS audience and runtime account",
  );
const parsedConfiguration = ts.parseConfigFileTextToJson(join(root, "wrangler.jsonc"), await readFile(join(root, "wrangler.jsonc"), "utf8"));
if (parsedConfiguration.error) throw new Error("Invalid Worker configuration");
const configuration = parsedConfiguration.config;
configuration.name = `tudo-macae-api-${environment}`;
configuration.main = resolve(root, "entry.ts");
configuration.workers_dev = true;
configuration.vars.WORKERS_ENVIRONMENT = environment;
// Settings read with || treat empty values, as Actions passes unset variables, as absent.
const diagnosticsSetting = process.env.AUTHENTICATION_DIAGNOSTICS_ENABLED
  || configuration.env?.[environment]?.vars.AUTHENTICATION_DIAGNOSTICS_ENABLED
  || configuration.vars.AUTHENTICATION_DIAGNOSTICS_ENABLED;
if (!["true", "false"].includes(diagnosticsSetting))
  throw new Error("Authentication diagnostics setting must be true or false");
// Production enforces Turnstile; TURNSTILE_ENFORCEMENT=off is the emergency switch.
const challengeEnforcement = process.env.TURNSTILE_ENFORCEMENT
  || (environment === "production" ? "on" : "off");
if (!["on", "off"].includes(challengeEnforcement))
  throw new Error("Turnstile enforcement must be on or off");
configuration.vars.TURNSTILE_ENFORCEMENT = challengeEnforcement;
// Enforcing without the secret refuses every login, registration and reset; Wrangler refuses the deploy instead.
if (challengeEnforcement === "on") configuration.secrets.required.push("TURNSTILE_SECRET");
delete configuration.env;
const diagnosticsEnabled = diagnosticsSetting === "true";
configuration.vars.AUTHENTICATION_DIAGNOSTICS_ENABLED = String(diagnosticsEnabled);
configuration.observability.head_sampling_rate = diagnosticsEnabled ? 1 : 0.1;
configuration.vars.OIDC_AUDIENCE = audience;
configuration.vars.OIDC_SERVICE_ACCOUNT = serviceAccount;
configuration.vars.PUBLIC_IMAGE_PURGE_ZONE_ID = process.env.PUBLIC_IMAGE_PURGE_ZONE_ID || configuration.vars.PUBLIC_IMAGE_PURGE_ZONE_ID;
configuration.vars.PUBLIC_APP_ORIGIN
  = process.env.PUBLIC_APP_ORIGIN || configuration.vars.PUBLIC_APP_ORIGIN;
configuration.vars.PUBLIC_IMAGE_ORIGIN = process.env.PUBLIC_IMAGE_ORIGIN || configuration.vars.PUBLIC_IMAGE_ORIGIN;
// The purge targets and probes these hosts, so qualification with a zone would clear and inspect production's cache.
// Compared as hostnames: a trailing slash, letter case, port or DNS root dot still names a production host.
const productionHosts = ["www.tudomacae.com.br", "images.tudomacae.com.br"];
const hostname = value => URL.canParse(value) ? new URL(value).hostname.replace(/\.$/, "") : value;
if (environment !== "production" && configuration.vars.PUBLIC_IMAGE_PURGE_ZONE_ID
  && [configuration.vars.PUBLIC_APP_ORIGIN, configuration.vars.PUBLIC_IMAGE_ORIGIN].some(origin => productionHosts.includes(hostname(origin))))
  throw new Error("A qualification purge zone requires its own PUBLIC_APP_ORIGIN and PUBLIC_IMAGE_ORIGIN");
const editorialDatabaseId = process.env.EDITORIAL_D1_ID;
// D1 ids are UUIDs, so letter case never distinguishes two databases.
if (editorialDatabaseId && (!/^[a-f\d-]{36}$/i.test(editorialDatabaseId) || [databaseId, classifiedsDatabaseId].some(id => id?.toLowerCase() === editorialDatabaseId.toLowerCase())))
  throw new Error("EDITORIAL_D1_ID must be a distinct D1 id");
const databases = { AUTHENTICATION_DB: [databaseId, "authentication", "migrations"], CLASSIFIEDS_DB: [classifiedsDatabaseId, "classifieds", "migrations-classifieds"],
  ...(editorialDatabaseId ? { EDITORIAL_DB: [editorialDatabaseId, "editorial", "migrations-editorial"] } : {}) };
// Without EDITORIAL_D1_ID the Worker deploys without Media, which then answers 404.
configuration.d1_databases = configuration.d1_databases.filter(database => databases[database.binding]);
for (const database of configuration.d1_databases) {
  const [id, name, migrations] = databases[database.binding];
  Object.assign(database, { database_id: id, database_name: `tudo-macae-${name}-${environment}`, migrations_dir: resolve(root, migrations) });
}
const articleIndexService = process.env.PUBLIC_ARTICLE_INDEX_SERVICE || undefined;
if (articleIndexService !== undefined && !/^[a-z0-9-]{1,63}$/.test(articleIndexService))
  throw new Error("PUBLIC_ARTICLE_INDEX_SERVICE must name a Worker");
// Without PUBLIC_ARTICLE_INDEX_SERVICE the Blog saves stay unconfirmed for the public index.
configuration.services = configuration.services.flatMap(service => service.binding !== "ARTICLE_INDEX"
  ? [service]
  : articleIndexService ? [{ ...service, service: articleIndexService }] : []);
const exportsBucket = process.env.PDM_EXPORTS_BUCKET || undefined;
if (exportsBucket !== undefined && !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(exportsBucket))
  throw new Error("PDM_EXPORTS_BUCKET must name an R2 bucket");
// Without PDM_EXPORTS_BUCKET the Worker deploys without the daily supply snapshot; Wrangler refuses a bucket that does not exist.
configuration.r2_buckets = configuration.r2_buckets.flatMap(bucket => bucket.binding !== "PDM_EXPORTS"
  ? [bucket]
  : exportsBucket ? [{ ...bucket, bucket_name: exportsBucket }] : []);
const directory = await mkdtemp(join(tmpdir(), "authentication-deployment-"));
try {
  const path = join(directory, "wrangler.json");
  await writeFile(path, JSON.stringify(configuration));
  const wrangler = args => execFileSync("wrangler", args, { cwd: root, stdio: "inherit" });
  if (process.argv.includes("--migrations-only")) {
    for (const binding of Object.keys(databases)) wrangler(["d1", "migrations", "apply", binding, "--remote", "--config", path]);
  }
  else wrangler(["deploy", "--config", path, ...(process.env.RELEASE_SHA ? ["--tag", process.env.RELEASE_SHA] : []),
    ...(process.argv.includes("--dry-run") ? ["--dry-run"] : [])]);
}
finally {
  await rm(directory, { recursive: true, force: true });
}
