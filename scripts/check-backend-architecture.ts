import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const SOURCE_ROOTS = ["apps/api/src", "apps/worker/src", "packages"];
const PRODUCTION_FILE = /\.ts$/;
const TEST_FILE = /\.(test|spec)\.ts$/;
const STRICT = process.env.ARCHITECTURE_STRICT === "true";
const failures: string[] = [];

for (const sourceRoot of SOURCE_ROOTS) inspectDirectory(join(ROOT, sourceRoot));
assertFixtureRules();

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Backend architecture check passed${STRICT ? " (strict)." : "."}`,
  );
}

function inspectDirectory(directory: string): void {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory)) {
    const file = join(directory, entry);
    if (statSync(file).isDirectory()) inspectDirectory(file);
    else if (PRODUCTION_FILE.test(file) && !TEST_FILE.test(file))
      inspectFile(file);
  }
}

function inspectFile(file: string): void {
  const source = ts.createSourceFile(
    file,
    ts.sys.readFile(file) ?? "",
    ts.ScriptTarget.Latest,
    true,
  );
  for (const specifier of importSpecifiers(source)) {
    const target = resolveImport(file, specifier);
    if (!target) continue;
    const violation = importViolation(file, target, specifier, STRICT);
    if (violation) failures.push(`${relative(ROOT, file)}: ${violation}`);
  }
}

function importSpecifiers(source: ts.SourceFile): string[] {
  const values: string[] = [];
  source.forEachChild((node) => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      values.push(node.moduleSpecifier.text);
    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      values.push(node.moduleSpecifier.text);
  });
  return values;
}

function resolveImport(from: string, specifier: string): string | undefined {
  if (specifier.startsWith("@/")) {
    const workspaceSource = workspaceRoot(from);
    return resolveCandidate(join(workspaceSource, specifier.slice(2)));
  }
  if (specifier.startsWith("."))
    return resolveCandidate(resolve(dirname(from), specifier));
  if (specifier.includes("/src/"))
    return resolveCandidate(join(ROOT, specifier));
  return undefined;
}

function resolveCandidate(path: string): string | undefined {
  for (const candidate of [path, `${path}.ts`, join(path, "index.ts")]) {
    if (existsSync(candidate)) return normalize(candidate);
  }
  return undefined;
}

function workspaceRoot(file: string): string {
  const parts = relative(ROOT, file).split("/");
  return join(ROOT, parts.slice(0, 3).join("/"));
}

function importViolation(
  source: string,
  target: string,
  specifier: string,
  strict: boolean,
): string | undefined {
  const sourceInfo = classify(source);
  const targetInfo = classify(target);
  if (sourceInfo.workspace === "package" && targetInfo.workspace !== "package")
    return "workspace packages must not import app source";
  if (sourceInfo.workspace !== targetInfo.workspace) {
    if (targetInfo.workspace === "package") return undefined;
    return "apps must not import another app's source";
  }
  if (specifier.startsWith("../") && strict)
    return "parent-relative internal imports are forbidden";
  if (isPasswordContractException(sourceInfo, targetInfo)) return undefined;
  if (!strict || sourceInfo.feature === targetInfo.feature) {
    if (!strict) return undefined;
    return layerViolation(sourceInfo, targetInfo);
  }
  if (isAllowedCrossFeatureImport(sourceInfo, targetInfo)) return undefined;
  return "cross-feature imports must consume a named public contract";
}

type Layer =
  | "domain"
  | "application"
  | "infrastructure"
  | "presentation"
  | "bootstrap"
  | "legacy";
type FileInfo = {
  workspace: "api" | "worker" | "package";
  feature: string;
  layer: Layer;
  path: string;
};

function classify(file: string): FileInfo {
  const path = relative(ROOT, file).replaceAll("\\", "/");
  if (path.startsWith("packages/"))
    return {
      workspace: "package",
      feature: "package",
      layer: "bootstrap",
      path,
    };
  const [, workspace, , feature = "bootstrap", ...rest] = path.split("/");
  const layer = rest.find((part): part is Layer =>
    ["domain", "application", "infrastructure", "presentation"].includes(part),
  );
  return {
    workspace: workspace === "api" ? "api" : "worker",
    feature,
    layer:
      layer ??
      (path.split("/").length === 4 ||
      path.endsWith(`/${feature}.module.ts`) ||
      feature === "bootstrap"
        ? "bootstrap"
        : "legacy"),
    path,
  };
}

function layerViolation(
  source: FileInfo,
  target: FileInfo,
): string | undefined {
  if (source.layer === "legacy" || target.layer === "legacy")
    return "production source must use a tactical-DDD layer";
  const permitted: Record<Layer, readonly Layer[]> = {
    domain: ["domain"],
    application: ["domain", "application"],
    infrastructure: ["domain", "application", "infrastructure"],
    presentation: ["domain", "application", "presentation"],
    bootstrap: [
      "domain",
      "application",
      "infrastructure",
      "presentation",
      "bootstrap",
    ],
    legacy: [],
  };
  if (!permitted[source.layer].includes(target.layer))
    return `${source.layer} must not import ${target.layer}`;
  return undefined;
}

function isAllowedCrossFeatureImport(
  source: FileInfo,
  target: FileInfo,
): boolean {
  if (source.layer === "bootstrap") return true;
  const contracts = new Set([
    "apps/api/src/tenant/tenant.contract.ts",
    "apps/api/src/auth/auth.http-contract.ts",
  ]);
  if (contracts.has(target.path)) return true;
  const targetIsRootModule = target.path.endsWith(
    `/${target.feature}.module.ts`,
  );
  return source.layer === "bootstrap" && targetIsRootModule;
}

function isPasswordContractException(
  source: FileInfo,
  target: FileInfo,
): boolean {
  return (
    source.workspace === "api" &&
    source.layer === "application" &&
    target.path === "apps/api/src/platform/password-hasher.ts"
  );
}

function assertFixtureRules(): void {
  const allowed = importViolation(
    fixture("contract", "application", "create-contract.ts"),
    fixture("contract", "domain", "contract.ts"),
    "@/contract/domain/contract",
    true,
  );
  const forbiddenLayer = importViolation(
    fixture("contract", "domain", "contract.ts"),
    fixture("contract", "infrastructure", "prisma-contract.ts"),
    "@/contract/infrastructure/prisma-contract",
    true,
  );
  const forbiddenFeature = importViolation(
    fixture("contract", "application", "create-contract.ts"),
    fixture("auth", "application", "sign-in.ts"),
    "@/auth/application/sign-in",
    true,
  );
  const packageLeak = importViolation(
    join(ROOT, "packages/database/src/index.ts"),
    fixture("contract", "domain", "contract.ts"),
    "apps/api/src/contract/domain/contract",
    true,
  );
  if (allowed || !forbiddenLayer || !forbiddenFeature || !packageLeak)
    failures.push(
      "architecture fixtures: checker rules are not enforcing required dependency shapes",
    );
}

function fixture(feature: string, layer: Layer, name: string): string {
  return join(ROOT, "apps/api/src", feature, layer, name);
}
