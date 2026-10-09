// lib/refresh-core.mjs
// Orquesta: descarga -> construye -> compara -> escribe catalogo + informe.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchText, fetchLiveIds, buildCatalog, diffCatalogs, SOURCES } from './sources.mjs';
import { renderReport } from './report.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const REPORT_DIR = path.join(ROOT, 'report');
export const CATALOG_PATH = path.join(DATA_DIR, 'catalog.json');
export const DIFF_PATH = path.join(DATA_DIR, 'last-diff.json');
export const DEFAULT_REPORT_PATH = path.join(REPORT_DIR, 'informe-opencode-go.md');

export function readCatalog() {
  try {
    return JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  } catch {
    return null;
  }
}

export function readDiff() {
  try {
    return JSON.parse(fs.readFileSync(DIFF_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

export async function refresh({ out = null, quiet = false, writeReport = true } = {}) {
  const log = (...a) => { if (!quiet) console.error(...a); };
  log(`[advisor] Descargando documentación: ${SOURCES.docsRaw}`);
  const md = await fetchText(SOURCES.docsRaw);
  const liveIds = await fetchLiveIds();
  if (!Array.isArray(liveIds)) log(`[advisor] Aviso: no se pudo leer el catálogo API (${liveIds.error}). Se marca "en catalogo API" como desconocido.`);

  const next = buildCatalog(md, Array.isArray(liveIds) ? liveIds : []);
  const prev = readCatalog();
  const diff = diffCatalogs(prev, next);

  writeJson(CATALOG_PATH, next);
  writeJson(DIFF_PATH, diff);

  if (writeReport) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    const report = renderReport(next, diff);
    fs.writeFileSync(DEFAULT_REPORT_PATH, report, 'utf8');
    const mirror = out || process.env.OPENCODE_GO_ADVISOR_MIRROR || null;
    if (mirror) {
      fs.mkdirSync(path.dirname(path.resolve(mirror)), { recursive: true });
      fs.writeFileSync(path.resolve(mirror), report, 'utf8');
      log(`[advisor] Informe copiado a ${path.resolve(mirror)}`);
    }
  }

  const summary = {
    generatedAt: next.generatedAt,
    models: next.modelCount,
    live: next.liveCount,
    added: diff.added,
    removed: diff.removed,
    changed: diff.changed,
    catalogPath: CATALOG_PATH,
    reportPath: DEFAULT_REPORT_PATH,
  };
  log(`[advisor] Listo. ${next.modelCount} modelos (${next.liveCount} vivos). Nuevos: ${diff.added.length}, quitados: ${diff.removed.length}, modificados: ${diff.changed.length}.`);
  return summary;
}
