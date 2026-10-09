#!/usr/bin/env node
// mcp-server.mjs — Servidor MCP local "opencode-go-advisor".
// Expone herramientas para elegir el mejor modelo de OpenCode Go.
// Protocolo MCP por stdio: los logs van a stderr, nunca a stdout.
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { readCatalog, refresh, CATALOG_PATH } from './lib/refresh-core.mjs';
import { recommend, bestHighVolume, listModels, modelDetail, catalogStatus } from './lib/recommend.mjs';

const log = (...a) => console.error('[opencode-go-advisor]', ...a);
const MAX_AGE_DAYS = Number(process.env.OPENCODE_GO_ADVISOR_MAX_AGE_DAYS || 7);

let refreshing = null;
async function ensureCatalog({ force = false } = {}) {
  let cat = readCatalog();
  const st = catalogStatus(cat, MAX_AGE_DAYS);
  if (force || !cat || st.stale) {
    if (!refreshing) {
      log(force ? 'Refresco forzado del catálogo...' : `Catálogo ausente o con ${st.ageDays} días: refrescando...`);
      refreshing = refresh({ quiet: true })
        .then(() => { refreshing = null; })
        .catch((err) => { refreshing = null; log('Error al refrescar:', err.message); });
    }
    await refreshing;
    cat = readCatalog();
  }
  return cat ?? { models: [], generatedAt: null, modelCount: 0 };
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const bool = (v, def = undefined) => (typeof v === 'boolean' ? v : def);

function fmtRec(r) {
  const lines = [];
  lines.push(`### ${r.rank ? r.rank + '. ' : ''}${r.name}${r.free ? ' (gratis)' : ''}`);
  if (r.ref) lines.push(`- **Usar:** \`${r.ref}\`${r.suggestedVariant ? ` (variant sugerido: ${r.suggestedVariant})` : ''}`);
  if (r.lab || r.kind) lines.push(`- **Lab/tipo:** ${r.lab ?? '?'} · ${r.kind ?? '?'}`);
  if (r.bestFor?.length) lines.push(`- **Mejor para:** ${r.bestFor.join('; ')}`);
  if (r.effort) lines.push(`- **Esfuerzo:** ${r.effort.modes} · default ${r.effort.default} · ${r.effort.recommend}`);
  lines.push(`- **Límite Go:** ${r.unlimited ? 'Ilimitado' : r.monthlyLimit != null ? '$' + r.monthlyLimit : '?'} · **Req/5h Go:** ${r.req5h ?? '?'}`);
  if (r.warnings?.length) lines.push(`- **⚠️** ${r.warnings.join(' ')}`);
  if (r.score != null) lines.push(`- **Puntaje:** ${r.score}`);
  return lines.join('\n');
}

const TOOLS = [
  {
    name: 'recommend_model',
    description: 'Recomienda el mejor modelo de OpenCode Go para una tarea. Devuelve un ranking con el id de modelo y la variante de esfuerzo sugerida.',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Descripción de la tarea (lenguaje natural, español o inglés).' },
        plan: { type: 'string', enum: ['go', 'goPlus'], description: 'Plan contratado. Por defecto: go.' },
        priority: { type: 'string', enum: ['balanced', 'quality', 'cost', 'speed'], description: 'Qué priorizar. Por defecto: balanced.' },
        needs_vision: { type: 'boolean', description: 'La tarea requiere visión/imágenes.' },
        needs_audio: { type: 'boolean', description: 'La tarea requiere audio.' },
        min_context: { type: 'number', description: 'Contexto mínimo en tokens (ej. 1000000).' },
        min_req_5h: { type: 'number', description: 'Mínimo de peticiones estimadas por 5 h (ej. 6000 para alto volumen).' },
        exclude_data_training: { type: 'boolean', description: 'Excluir (true) los modelos que entrenan con tus datos. Por defecto: false (se incluyen y se marcan con ⚠).' },
        limit: { type: 'number', description: 'Cantidad de recomendaciones (1-10). Por defecto: 5.' },
      },
      required: ['task'],
    },
  },
  {
    name: 'best_high_volume',
    description: 'Dado el set de alto volumen (~6000+ peticiones/5h en el plan), devuelve el mejor modelo y el ranking completo.',
    inputSchema: {
      type: 'object',
      properties: {
        plan: { type: 'string', enum: ['go', 'goPlus'] },
        min_req_5h: { type: 'number', description: 'Umbral. Por defecto: 6000.' },
        exclude_data_training: { type: 'boolean', description: 'Excluir (true) los que entrenan con tus datos. Por defecto: false (incluidos y marcados).' },
      },
    },
  },
  {
    name: 'list_models',
    description: 'Lista modelos del catálogo con límites y peticiones estimadas, con filtros.',
    inputSchema: {
      type: 'object',
      properties: {
        plan: { type: 'string', enum: ['go', 'goPlus'] },
        min_req_5h: { type: 'number' },
        free_only: { type: 'boolean' },
        needs_vision: { type: 'boolean' },
        exclude_data_training: { type: 'boolean' },
        only_live: { type: 'boolean', description: 'Solo modelos presentes hoy en el catálogo API.' },
      },
    },
  },
  {
    name: 'model_detail',
    description: 'Ficha completa de un modelo por id (ej. deepseek-v4.1-flash) o por nombre (ej. "Kimi K3").',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  },
  {
    name: 'refresh_catalog',
    description: 'Fuerza la actualización del catálogo y del informe desde la documentación oficial de OpenCode Go. Devuelve el diff (nuevos/quitados/modificados).',
    inputSchema: { type: 'object', properties: { force: { type: 'boolean' } } },
  },
  {
    name: 'catalog_status',
    description: 'Estado del catálogo: fecha, antigüedad, si está viejo y cuántos modelos.',
    inputSchema: { type: 'object', properties: {} },
  },
];

