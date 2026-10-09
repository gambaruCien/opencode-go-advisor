// lib/report.mjs
// Genera el informe Markdown a partir del catalogo normalizado.
import { HIGH_VOLUME_ORDER } from './metadata.mjs';

const NO = '—';

function money(v) {
  if (v == null) return NO;
  if (v === 0) return 'Gratis';
  return `$${v}`;
}

function limit(v, unlimited) {
  if (unlimited) return 'Ilimitado';
  if (v == null) return NO;
  return `$${v}`;
}

function ctxLabel(t) {
  if (!t) return NO;
  if (t >= 1000000) return `${(t / 1000000).toFixed(t % 1000000 ? 2 : 0)}M`;
  if (t >= 1000) return `${Math.round(t / 1000)}K`;
  return String(t);
}

function req(v) {
  if (v == null) return '∞';
  return String(v);
}

function effort(m) {
  const e = m.editorial?.effort;
  if (!e) return NO;
  return `**${e.default}** · ${e.recommend}`;
}

function table(headers, rows) {
  const head = `| ${headers.join(' | ')} |`;
  const sep = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((r) => `| ${r.join(' | ')} |`).join('\n');
  return `${head}\n${sep}\n${body}`;
}

function highVolumeSet(catalog, plan = 'go', min = 6000) {
  const order = new Map(HIGH_VOLUME_ORDER.map((n, i) => [n, i]));
  return (catalog.models ?? [])
    .filter((m) => {
      const r = m.requests?.[plan]?.per5h;
      return r && (r.unlimited || (r.value != null && r.value >= min));
    })
    .sort((a, b) => {
      const ia = order.has(a.name) ? order.get(a.name) : 99;
      const ib = order.has(b.name) ? order.get(b.name) : 99;
      return ia - ib || (b.editorial?.quality ?? 0) - (a.editorial?.quality ?? 0);
    });
}

