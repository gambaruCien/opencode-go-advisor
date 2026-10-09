#!/usr/bin/env node
/**
 * Actualizador — OpenCode Go Advisor
 *
 * Baja la última versión desde un origen (Git o carpeta) y la instala.
 * Pensado para que NO tengas que acordarte de actualizar.
 *
 * Uso:
 *   node update.mjs                                   # re-instala desde el bundle local + refresca datos
 *   node update.mjs --source <git-url>                # clona, instala y refresca
 *   node update.mjs --source "C:/ruta/al/bundle"      # instala desde una carpeta local
 *   node update.mjs --check                           # solo compara versiones
 *   node update.mjs --mirror "C:/ruta/informe.md"
 *
 * Origen por defecto: OPENCODE_GO_ADVISOR_SOURCE o lo guardado en installed.json.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (n, d = null) => {
  const i = argv.indexOf(n);
  return i >= 0 ? (argv[i + 1] ?? d) : d;
};
const has = (n) => argv.includes(n);

const log = (...a) => console.log("[update]", ...a);
const warn = (...a) => console.warn("[update][WARN]", ...a);
const die = (m) => {
  console.error("[update][ERROR]", m);
  process.exit(1);
};

if (has("--help") || has("-h")) {
  console.log(`Actualizador de OpenCode Go Advisor

  node update.mjs [--source <git-url|carpeta>] [--from <bundle>] [--mirror <ruta>] [--check]

  --source   Origen del payload (git URL o carpeta con install.mjs).
             Por defecto: OPENCODE_GO_ADVISOR_SOURCE o installed.json.
  --from     Bundle local con install.mjs (por defecto: sourceDir de installed.json).
  --check    Solo compara versiones, sin instalar.
  --mirror   Ruta donde espejar el informe.`);
  process.exit(0);
}

const cfg = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "opencode");
const marker = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(cfg, "opencode-go-advisor", "data", "installed.json"), "utf8"));
  } catch {
    return {};
  }
})();

const mirror = arg("--mirror");
const check = has("--check");
const source = arg("--source") || process.env.OPENCODE_GO_ADVISOR_SOURCE || marker.source || null;
const localDir = arg("--from") || marker.sourceDir || here;

const isGitUrl = (s) => typeof s === "string" && (/^(https?:\/\/|git@|ssh:\/\/)/.test(s) || s.endsWith(".git"));
const hasInstall = (dir) => {
  try {
    return fs.existsSync(path.join(dir, "install.mjs"));
  } catch {
    return false;
  }
};
function versionIn(dir) {
  for (const p of [
    path.join(dir, "payload", "opencode-go-advisor", "package.json"),
    path.join(dir, "opencode-go-advisor", "package.json"),
  ]) {
    try {
      return JSON.parse(fs.readFileSync(p, "utf8")).version ?? null;
    } catch {}
  }
  return null;
}
function runInstall(dir) {
  const args = [path.join(dir, "install.mjs")];
  if (mirror) args.push("--mirror", mirror);
  if (source) args.push("--source", source);
  log(`Ejecutando ${args[0]} ...`);
  return spawnSync(process.execPath, args, { stdio: "inherit" }).status === 0;
}

log(`Instalado: v${marker.version ?? "?"}`);
log(`Origen:    ${source ?? "(ninguno)"}`);
log(`Bundle:    ${localDir} (v${versionIn(localDir) ?? "?"})`);

// --- --check: solo versiones ---------------------------------------------
if (check) {
  let remoteV = null;
  if (source && isGitUrl(source)) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "oga-check-"));
    if (spawnSync("git", ["clone", "--depth", "1", "--quiet", source, tmp], { stdio: "ignore" }).status === 0) {
      remoteV = versionIn(tmp);
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  } else if (source && fs.existsSync(source) && fs.statSync(source).isDirectory()) {
    remoteV = versionIn(source);
  } else {
    remoteV = versionIn(localDir);
  }
  log(`Disponible: v${remoteV ?? "(desconocido)"}`);
  const upToDate = remoteV && marker.version && remoteV === marker.version;
  log(upToDate ? "Estás al día." : "Hay una versión distinta disponible.");
  process.exit(0);
}

// --- 1) Origen Git: clonar a temp, instalar desde ahí --------------------
if (source && isGitUrl(source)) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "oga-update-"));
  log(`Clonando ${source} ...`);
  const r = spawnSync("git", ["clone", "--depth", "1", source, tmp], { stdio: "inherit" });
  if (r.status !== 0) {
    fs.rmSync(tmp, { recursive: true, force: true });
    die("git clone falló. Verificá git y la URL.");
  }
  try {
    if (!runInstall(tmp)) die("install.mjs falló.");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  log("Actualización completa.");
  process.exit(0);
}

// --- 2) Origen carpeta local con install.mjs -----------------------------
if (source && fs.existsSync(source) && fs.statSync(source).isDirectory() && hasInstall(source)) {
  if (!runInstall(source)) die("install.mjs falló.");
  log("Actualización completa.");
  process.exit(0);
}

// --- 3) Sin origen remoto: re-instalar desde el bundle local -------------
if (hasInstall(localDir)) {
  warn("Sin origen remoto: se re-instala el payload local y se refrescan los datos (no trae versiones nuevas).");
  if (!runInstall(localDir)) die("install.mjs falló.");
  log("Listo.");
  process.exit(0);
}

die("No encontré un origen remoto (--source/OPENCODE_GO_ADVISOR_SOURCE) ni un install.mjs local.");
