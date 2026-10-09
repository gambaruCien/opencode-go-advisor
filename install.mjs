#!/usr/bin/env node
/**
 * Instalador portable — OpenCode Go Advisor
 *
 * Copia el motor, el plugin de barra de estado, la skill, el agente y el comando
 * a la configuración global de OpenCode, regenera el catálogo y registra los MCP.
 *
 * Uso:
 *   node install.mjs [--mirror <ruta-informe.md>] [--force-mcp] [--no-mcp] [--dry-run] [--target <dir-cfg>]
 *
 * Ejemplos:
 *   node install.mjs
 *   node install.mjs --mirror "C:/dev/modelos/informe-opencode-go.md"
 *   node install.mjs --no-mcp          # solo copia archivos, sin tocar la config de MCP
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const payload = path.join(here, "payload");

const argv = process.argv.slice(2);
const arg = (n, d = null) => {
  const i = argv.indexOf(n);
  return i >= 0 ? (argv[i + 1] ?? d) : d;
};
const has = (n) => argv.includes(n);

const mirror = arg("--mirror");
const sourceArg = arg("--source") || process.env.OPENCODE_GO_ADVISOR_SOURCE || null;
const skipMcp = has("--no-mcp");
const forceMcp = has("--force-mcp");
const dryRun = has("--dry-run");

const log = (...a) => console.log("[install]", ...a);
const warn = (...a) => console.warn("[install][WARN]", ...a);
const die = (m) => {
  console.error("[install][ERROR]", m);
  process.exit(1);
};

// --- Requisitos -----------------------------------------------------------
const major = Number(process.versions.node.split(".")[0]);
if (major < 18) die(`Se requiere Node >= 18 (actual ${process.version}).`);
if (!fs.existsSync(payload)) die(`No encuentro el payload en ${payload}. Corré el instalador desde su carpeta.`);

// --- Destino --------------------------------------------------------------
const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
const cfg = arg("--target") || path.join(base, "opencode");

log(`Node:   ${process.execPath} (${process.version})`);
log(`Destino: ${cfg}`);
// Heredar espejo y origen de una instalación previa si no se pasan explícitamente.
let prevMarker = {};
try {
  prevMarker = JSON.parse(fs.readFileSync(path.join(cfg, "opencode-go-advisor", "data", "installed.json"), "utf8"));
} catch {}
const effMirror = mirror || prevMarker.mirror || null;
const effSource = sourceArg || prevMarker.source || null;
if (effMirror) log(`Espejo del informe: ${path.resolve(effMirror)}${!mirror && prevMarker.mirror ? " (heredado)" : ""}`);
if (effSource) log(`Origen configurado: ${effSource}${!sourceArg && prevMarker.source ? " (heredado)" : ""}`);

if (dryRun) {
  log("dry-run: no se modifica nada. Este es el plan de instalación.");
  log("  - copiar payload/opencode-go-advisor  -> " + path.join(cfg, "opencode-go-advisor"));
  log("  - copiar payload/plugins/...          -> " + path.join(cfg, "plugins"));
  log("  - copiar payload/skills/...           -> " + path.join(cfg, "skills"));
  log("  - copiar payload/agents/...           -> " + path.join(cfg, "agents"));
  log("  - copiar payload/commands/...         -> " + path.join(cfg, "commands"));
  log("  - regenerar data/catalog.json");
  if (!skipMcp) log("  - registrar MCP opencode-go-advisor y context7 (global)");
  process.exit(0);
}

// --- Helpers de copia -----------------------------------------------------
function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true });
}
function copyTree(src, dest) {
  if (!fs.existsSync(src)) return warn(`Falta en el payload: ${path.relative(here, src)}`);
  ensureDir(path.dirname(dest));
  fs.cpSync(src, dest, { recursive: true, force: true });
  log(`→ ${path.relative(cfg, dest) || dest}`);
}
function copyFile(src, dest) {
  if (!fs.existsSync(src)) return warn(`Falta en el payload: ${path.relative(here, src)}`);
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
  log(`→ ${path.relative(cfg, dest)}`);
}

// --- 1) Motor -------------------------------------------------------------
copyTree(path.join(payload, "opencode-go-advisor"), path.join(cfg, "opencode-go-advisor"));
// Copiar el actualizador al motor instalado (para auto-update y uso offline).
try {
  const updaterSrc = path.join(here, "update.mjs");
  if (fs.existsSync(updaterSrc)) {
    ensureDir(path.join(cfg, "opencode-go-advisor"));
    fs.copyFileSync(updaterSrc, path.join(cfg, "opencode-go-advisor", "update.mjs"));
    log("→ opencode-go-advisor/update.mjs");
  }
} catch (e) {
  warn(`No pude copiar update.mjs: ${e.message}`);
}
// Regenerar datos locales (paths absolutos incluidos en el catalogo son irrelevantes, pero limpiamos).
fs.rmSync(path.join(cfg, "opencode-go-advisor", "data"), { recursive: true, force: true });
fs.rmSync(path.join(cfg, "opencode-go-advisor", "report"), { recursive: true, force: true });
ensureDir(path.join(cfg, "opencode-go-advisor", "data"));

// --- 2) Plugin, skill, agente, comando ------------------------------------
copyTree(path.join(payload, "plugins", "opencode-go-status"), path.join(cfg, "plugins", "opencode-go-status"));
copyTree(path.join(payload, "skills", "opencode-go-advisor"), path.join(cfg, "skills", "opencode-go-advisor"));
copyFile(path.join(payload, "agents", "model-advisor.md"), path.join(cfg, "agents", "model-advisor.md"));
copyFile(path.join(payload, "commands", "mejor-modelo.md"), path.join(cfg, "commands", "mejor-modelo.md"));

// --- 3) Refresco inicial --------------------------------------------------
const refresh = path.join(cfg, "opencode-go-advisor", "refresh.mjs");
log("Generando catálogo inicial...");
const rr = spawnSync(process.execPath, [refresh, ...(effMirror ? ["--out", effMirror] : [])], { stdio: "inherit" });
if (rr.status !== 0) warn(`El refresh inicial falló (código ${rr.status}). Corré luego: node "${refresh}"`);

// --- 3b) Marca de instalación (recordatorio / auto-update) ----------------
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(cfg, "opencode-go-advisor", "package.json"), "utf8"));
  const marker = {
    version: pkg.version ?? "0.0.0",
    installedAt: new Date().toISOString(),
    sourceDir: here,
    source: effSource,
    mirror: effMirror ? path.resolve(effMirror) : null,
  };
  fs.writeFileSync(path.join(cfg, "opencode-go-advisor", "data", "installed.json"), JSON.stringify(marker, null, 2) + "\n");
  log(`Marcador de instalación: v${marker.version} → data/installed.json`);
} catch (e) {
  warn(`No pude escribir installed.json: ${e.message}`);
}

// --- 4) MCP ---------------------------------------------------------------
const q = (s) => `"${String(s)}"`;
function runOpencode(args) {
  const line = ["opencode", ...args.map(q)].join(" ");
  const r = spawnSync(line, { shell: true, stdio: "inherit" });
  return r.status === 0;
}
function opencodeAvailable() {
  return spawnSync("opencode --version", { shell: true, stdio: "ignore" }).status === 0;
}
function configFile() {
  for (const f of ["opencode.jsonc", "opencode.json"]) {
    const p = path.join(cfg, f);
    if (fs.existsSync(p)) return p;
  }
  return null;
}
function configHasMcp(name) {
  const p = configFile();
  if (!p) return false;
  try {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`"${esc}"\\s*:`).test(fs.readFileSync(p, "utf8"));
  } catch {
    return false;
  }
}

const manualMcp = [];
if (skipMcp) {
  log("--no-mcp: omito la configuración de MCP.");
} else if (!opencodeAvailable()) {
  warn("No encontré 'opencode' en el PATH. Agregá los MCP a mano (ver README).");
} else {
  const nodeExe = process.execPath.replace(/\\/g, "/");
  const mcpServer = path.join(cfg, "opencode-go-advisor", "mcp-server.mjs").replace(/\\/g, "/");

  const addAdvisor = () => {
    const args = ["mcp", "add", "opencode-go-advisor", "--global", "--env", "OPENCODE_GO_ADVISOR_MAX_AGE_DAYS=7"];
    if (effMirror) args.push("--env", `OPENCODE_GO_ADVISOR_MIRROR=${path.resolve(effMirror).replace(/\\/g, "/")}`);
    args.push("--", nodeExe, mcpServer);
    return runOpencode(args);
  };
  const addContext7 = () => runOpencode(["mcp", "add", "context7", "--global", "--url", "https://mcp.context7.com/mcp"]);

  // opencode-go-advisor: upsert SIEMPRE, para corregir las rutas absolutas de esta máquina.
  log("Registrando MCP 'opencode-go-advisor' (upsert)...");
  if (!addAdvisor()) {
    warn("No pude registrar 'opencode-go-advisor'.");
    manualMcp.push(`opencode mcp add opencode-go-advisor --global --env OPENCODE_GO_ADVISOR_MAX_AGE_DAYS=7${effMirror ? ` --env "OPENCODE_GO_ADVISOR_MIRROR=${path.resolve(effMirror).replace(/\\/g, "/")}"` : ""} -- "${nodeExe}" "${mcpServer}"`);
  }

  // context7: solo si falta (o con --force-mcp). Preserva el login OAuth existente.
  if (configHasMcp("context7") && !forceMcp) {
    log("MCP 'context7' ya existe: lo dejo igual (usá --force-mcp para re-registrarlo).");
  } else if (!addContext7()) {
    warn("No pude registrar 'context7'.");
    manualMcp.push("opencode mcp add context7 --global --url https://mcp.context7.com/mcp");
  }
}

// --- 5) Resumen -----------------------------------------------------------
console.log("");
console.log("============================================================");
console.log(" OpenCode Go Advisor instalado");
console.log("============================================================");
console.log(` Motor:    ${path.join(cfg, "opencode-go-advisor")}`);
console.log(` Plugin:   ${path.join(cfg, "plugins", "opencode-go-status")}`);
console.log(` Skill:    ${path.join(cfg, "skills", "opencode-go-advisor")}`);
console.log(` Agente:   ${path.join(cfg, "agents", "model-advisor.md")}`);
console.log(` Comando:  ${path.join(cfg, "commands", "mejor-modelo.md")}`);
console.log("");
console.log(" Próximos pasos:");
console.log("  1) Reiniciá OpenCode.");
console.log("  2) Verificá:  opencode plugin list   y   opencode mcp list");
console.log("  3) Si context7 pide login:  /mcps  en la TUI.");
console.log("  4) En la TUI:  /mejor-modelo <tarea>   ·   tecla ctrl+alt+v");
if (manualMcp.length) {
  console.log("");
  console.log(" Si algún MCP no quedó registrado, corré a mano:");
  for (const m of manualMcp) console.log(`   ${m}`);
}
console.log("============================================================");