export function renderReport(catalog, diff) {
  const L = [];
  const gen = catalog.generatedAt;
  const status = catalog.modelCount;

  L.push('# Informe: Modelos de OpenCode Go');
  L.push('');
  L.push('> **Documento autogenerado.** Se actualiza con `opencode-go-advisor/refresh.mjs` a partir de la documentación oficial de OpenCode. No lo edites a mano: tus cambios se pierden en la próxima actualización. La capa editorial (calidad relativa, contexto, casos de uso) vive en `lib/metadata.mjs`.');
  L.push('');
  L.push(`- **Generado:** ${gen}`);
  L.push(`- **Fuente de datos:** ${catalog.sources.docsRaw}`);
  L.push(`- **Catalogo API:** ${catalog.sources.catalog}`);
  L.push(`- **Modelos:** ${status} (${catalog.liveCount} vivos en el catalogo API)`);
  L.push('');
  L.push('> Los precios, límites, peticiones estimadas, privacidad y endpoints son **datos oficiales**. La columna de calidad y los casos de uso son **juicio editorial** (1-10), no benchmarks oficiales.');
  L.push('');
  L.push('---');
  L.push('');

  // Resumen
  L.push('## 1. Resumen');
  L.push('');
  L.push('| Plan | Precio | Uso incluido |');
  L.push('| --- | --- | --- |');
  L.push(`| **Go** | **$${catalog.plans.go.price}/mes** | Acceso de bajo costo a todos los modelos |`);
  L.push(`| **Go Plus** | **$${catalog.plans.goPlus.price}/mes** | Límites de uso más altos en todos los modelos |`);
  L.push('');
  L.push('**Ventanas de uso:** 5 horas = 20 % del límite mensual · semanal = 50 % · mensual = 100 %. Los límites son **importes mensuales en dólares por modelo**; las "peticiones estimadas" traducen ese límite con un patrón típico de tokens.');
  L.push('');

  // Tabla maestra
  L.push('## 2. Tabla maestra');
  L.push('');
  L.push(table(
    ['Modelo', 'Lab', 'Tipo', 'Mejor para', 'Contexto', 'Esfuerzo (default · recomendado)', 'Límite Go', 'Req/5h Go', 'Rol'],
    (catalog.models ?? []).map((m) => [
      `**${m.name}**`,
      m.editorial?.lab ?? NO,
      m.editorial?.kind ?? NO,
      (m.editorial?.bestFor ?? []).join('; ') || NO,
      ctxLabel(m.editorial?.context),
      effort(m),
      limit(m.monthlyLimit?.go, m.unlimited?.go),
      req(m.requests?.go?.per5h?.unlimited ? null : m.requests?.go?.per5h?.value),
      m.editorial?.role ?? NO,
    ]),
  ));
  L.push('');

  // Tabla especial 6000+
  L.push('## 3. Tabla especial: ~6.000+ peticiones/5 h en el plan Go');
  L.push('');
  L.push('Modelos con **6.000 peticiones estimadas cada 5 h o más** (incluye gratuitos ilimitados). El set se filtra por el valor de Go.');
  L.push('');
  const hv = highVolumeSet(catalog, 'go', 6000);
  L.push(table(
    ['Modelo', 'Lab', 'Req/5h', 'Req/sem', 'Req/mes', 'Límite Go', 'Mejor para', 'Esfuerzo', 'Nota'],
    hv.map((m) => {
      const r = m.requests.go;
      const note = [];
      if (m.free) note.push('Gratis (temporal)');
      if (m.editorial?.trainsData || m.privacy?.training) note.push('⚠️ entrena con tus datos');
      if (m.live === false) note.push('fuera del catálogo API');
      return [
        `**${m.name}**`,
        m.editorial?.lab ?? NO,
        r.per5h.unlimited ? '∞' : r.per5h.value,
        r.perWeek?.unlimited ? '∞' : r.perWeek?.value,
        r.perMonth?.unlimited ? '∞' : r.perMonth?.value,
        limit(m.monthlyLimit?.go, m.unlimited?.go),
        (m.editorial?.bestFor ?? []).join('; ') || NO,
        m.editorial?.effort ? `${m.editorial.effort.default} → ${m.editorial.effort.recommend}` : NO,
        note.join(' · ') || NO,
      ];
    }),
  ));
  L.push('');
  L.push('**Mejor del set en crudo:** DeepSeek V4.1 Flash (calidad + volumen + multimodal + retención 0 días), seguido de MiMo-V2.6-Flash y GLM-5.3-Flash.');
  L.push('**Mejor del set si NO querés exponer datos:** DeepSeek V4.1 Flash. Los modelos marcados con ⚠️ (Muse Spark 1.3/1.2 Contributor) tienen cuota mucho mayor, pero **Meta entrena con tus prompts y respuestas**; usalos solo con código no sensible.');
  L.push('');

  // Limites por modelo (Go y Go Plus)
  L.push('## 4. Límites mensuales y peticiones: Go vs Go Plus');
  L.push('');
  L.push(table(
    ['Modelo', 'Límite Go', 'Req/5h Go', 'Límite Go Plus', 'Req/5h Go Plus', 'Input', 'Output'],
    (catalog.models ?? []).map((m) => [
      m.name,
      limit(m.monthlyLimit?.go, m.unlimited?.go),
      req(m.requests?.go?.per5h?.unlimited ? null : m.requests?.go?.per5h?.value),
      limit(m.monthlyLimit?.goPlus, m.unlimited?.goPlus),
      req(m.requests?.goPlus?.per5h?.unlimited ? null : m.requests?.goPlus?.per5h?.value),
      money(m.prices?.go?.input),
      money(m.prices?.go?.output),
    ]),
  ));
  L.push('');

  // Guia de esfuerzo
  L.push('## 5. Guía de esfuerzo (High / default / etc.)');
  L.push('');
  L.push(table(
    ['Modelo', 'Variantes OpenCode', 'Modos (descriptivo)', 'Default', 'Recomendación'],
    (catalog.models ?? [])
      .filter((m) => m.editorial?.effort)
      .map((m) => [
        m.name,
        (m.variants ?? []).length ? (m.variants.join(' / ')) : 'sin variantes',
        m.editorial.effort.modes,
        m.editorial.effort.default,
        m.editorial.effort.recommend,
      ]),
  ));
  L.push('');
  L.push('**Regla general:** bajo para formato/resúmenes/búsqueda · `high` para multiarchivo · `max`/`xhigh` para arquitectura, debugging profundo y seguridad.');
  L.push('');

  // Privacidad
  L.push('## 6. Privacidad');
  L.push('');
  L.push(table(
    ['Modelo', 'Entrena con tus datos', 'Retención'],
    (catalog.models ?? []).map((m) => [
      m.name,
      (m.privacy?.training ? '**Sí**' : 'No'),
      m.privacy?.retention ?? NO,
    ]),
  ));
  L.push('');

  // Cambios
  L.push('## 7. Cambios respecto a la última actualización');
  L.push('');
  if (!diff || (!diff.added.length && !diff.removed.length && !diff.changed.length)) {
    L.push('Sin cambios detectados en esta actualización.');
  } else {
    if (diff.added.length) L.push(`- **Nuevos:** ${diff.added.join(', ')}`);
    if (diff.removed.length) L.push(`- **Quitados:** ${diff.removed.join(', ')}`);
    if (diff.changed.length) {
      L.push('- **Modificados:**');
      for (const c of diff.changed) L.push(`  - ${c.name}: ${c.deltas.join('; ')}`);
    }
  }
  L.push('');

  // Fichas
  L.push('## 8. Fichas por modelo');
  L.push('');
  for (const m of catalog.models ?? []) {
    const e = m.editorial;
    L.push(`### ${m.name}`);
    L.push('');
    L.push(`- **Lab:** ${e?.lab ?? NO} · **Tipo:** ${e?.kind ?? NO}`);
    L.push(`- **ID OpenCode:** \`${m.providerModel ?? NO}\``);
    L.push(`- **Contexto:** ${ctxLabel(e?.context)} · **Calidad editorial:** ${e?.quality ?? NO}/10`);
    L.push(`- **Mejor para:** ${(e?.bestFor ?? []).join('; ') || NO}`);
    L.push(`- **Esfuerzo:** ${e?.effort ? `${e.effort.modes} · default ${e.effort.default} · ${e.effort.recommend}` : NO}`);
    L.push(`- **Límite Go:** ${limit(m.monthlyLimit?.go, m.unlimited?.go)} · **Req/5h Go:** ${req(m.requests?.go?.per5h?.unlimited ? null : m.requests?.go?.per5h?.value)}`);
    if (m.prices?.go) L.push(`- **Precio Go (in/out):** ${money(m.prices.go.input)} / ${money(m.prices.go.output)} por 1M tokens`);
    L.push(`- **Privacidad:** ${m.privacy?.training ? 'Entrena con tus datos' : 'No entrena'} · retención ${m.privacy?.retention ?? NO}`);
    if (e?.strengths) L.push(`- **Fortalezas:** ${e.strengths}`);
    if (e?.caution) L.push(`- **⚠️ Atención:** ${e.caution}`);
    L.push(`- **Confianza del dato:** ${e?.confidence ?? 'sin ficha editorial'}`);
    L.push('');
  }

  // Endpoints (apendice)
  L.push('## 9. Apéndice: endpoints');
  L.push('');
  L.push(table(
    ['Modelo', 'Model ID', 'Endpoint', 'SDK'],
    (catalog.models ?? []).map((m) => [m.name, m.id ?? NO, m.endpoint ?? NO, m.sdk ?? NO]),
  ));
  L.push('');
  L.push('El id en la config usa el formato `opencode-go/<model-id>` (ej.: `opencode-go/kimi-k3`).');
  L.push('');

  // Notas
  L.push('## 10. Notas de fiabilidad');
  L.push('');
  L.push('- Los benchmarks de cada laboratorio son auto-reportados y no comparables entre sí.');
  L.push('- El ecosistema cambia rápido: verificá `en catalogo API` y la sección de cambios.');
  L.push('- Las "peticiones estimadas" dependen del patrón de tokens; tu consumo real varía.');
  L.push('');
  return L.join('\n');
}
