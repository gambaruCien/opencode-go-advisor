#!/usr/bin/env node
/**
 * Actualizador — OpenCode Go Advisor
 *
 * Sincroniza el payload con un origen (Git o carpeta local), re-instala con install.mjs
 * y refresca el catálogo. Pensado para que NO tengas que acordarte de actualizar.
 *
 * Uso:
 *   node update.mjs                                   # re-instala el payload local + refresca
 *   node update.mjs --source <git-url>                # baja la última versión y instala
 *   node update.mjs --source "C:/ruta/al/bundle"      # sincroniza desde una carpeta local
 *   node update.mjs --check                           # solo informa versiones
 *   node update.mjs --mirror "C:/ruta/informe.md"
 *
 * Origen por defecto: variable de entorno OPENCODE_GO_ADVISOR_SOURCE.
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

const source = arg("--source") || process.env.OPENCODE_GO_ADVISOR_SOURCE || null;
const mirror = arg("--mirror");
const check = has("--check");

const log = (...a) => console.log("[update]", ...a);
const warn = (...a) => console.warn("[update][WARN]", ...a);
const die = (m) => {
  console.error("[update][ERROR]", m);
  process.exit(1);
};

if (has("--help") || has("-h")) {
  console.log(`Actualizador de OpenCode Go Advisor

  node update.mjs [--source <git-url|carpeta>] [--mirror <ruta>] [--check]

  --source   Origen del payload (git URL o carpeta que contenga payload/ e install.mjs).
             Si se omite, usa OPENCODE_GO_ADVISOR_SOURCE.
  --check    Solo compara versiones, sin instalar.
  --mirror   Ruta donde espejar el informe.`);
  process.exit(0);
}

const cfg = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "opencode");

function readPayloadVersion(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, "payload", "opencode-go-advisor", "package.json"), "utf8")).version ?? "0.0.0";
  } catch {
    return null;
  }
}
function installedVersion(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, "opencode-go-advisor", "package.json"), "utf8")).version ?? null;
  } catch {
    return null;
  }
}
const isGitUrl = (s) => typeof s === "string" && (/^(https?:\/\/|git@|ssh:\/\/)/.test(s) || s.endsWith(".git"));

function syncFromDir(src) {
  if (path.resolve(src) === path.resolve(here)) {
    log("El origen es el propio bundle: se omite la sincronización y solo se re-instala.");
    return;
  }
  const fromPayload = path.join(src, "payload");
  if (!fs.existsSync(fromPayload)) throw new Error(`El origen no tiene 'payload/': ${src}`);
  const toPayload = path.join(here, "payload");
  fs.rmSync(toPayload, { recursive: true, force: true });
  fs.cpSync(fromPayload, toPayload, { recursive: true, force: true });
  for (const f of ["install.mjs", "update.mjs"]) {
    const from = path.join(src, f);
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(here, f));
  }
  log(`Payload sincronizado desde ${src} (v${readPayloadVersion(here) ?? "?"})`);
}

function syncFromGit(url) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "oga-update-"));
  log(`Clonando ${url} ...`);
  const r = spawnSync("git", ["clone", "--depth", "1", url, tmp], { stdio: "inherit" });
  if (r.status !== 0) die("git clone falló. Verificá que git esté instalado y la URL sea correcta.");
  try {
    syncFromDir(tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

log(`Bundle:    v${readPayloadVersion(here) ?? "?"}  (${here})`);
log(`Instalado: v${installedVersion(cfg) ?? "?"}`);

if (source) {
  if (fs.existsSync(source) && fs.statSync(source).isDirectory()) syncFromDir(source);
  else if (isGitUrl(source)) syncFromGit(source);
  else warn(`Origen no reconocido: ${source}. Se ignora.`);
} else {
  warn("Sin --source ni OPENCODE_GO_ADVISOR_SOURCE: no hay de dónde traer una versión nueva (solo se re-instala el payload local y se refrescan los datos).");
}

const newV = readPayloadVersion(here);
if (check) {
  log(`Versión en el bundle: v${newV ?? "?"} · instalada: v${installedVersion(cfg) ?? "?"}`);
  process.exit(0);
}

log("Re-instalando...");
const args = [path.join(here, "install.mjs"), ...(mirror ? ["--mirror", mirror] : [])];
const r = spawnSync(process.execPath, args, { stdio: "inherit" });
if (r.status !== 0) die("install.mjs falló.");
log(`Actualización completa. Versión instalada: v${newV ?? "?"}`);
