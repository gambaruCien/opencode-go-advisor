// lib/parse.mjs
// Utilidades puras para parsear la documentacion MDX de OpenCode Go.

/** Extrae todas las tablas Markdown de un texto. */
export function parseMarkdownTables(md) {
  const lines = String(md).split(/\r?\n/);
  const tables = [];
  let cur = [];
  const flush = () => {
    if (cur.length >= 2) tables.push(rowsToObjects(cur));
    cur = [];
  };
  for (const line of lines) {
    if (/^\s*\|.*\|\s*$/.test(line)) cur.push(line);
    else flush();
  }
  flush();
  return tables;
}

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

function isSeparator(cells) {
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c.replace(/\s/g, '')));
}

function rowsToObjects(rows) {
  const header = splitRow(rows[0]);
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = splitRow(rows[i]);
    if (isSeparator(cells)) continue;
    const obj = {};
    header.forEach((h, idx) => {
      obj[h] = cells[idx] ?? '';
    });
    out.push(obj);
  }
  return { header, rows: out };
}

/** Devuelve los bloques <TabItem label="...">...</TabItem> en orden. */
export function extractTabItems(md) {
  const re = /<TabItem\s+label="([^"]+)"\s*>([\s\S]*?)<\/TabItem>/g;
  const items = [];
  let m;
  while ((m = re.exec(md))) items.push({ label: m[1], content: m[2] });
  return items;
}

/** Quita los bloques TabItem para dejar solo el contenido comun. */
export function removeTabItems(md) {
  return String(md).replace(/<TabItem\s+label="[^"]+"\s*>[\s\S]*?<\/TabItem>/g, '');
}

/** Nombre canonico de un modelo: sin negritas, sin HTML y sin parentesis. */
export function baseName(name) {
  return String(name)
    .replace(/\*\*/g, '')
    .replace(/<br\s*\/?>[\s\S]*$/i, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Etiqueta de tier entre parentesis, p. ej. "<= 256K tokens" o "Peak". */
export function tierLabel(name) {
  const m = String(name).match(/\(([^)]*)\)/);
  return m ? m[1].trim() : null;
}

/** "$0.15" -> 0.15 · "Free" -> 0 · "-" o "" -> null */
export function parseMoney(v) {
  if (v == null) return null;
  const s = String(v).replace(/\*\*/g, '').replace(/<br\s*\/?>[\s\S]*$/i, '').trim();
  if (/^free$/i.test(s)) return 0;
  if (/^-+$/.test(s) || s === '') return null;
  const m = s.match(/-?\$?\s*([0-9]+(?:\.[0-9]+)?)/);
  return m ? Number(m[1]) : null;
}

/** "6,320" -> {value:6320,unlimited:false} · "Unlimited" -> {value:null,unlimited:true} */
export function parseCount(v) {
  const s = String(v).replace(/\*\*/g, '').replace(/,/g, '').trim();
  if (/unlimited/i.test(s)) return { value: null, unlimited: true };
  const m = s.match(/([0-9]+)/);
  return { value: m ? Number(m[1]) : null, unlimited: false };
}

/** Días de retencion: "0 days" -> 0, "30 days" -> 30, "Not ZDR" -> null */
export function parseRetention(v) {
  const s = String(v).replace(/\\\*/g, '').trim();
  if (/not\s+zdr/i.test(s)) return null;
  const m = s.match(/([0-9]+)/);
  return m ? Number(m[1]) : null;
}
