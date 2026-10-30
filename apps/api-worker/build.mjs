import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import dynamicIconImports from "lucide-react/dynamicIconImports.mjs";
const args = process.argv.slice(2);
const iconVocabulary = `${JSON.stringify(Object.keys(dynamicIconImports).sort())}\n`;
const iconFile = resolve("lib/supportedIcons.json");
if (args.includes("--refresh-icon-names")) writeFileSync(iconFile, iconVocabulary);
if (JSON.stringify(JSON.parse(readFileSync(iconFile, "utf8"))) !== iconVocabulary.trim()) throw new Error("Lucide vocabulary changed. Run pnpm --filter @tudomacae/api-worker run build --refresh-icon-names.");
const outputIndex = args.indexOf("--outdir");
const directory = resolve(outputIndex < 0 ? "dist" : args[outputIndex + 1]);
const entryIndex = args.indexOf("--entry");
const entry = entryIndex < 0 ? "entry.ts" : args[entryIndex + 1];
execFileSync(
  "wrangler",
  ["deploy", entry, "--dry-run", "--outdir", directory],
  { stdio: "pipe" },
);
mkdirSync(directory, { recursive: true });
cpSync("migrations", resolve(directory, "migrations"), { recursive: true });
cpSync("migrations-classifieds", resolve(directory, "migrations-classifieds"), { recursive: true });
cpSync("migrations-editorial", resolve(directory, "migrations-editorial"), { recursive: true });
