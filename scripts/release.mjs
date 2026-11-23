#!/usr/bin/env node
// ============================================================
// scripts/release.mjs — Sincronização e Validação de Versão/Build
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const BUILD_REGEX = /^\d{8}-\d{2}$/;
const VERSION_REGEX = /^\d+\.\d+\.\d+$/;

function getTodayBuildPrefix() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function calculateNextBuild(currentBuild) {
  const prefix = getTodayBuildPrefix();
  if (typeof currentBuild === "string" && currentBuild.startsWith(`${prefix}-`)) {
    const seq = parseInt(currentBuild.slice(prefix.length + 1), 10);
    if (!Number.isNaN(seq)) {
      return `${prefix}-${String(seq + 1).padStart(2, "0")}`;
    }
  }
  return `${prefix}-01`;
}

function bumpVersion(currentVersion, bumpType = "patch") {
  if (!VERSION_REGEX.test(currentVersion)) {
    throw new Error(`Versão atual inválida para bump: "${currentVersion}"`);
  }
  const [major, minor, patch] = currentVersion.split(".").map(Number);
  switch (bumpType) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
    default:
      return `${major}.${minor}.${patch + 1}`;
  }
}

function readJson(relPath) {
  const fullPath = path.join(ROOT_DIR, relPath);
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

function writeJson(relPath, data) {
  const fullPath = path.join(ROOT_DIR, relPath);
  fs.writeFileSync(fullPath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function syncHtmlFile(relPath, version, build, withMetas = false) {
  const fullPath = path.join(ROOT_DIR, relPath);
  let content = fs.readFileSync(fullPath, "utf8");

  // Atualiza ou insere as meta tags
  if (withMetas) {
    const versionMeta = `<meta name="app-version" content="${version}">`;
    const buildMeta = `<meta name="app-build" content="${build}">`;

    if (content.includes('name="app-version"')) {
      content = content.replace(/<meta\s+name=["']app-version["']\s+content=["'][^"']*["']\s*\/?>/i, versionMeta);
    }
    if (content.includes('name="app-build"')) {
      content = content.replace(/<meta\s+name=["']app-build["']\s+content=["'][^"']*["']\s*\/?>/i, buildMeta);
    }

    if (!content.includes('name="app-version"') && !content.includes('name="app-build"')) {
      // Insere logo após o meta viewport
      const viewportRegex = /(<meta\s+name=["']viewport["'][^>]*>)/i;
      if (viewportRegex.test(content)) {
        content = content.replace(viewportRegex, `$1\n  ${versionMeta}\n  ${buildMeta}`);
      }
    }
  }

  // Atualiza todos os ?v= e &v=
  content = content.replace(/([?&]v=)[0-9A-Za-z._-]+/g, `$1${build}`);

  fs.writeFileSync(fullPath, content, "utf8");
}

function performWrite(newVersion, newBuild) {
  if (!VERSION_REGEX.test(newVersion)) {
    throw new Error(`Versão inválida: "${newVersion}". Deve casar ^\\d+\\.\\d+\\.\\d+$`);
  }
  if (!BUILD_REGEX.test(newBuild)) {
    throw new Error(`Build inválido: "${newBuild}". Deve casar ^\\d{8}-\\d{2}$`);
  }

  // 1. version.json
  const versionData = readJson("version.json");
  versionData.version = newVersion;
  versionData.build = newBuild;
  versionData.updatedAt = new Date().toISOString();
  writeJson("version.json", versionData);

  // 2. package.json
  const pkgData = readJson("package.json");
  pkgData.version = newVersion;
  writeJson("package.json", pkgData);

  // 3. HTMLs
  syncHtmlFile("index.html", newVersion, newBuild, true);
  syncHtmlFile("admin.html", newVersion, newBuild, true);
  syncHtmlFile("print.html", newVersion, newBuild, false);

  console.log(`[release] Sincronizado para versão ${newVersion} (build ${newBuild}) com sucesso.`);
}

function performCheck() {
  const errors = [];

  // 1. version.json
  const versionData = readJson("version.json");
  const { version, build, updatedAt } = versionData;

  if (!version || !VERSION_REGEX.test(version)) {
    errors.push(`version.json: campo "version" ("${version}") não casa ^\\d+\\.\\d+\\.\\d+$`);
  }
  if (!build || !BUILD_REGEX.test(build)) {
    errors.push(`version.json: campo "build" ("${build}") não casa ^\\d{8}-\\d{2}$`);
  }
  if (!updatedAt || Number.isNaN(Date.parse(updatedAt))) {
    errors.push(`version.json: campo "updatedAt" ("${updatedAt}") inválido`);
  }

  // 2. package.json
  const pkgData = readJson("package.json");
  if (pkgData.version !== version) {
    errors.push(`package.json: version ("${pkgData.version}") != version.json ("${version}")`);
  }

  // 3. Checagem dos HTMLs
  const htmlFiles = [
    { file: "index.html", metas: true },
    { file: "admin.html", metas: true },
    { file: "print.html", metas: false }
  ];

  for (const { file, metas } of htmlFiles) {
    const fullPath = path.join(ROOT_DIR, file);
    const content = fs.readFileSync(fullPath, "utf8");
    const lines = content.split("\n");

    if (metas) {
      const vMatch = content.match(/<meta\s+name=["']app-version["']\s+content=["']([^"']*)["']/i);
      const bMatch = content.match(/<meta\s+name=["']app-build["']\s+content=["']([^"']*)["']/i);

      if (!vMatch) {
        errors.push(`${file}: tag <meta name="app-version"> ausente`);
      } else if (vMatch[1] !== version) {
        errors.push(`${file}: meta app-version ("${vMatch[1]}") != version.json ("${version}")`);
      }

      if (!bMatch) {
        errors.push(`${file}: tag <meta name="app-build"> ausente`);
      } else if (bMatch[1] !== build) {
        errors.push(`${file}: meta app-build ("${bMatch[1]}") != version.json ("${build}")`);
      }
    }

    // Conferir cada ?v= ou &v=
    lines.forEach((lineText, idx) => {
      const lineNum = idx + 1;
      const queryMatches = lineText.matchAll(/[?&]v=([0-9A-Za-z._-]+)/g);
      for (const m of queryMatches) {
        const tag = m[1];
        if (tag !== build) {
          errors.push(`${file}:${lineNum}: tag ?v="${tag}" != version.json build ("${build}")`);
        }
      }
    });
  }

  // 4. Verificação de monotonicidade em relação ao HEAD do git
  try {
    const gitHeadVersionJson = execFileSync("git", ["show", "HEAD:version.json"], {
      cwd: ROOT_DIR,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"]
    });
    if (gitHeadVersionJson) {
      const headData = JSON.parse(gitHeadVersionJson);
      if (headData.build && BUILD_REGEX.test(headData.build) && BUILD_REGEX.test(build)) {
        if (build < headData.build) {
          errors.push(`Regressão de build: build atual ("${build}") é menor que o HEAD ("${headData.build}")`);
        }
      }
    }
  } catch (e) {
    // Git show falhou (primeiro commit ou arquivo novo) - não bloqueia
  }

  if (errors.length > 0) {
    console.error("[release --check] FALHA: divergências encontradas:");
    errors.forEach((err) => console.error(`  - ${err}`));
    process.exit(1);
  }

  console.log(`[release --check] OK: versão ${version} e build ${build} 100% sincronizados.`);
}

// ---------- CLI ----------
const args = process.argv.slice(2);

if (args.includes("--help") || args.length === 0) {
  console.log(`
Uso do scripts/release.mjs:
  node scripts/release.mjs --check
  node scripts/release.mjs --set <versão> [--build <build>]
  node scripts/release.mjs --bump [major|minor|patch] [--build <build>]
`);
  process.exit(0);
}

if (args.includes("--check")) {
  performCheck();
} else if (args.includes("--set")) {
  const setIdx = args.indexOf("--set");
  const newVersion = args[setIdx + 1];
  if (!newVersion || newVersion.startsWith("--")) {
    console.error("Erro: especifique a versão após --set (ex: --set 3.0.0)");
    process.exit(1);
  }
  let newBuild;
  const buildIdx = args.indexOf("--build");
  if (buildIdx !== -1 && args[buildIdx + 1]) {
    newBuild = args[buildIdx + 1];
  } else {
    const cur = readJson("version.json");
    newBuild = calculateNextBuild(cur.build);
  }
  performWrite(newVersion, newBuild);
  performCheck();
} else if (args.includes("--bump")) {
  const bumpIdx = args.indexOf("--bump");
  const bumpTypeArg = args[bumpIdx + 1];
  const bumpType = ["major", "minor", "patch"].includes(bumpTypeArg) ? bumpTypeArg : "patch";

  const cur = readJson("version.json");
  const newVersion = bumpVersion(cur.version, bumpType);

  let newBuild;
  const buildIdx = args.indexOf("--build");
  if (buildIdx !== -1 && args[buildIdx + 1]) {
    newBuild = args[buildIdx + 1];
  } else {
    newBuild = calculateNextBuild(cur.build);
  }
  performWrite(newVersion, newBuild);
  performCheck();
} else {
  console.error("Erro: comando desconhecido. Use --check, --set ou --bump.");
  process.exit(1);
}
