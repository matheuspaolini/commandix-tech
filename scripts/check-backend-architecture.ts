import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SOURCE_ROOTS = ["apps/api/src", "apps/worker/src", "packages"];
const PRODUCTION_FILE = /\.ts$/;
const TEST_FILE = /\.(test|spec)\.ts$/;
const PARENT_IMPORT = /from\s+["']\.\.\//;
const WORKSPACE_APP_IMPORT = /from\s+["'][^"']*apps\//;

const failures: string[] = [];
for (const sourceRoot of SOURCE_ROOTS) inspectDirectory(join(ROOT, sourceRoot));

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Backend architecture check passed.");
}

function inspectDirectory(directory: string): void {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory)) {
    const file = join(directory, entry);
    if (statSync(file).isDirectory()) inspectDirectory(file);
    else if (PRODUCTION_FILE.test(file) && !TEST_FILE.test(file)) inspectFile(file);
  }
}

function inspectFile(file: string): void {
  const source = readFileSync(file, "utf8");
  const display = relative(ROOT, file);
  if (WORKSPACE_APP_IMPORT.test(source))
    failures.push(`${display}: workspace packages must not import app source`);
  if (process.env.ARCHITECTURE_STRICT === "true" && PARENT_IMPORT.test(source))
    failures.push(`${display}: parent-relative internal imports are forbidden`);
}
