// lib/sources.mjs
// Descarga la documentacion oficial y construye el catalogo normalizado.
import {
  parseMarkdownTables, extractTabItems, removeTabItems,
  baseName, tierLabel, parseMoney, parseCount, parseRetention,
} from './parse.mjs';
import { EDITORIAL, VARIANTS } from './metadata.mjs';

export const SOURCES = {
  docsRaw: 'https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/web/src/content/docs/go.mdx',
  docsPage: 'https://opencode.ai/es/go',
  docsGo: 'https://opencode.ai/docs/es/go/',
  catalog: 'https://opencode.ai/zen/go/v1/models',
  dataUsage: 'https://opencode.ai/data/index.json',
};

export async function fetchText(url, { timeout = 30000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'user-agent': 'opencode-go-advisor/1.0 (+https://opencode.ai)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} para ${url}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

export async function fetchLiveIds() {
  try {
    const json = JSON.parse(await fetchText(SOURCES.catalog));
    return (json.data ?? []).map((m) => m.id);
  } catch (err) {
    return { error: String(err) };
  }
}

function findTable(tables, ...cols) {
  return tables.find((t) => cols.every((c) => t.header.includes(c))) ?? null;
}

function ensure(map, name) {
  const key = baseName(name);
  if (!map.has(key)) {
    map.set(key, {
      key,
      name: key,
      id: null,
      sdk: null,
      endpoint: null,
      prices: { go: null, goPlus: null },
      tiers: { go: [], goPlus: [] },
      monthlyLimit: { go: null, goPlus: null },
      unlimited: { go: false, goPlus: false },
      requests: { go: null, goPlus: null },
      privacy: null,
    });
  }
  return map.get(key);
}

function ingestPricing(map, table, plan) {
  if (!table) return;
  for (const row of table.rows) {
    const rec = ensure(map, row['Model']);
    const tier = {
      label: tierLabel(row['Model']),
      input: parseMoney(row['Input']),
      output: parseMoney(row['Output']),
      cachedRead: parseMoney(row['Cached Read']),
      cachedWrite: parseMoney(row['Cached Write']),
      monthlyLimit: parseMoney(row['Monthly limit']),
      unlimited: /unlimited/i.test(row['Monthly limit']),
    };
    rec.tiers[plan].push(tier);
    if (!rec.prices[plan]) rec.prices[plan] = tier;
    if (tier.monthlyLimit != null && rec.monthlyLimit[plan] == null) rec.monthlyLimit[plan] = tier.monthlyLimit;
    if (tier.unlimited) rec.unlimited[plan] = true;
  }
}

function ingestRequests(map, table, plan) {
  if (!table) return;
  for (const row of table.rows) {
    const rec = ensure(map, row['Model']);
    rec.requests[plan] = {
      per5h: parseCount(row['Requests per 5 hours']),
      perWeek: parseCount(row['Requests per week']),
      perMonth: parseCount(row['Requests per month']),
    };
  }
}

function ingestEndpoints(map, table) {
  if (!table) return;
  for (const row of table.rows) {
    const rec = ensure(map, row['Model']);
    rec.id = row['Model ID'] || rec.id;
    rec.endpoint = row['Endpoint'] || rec.endpoint;
    rec.sdk = row['AI SDK Package'] || rec.sdk;
  }
}

function ingestPrivacy(map, table) {
  if (!table) return;
  for (const row of table.rows) {
    const rec = ensure(map, row['Model']);
    rec.privacy = {
      training: /^yes$/i.test(String(row['Model training']).trim()),
      trainingText: String(row['Model training']).trim(),
      retention: String(row['Data retention']).replace(/\\\*/g, '').trim(),
      retentionDays: parseRetention(row['Data retention']),
    };
  }
}

export function buildCatalog(md, liveIds = []) {
  const tabs = extractTabItems(md);
  const goTables = tabs.filter((t) => t.label === 'Go').flatMap((t) => parseMarkdownTables(t.content));
  const plusTables = tabs.filter((t) => t.label === 'Go Plus').flatMap((t) => parseMarkdownTables(t.content));
  const rest = parseMarkdownTables(removeTabItems(md));

  const map = new Map();
  ingestPricing(map, findTable(goTables, 'Input', 'Monthly limit'), 'go');
  ingestPricing(map, findTable(plusTables, 'Input', 'Monthly limit'), 'goPlus');
  ingestRequests(map, findTable(goTables, 'Requests per 5 hours'), 'go');
  ingestRequests(map, findTable(plusTables, 'Requests per 5 hours'), 'goPlus');
  ingestEndpoints(map, findTable(rest, 'Model ID'));
  ingestPrivacy(map, findTable(rest, 'Model training'));

  const live = Array.isArray(liveIds) ? liveIds : [];
  const models = [...map.values()].map((rec) => {
    const ed = EDITORIAL[rec.key] ?? null;
    const free = rec.unlimited.go && (rec.monthlyLimit.go == null);
    return {
      ...rec,
      providerModel: rec.id ? `opencode-go/${rec.id}` : null,
      variants: rec.id ? (VARIANTS[rec.id] ?? []) : [],
      live: rec.id ? live.includes(rec.id) : false,
      free: Boolean(free || ed?.free),
      editorial: ed,
    };
  });

  // Orden estable: por calidad editorial desc, luego por volumen.
  models.sort((a, b) => (b.editorial?.quality ?? 0) - (a.editorial?.quality ?? 0) || a.name.localeCompare(b.name));

  return {
    generatedAt: new Date().toISOString(),
    sources: SOURCES,
    plans: {
      go: { price: 10, currency: 'USD' },
      goPlus: { price: 40, currency: 'USD' },
    },
    windowRules: { per5hPct: 20, perWeekPct: 50, perMonthPct: 100 },
    modelCount: models.length,
    liveCount: live.length,
    liveIds: live,
    models,
  };
}

/** Devuelve un resumen de diferencias entre dos catalogos. */
export function diffCatalogs(prev, next) {
  const byKey = (c) => new Map((c?.models ?? []).map((m) => [m.key, m]));
  const a = byKey(prev);
  const b = byKey(next);
  const added = [];
  const removed = [];
  const changed = [];
  for (const [key, m] of b) {
    if (!a.has(key)) { added.push(m.name); continue; }
    const old = a.get(key);
    const deltas = [];
    const cmp = (label, x, y) => {
      if (x == null && y == null) return;
      if (x !== y && !(Number.isNaN(x) && Number.isNaN(y))) deltas.push(`${label}: ${fmt(x)} -> ${fmt(y)}`);
    };
    cmp('limite Go', old.monthlyLimit?.go, m.monthlyLimit?.go);
    cmp('limite GoPlus', old.monthlyLimit?.goPlus, m.monthlyLimit?.goPlus);
    cmp('req5h Go', old.requests?.go?.per5h?.value, m.requests?.go?.per5h?.value);
    cmp('req5h GoPlus', old.requests?.goPlus?.per5h?.value, m.requests?.goPlus?.per5h?.value);
    cmp('input', old.prices?.go?.input, m.prices?.go?.input);
    cmp('output', old.prices?.go?.output, m.prices?.go?.output);
    const oldLive = old.live, newLive = m.live;
    if (old.id && newLive !== oldLive) deltas.push(`en catalogo API: ${oldLive} -> ${newLive}`);
    if (deltas.length) changed.push({ name: m.name, deltas });
  }
  for (const [key, m] of a) if (!b.has(key)) removed.push(m.name);
  return { at: new Date().toISOString(), added, removed, changed, prevGeneratedAt: prev?.generatedAt ?? null };
}

function fmt(v) {
  if (v == null) return '—';
  return String(v);
}
