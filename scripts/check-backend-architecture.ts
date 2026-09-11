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
  const runtimeViolation = forbiddenRuntimeUsage(source, classify(file));
  if (runtimeViolation)
    failures.push(`${relative(ROOT, file)}: ${runtimeViolation}`);
}

function forbiddenRuntimeUsage(
  source: ts.SourceFile,
  info: FileInfo,
): string | undefined {
  if (!STRICT || !["domain", "application"].includes(info.layer))
    return undefined;
  const forbiddenImports = new Set([
    "@nestjs/common",
    "@nestjs/core",
    "@nestjs/microservices",
    "@commandix/database",
    "@prisma/client",
    "crypto",
    "node:crypto",
    "amqplib",
    "amqp-connection-manager",
    "@commandix/contract-events",
  ]);
  for (const specifier of importSpecifiers(source)) {
    if (forbiddenImports.has(specifier))
      return `${info.layer} must not import ${specifier}`;
  }
  let violation: string | undefined;
  const visit = (node: ts.Node): void => {
    if (violation) return;
    if (
      ts.isIdentifier(node) &&
      ["Bun", "process", "crypto", "Buffer", "console"].includes(node.text)
    )
      violation = `${info.layer} must not use runtime global ${node.text}`;
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "Date" &&
      node.expression.name.text === "now"
    )
      violation = `${info.layer} must not read system time directly`;
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "Date" &&
      !node.arguments?.length
    )
      violation = `${info.layer} must not read system time directly`;
    node.forEachChild(visit);
  };
  source.forEachChild(visit);
  return violation;
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
  if (
    specifier.startsWith("../") &&
    strict &&
    !isLocalTacticalImport(source, target)
  )
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
  | "module"
  | "platform"
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
  const [, workspace, , namespace = "legacy", ...rest] = path.split("/");
  const normalizedWorkspace = workspace === "api" ? "api" : "worker";
  if (namespace === "bootstrap")
    return {
      workspace: normalizedWorkspace,
      feature: "bootstrap",
      layer: "bootstrap",
      path,
    };
  if (namespace === "platform")
    return {
      workspace: normalizedWorkspace,
      feature: "platform",
      layer: "platform",
      path,
    };
  if (namespace !== "modules" || !rest[0])
    return {
      workspace: normalizedWorkspace,
      feature: "legacy",
      layer: "legacy",
      path,
    };
  const [feature, ...featurePath] = rest;
  const layer = featurePath.find((part): part is Layer =>
    ["domain", "application", "infrastructure", "presentation"].includes(part),
  );
  return {
    workspace: normalizedWorkspace,
    feature,
    layer:
      layer ??
      (path.endsWith(`/${feature}.module.ts`) ||
      path.endsWith(".contract.ts") ||
      path.endsWith("-contract.ts")
        ? "module"
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
    module: [
      "domain",
      "application",
      "infrastructure",
      "presentation",
      "module",
    ],
    platform: ["platform"],
    bootstrap: [
      "domain",
      "application",
      "infrastructure",
      "presentation",
      "module",
      "platform",
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
  if (
    source.layer === "bootstrap" &&
    (target.layer === "module" || target.layer === "platform")
  )
    return true;
  const technicalPlatformFiles = new Set([
    "apps/api/src/platform/database.ts",
    "apps/api/src/platform/http.ts",
    "apps/api/src/platform/errors.ts",
    "apps/api/src/platform/runtime-config.ts",
    "apps/api/src/platform/password-hasher.ts",
    "apps/worker/src/platform/database.ts",
    "apps/worker/src/platform/runtime-config.ts",
  ]);
  if (
    technicalPlatformFiles.has(target.path) &&
    !["domain", "application"].includes(source.layer)
  )
    return true;
  if (target.path === "apps/api/src/modules/tenant/tenant.contract.ts")
    return (
      source.workspace === "api" &&
      (source.feature === "auth" ||
        source.path === "apps/api/src/bootstrap/seed.ts")
    );
  if (target.path === "apps/api/src/modules/auth/auth.http-contract.ts")
    return (
      source.workspace === "api" &&
      source.feature !== "auth" &&
      (source.layer === "presentation" || isRootComposition(source))
    );
  if (
    source.path === "apps/api/src/bootstrap/seed.ts" &&
    new Set([
      "apps/api/src/modules/contract/application/seed-workspaces/seed-workspaces.ts",
      "apps/api/src/modules/contract/infrastructure/prisma-seed-workspace.repository.ts",
    ]).has(target.path)
  )
    return true;
  if (
    new Set([
      "apps/api/src/bootstrap/seed-workspaces.ts",
      "apps/api/src/bootstrap/prisma-seed-workspace.repository.ts",
    ]).has(source.path) &&
    target.workspace === "api" &&
    target.feature === "contract" &&
    target.layer === "domain"
  )
    return true;
  return isRootComposition(source) && isFeatureRootModule(target);
}

function isPasswordContractException(
  source: FileInfo,
  target: FileInfo,
): boolean {
  return (
    source.workspace === "api" &&
    new Set([
      "apps/api/src/modules/tenant/application/onboarding/onboarding.service.ts",
      "apps/api/src/modules/auth/application/sign-in/auth.service.ts",
    ]).has(source.path) &&
    target.path === "apps/api/src/platform/password-hasher.ts"
  );
}

function isRootComposition(source: FileInfo): boolean {
  return source.layer === "bootstrap" || source.layer === "module";
}

function isFeatureRootModule(target: FileInfo): boolean {
  return target.layer === "module";
}

function isLocalTacticalImport(source: string, target: string): boolean {
  const sourceFolder = tacticalFolder(source);
  return sourceFolder !== undefined && sourceFolder === tacticalFolder(target);
}

function tacticalFolder(file: string): string | undefined {
  const parts = relative(ROOT, file).replaceAll("\\", "/").split("/");
  const layerIndex = parts.findIndex((part) =>
    ["domain", "application", "infrastructure", "presentation"].includes(part),
  );
  const operation = parts[layerIndex + 1];
  if (layerIndex === -1 || !operation) return undefined;
  return parts.slice(0, layerIndex + 2).join("/");
}

function assertFixtureRules(): void {
  const allowed = importViolation(
    fixture("contract", "application", "create-contract.ts"),
    fixture("contract", "domain", "contract.ts"),
    "@/modules/contract/domain/contract",
    true,
  );
  const forbiddenLayer = importViolation(
    fixture("contract", "domain", "contract.ts"),
    fixture("contract", "infrastructure", "prisma-contract.ts"),
    "@/modules/contract/infrastructure/prisma-contract",
    true,
  );
  const forbiddenFeature = importViolation(
    fixture("contract", "application", "create-contract.ts"),
    fixture("auth", "application", "sign-in.ts"),
    "@/modules/auth/application/sign-in",
    true,
  );
  const packageLeak = importViolation(
    join(ROOT, "packages/database/src/index.ts"),
    fixture("contract", "domain", "contract.ts"),
    "apps/api/src/modules/contract/domain/contract",
    true,
  );
  const allowedPasswordContract = importViolation(
    join(ROOT, "apps/api/src/modules/auth/application/sign-in/auth.service.ts"),
    join(ROOT, "apps/api/src/platform/password-hasher.ts"),
    "@/platform/password-hasher",
    true,
  );
  const rejectedPasswordContract = importViolation(
    fixture("contract", "application", "create-contract.ts"),
    join(ROOT, "apps/api/src/platform/password-hasher.ts"),
    "@/platform/password-hasher",
    true,
  );
  const allowedRootWiring = importViolation(
    join(ROOT, "apps/api/src/modules/contract/contract.module.ts"),
    join(ROOT, "apps/api/src/modules/auth/auth.module.ts"),
    "@/modules/auth/auth.module",
    true,
  );
  const rejectedRootWiring = importViolation(
    join(ROOT, "apps/api/src/bootstrap/app.ts"),
    join(ROOT, "apps/api/src/modules/auth/presentation/access-token.guard.ts"),
    "@/modules/auth/presentation/access-token.guard",
    true,
  );
  const allowedParentRelative = importViolation(
    join(
      ROOT,
      "apps/api/src/modules/contract/application/edit-draft-values/nested/fixture.ts",
    ),
    join(
      ROOT,
      "apps/api/src/modules/contract/application/edit-draft-values/port.ts",
    ),
    "../port",
    true,
  );
  const rejectedParentRelative = importViolation(
    join(
      ROOT,
      "apps/api/src/modules/contract/application/edit-draft-values/nested/fixture.ts",
    ),
    join(
      ROOT,
      "apps/api/src/modules/contract/application/read-contract-detail/query.ts",
    ),
    "../../read-contract-detail/query",
    true,
  );
  const rejectedSeedCrossing = importViolation(
    join(ROOT, "apps/api/src/bootstrap/seed.ts"),
    join(
      ROOT,
      "apps/api/src/modules/contract/presentation/contract.controller.ts",
    ),
    "@/modules/contract/presentation/contract.controller",
    true,
  );
  const directSystemTime = runtimeFixtureViolation("application", "new Date()");
  const directIdGeneration = runtimeFixtureViolation(
    "application",
    "crypto.randomUUID()",
  );
  const rejectedPrismaImport = runtimeFixtureViolation(
    "domain",
    'import { PrismaClient } from "@prisma/client";',
  );
  const rejectedTechnicalImports = [
    "@nestjs/common",
    "amqplib",
    "@commandix/contract-events",
    "node:crypto",
  ].every((specifier) =>
    runtimeFixtureViolation("application", `import value from "${specifier}";`),
  );
  const rejectedRuntimeGlobals = ["Bun", "process", "Buffer", "console"].every(
    (global) => runtimeFixtureViolation("domain", `${global};`),
  );
  if (
    allowed ||
    !forbiddenLayer ||
    !forbiddenFeature ||
    !packageLeak ||
    allowedPasswordContract ||
    !rejectedPasswordContract ||
    allowedRootWiring ||
    !rejectedRootWiring ||
    allowedParentRelative ||
    !rejectedParentRelative ||
    !rejectedSeedCrossing ||
    (STRICT &&
      (!directSystemTime ||
        !directIdGeneration ||
        !rejectedPrismaImport ||
        !rejectedTechnicalImports ||
        !rejectedRuntimeGlobals))
  )
    failures.push(
      "architecture fixtures: checker rules are not enforcing required dependency shapes",
    );
}

function fixture(feature: string, layer: Layer, name: string): string {
  return join(ROOT, "apps/api/src/modules", feature, layer, name);
}

function runtimeFixtureViolation(
  layer: "domain" | "application",
  source: string,
): string | undefined {
  return forbiddenRuntimeUsage(
    ts.createSourceFile("fixture.ts", source, ts.ScriptTarget.Latest, true),
    {
      workspace: "api",
      feature: "fixture",
      layer,
      path: `apps/api/src/modules/fixture/${layer}/fixture.ts`,
    },
  );
}
