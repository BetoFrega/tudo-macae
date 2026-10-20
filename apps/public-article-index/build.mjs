import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const outputIndex = args.indexOf("--outdir");
const directory = resolve(outputIndex < 0 ? "dist" : args[outputIndex + 1]);
execFileSync("wrangler", ["deploy", "--dry-run", "--env", "production", "--outdir", directory], { stdio: "inherit" });
mkdirSync(directory, { recursive: true });
cpSync("migrations", resolve(directory, "migrations"), { recursive: true });