const server = new Server(
  { name: 'opencode-go-advisor', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  try {
    if (name === 'refresh_catalog') {
      await ensureCatalog({ force: true });
      const summary = await refresh({ quiet: true });
      const text = [
        `Catálogo actualizado: ${summary.generatedAt}`,
        `Modelos: ${summary.models} (${summary.live} vivos).`,
        `Nuevos: ${summary.added.join(', ') || 'ninguno'}`,
        `Quitados: ${summary.removed.join(', ') || 'ninguno'}`,
        `Modificados: ${summary.changed.map((c) => `${c.name} (${c.deltas.join('; ')})`).join(' | ') || 'ninguno'}`,
        `Informe: ${summary.reportPath}`,
      ].join('\n');
      return { content: [{ type: 'text', text }] };
    }

    const cat = await ensureCatalog({});

    if (name === 'catalog_status') {
      const st = catalogStatus(cat, MAX_AGE_DAYS);
      return { content: [{ type: 'text', text: JSON.stringify({ ...st, catalogPath: CATALOG_PATH }, null, 2) }] };
    }

    if (name === 'recommend_model') {
      const res = recommend(cat, {
        task: args.task,
        plan: args.plan,
        priority: args.priority,
        needsVision: bool(args.needs_vision),
        needsAudio: bool(args.needs_audio),
        minContext: num(args.min_context) ?? undefined,
        minReq5h: num(args.min_req_5h),
        excludeDataTraining: bool(args.exclude_data_training, false),
        limit: Math.min(Math.max(num(args.limit) ?? 5, 1), 10),
      });
      const head = `Tarea interpretada como: **${res.interpretedAs.join(', ')}** · plan **${res.plan}** · prioridad **${res.priority}**\n`;
      const body = res.recommendations.map((r, i) => fmtRec({ ...r, rank: i + 1 })).join('\n\n');
      return { content: [{ type: 'text', text: head + '\n' + (body || 'Sin candidatos con esos filtros.') }] };
    }

    if (name === 'best_high_volume') {
      const res = bestHighVolume(cat, {
        plan: args.plan,
        minReq5h: num(args.min_req_5h) ?? 6000,
        excludeDataTraining: bool(args.exclude_data_training, false),
      });
      const lines = [];
      if (res.winner) {
        lines.push(`# Mejor del set ${res.minReq5h}+ req/5h (plan ${res.plan})`);
        lines.push('');
        lines.push(`**${res.winner.name}** (\`${res.winner.ref}\`)${res.winner.free ? ' — gratis' : ''}${res.winner.trainsData ? ' ⚠️ entrena con tus datos' : ''}`);
        lines.push(`- Lab: ${res.winner.lab} · Req/5h: ${res.winner.req5h} · Límite: ${res.winner.monthlyLimit != null ? '$' + res.winner.monthlyLimit : 'ilimitado'}`);
        if (res.winner.bestFor?.length) lines.push(`- Mejor para: ${res.winner.bestFor.join('; ')}`);
        if (res.winner.effort) lines.push(`- Esfuerzo: ${res.winner.effort.modes} · ${res.winner.effort.recommend}`);
        if (res.winner.why) lines.push(`- Por qué: ${res.winner.why}`);
        lines.push(`- Excluye entrena-datos: ${res.excludedDataTraining}`);
        lines.push('- Nota: los modelos marcados con ⚠️ usan tus prompts/respuestas para entrenar.');
        lines.push('');
        lines.push('## Ranking del set');
      } else {
        lines.push('No hay candidatos con ese umbral/filtros.');
      }
      for (const r of res.ranking) {
        lines.push(`${r.rank}. **${r.name}** — ${r.req5h} req/5h · ${r.monthlyLimit != null ? '$' + r.monthlyLimit : 'ilimitado'}${r.free ? ' · gratis' : ''}${r.trainsData ? ' · ⚠️ entrena' : ''}${r.ref ? ` · \`${r.ref}\`` : ''}`);
      }
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }

    if (name === 'list_models') {
      const rows = listModels(cat, {
        plan: args.plan,
        minReq5h: num(args.min_req_5h),
        freeOnly: bool(args.free_only, false),
        needsVision: bool(args.needs_vision, false),
        excludeDataTraining: bool(args.exclude_data_training, false),
        onlyLive: bool(args.only_live, false),
      });
      const head = '| Modelo | Ref | Lab | Calidad | Límite Go | Req/5h Go | Req/5h Go+ | Datos |\n| --- | --- | --- | --- | --- | --- | --- | --- |';
      const body = rows
        .map((m) => `| ${m.name} | \`${m.ref}\` | ${m.lab ?? '?'} | ${m.quality ?? '?'} | ${m.limitGo != null ? '$' + m.limitGo : m.free ? 'gratis' : '?'} | ${m.req5hGo ?? '?'} | ${m.req5hGoPlus ?? '?'} | ${m.trainsData ? '⚠️ entrena' : 'ok'} |`)
        .join('\n');
      return { content: [{ type: 'text', text: `${rows.length} modelos.\n\n${head}\n${body}` }] };
    }

    if (name === 'model_detail') {
      const res = modelDetail(cat, args.query);
      if (!res.found) return { content: [{ type: 'text', text: `No encontrado: ${args.query}\nDisponibles: ${res.available.join(', ')}` }] };
      const m = res.model;
      return { content: [{ type: 'text', text: JSON.stringify(m, null, 2) }] };
    }

    return { content: [{ type: 'text', text: `Herramienta desconocida: ${name}` }], isError: true };
  } catch (err) {
    log('Error en herramienta', name, err);
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
log('Servidor MCP listo.');
