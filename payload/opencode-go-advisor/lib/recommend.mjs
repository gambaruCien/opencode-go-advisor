// lib/recommend.mjs
// Motor de recomendacion. Lee el catalogo normalizado y sugiere modelos.
import { HIGH_VOLUME_ORDER } from './metadata.mjs';

const strip = (s) =>
  String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const TASK_RULES = [
  { re: /\b(frontend|ui|ux|interfaz|react|vue|css|html|pantalla|screenshot|maqueta|landing|web|componente)\b/, tags: ['frontend'], label: 'frontend/UI' },
  { re: /\b(refactor|refactoriz|multiarchivo|multi-file|migra|reescrib|arquitectura|modulariz)\b/, tags: ['refactor', 'multi-file'], label: 'refactor/multiarchivo' },
  { re: /\b(bug|debug|depura|error|falla|crash|stack ?trace|logs?|incidente)\b/, tags: ['debug'], label: 'debugging' },
  { re: /\b(seguridad|security|vulnerab|cve|pentest|exploit|auditoria|audit)\b/, tags: ['security'], label: 'seguridad' },
  { re: /\b(rapido|rapida|velocidad|latencia|autocomplet|simple|trivial|formato)\b/, tags: ['fast'], label: 'rapido/simple' },
  { re: /\b(barato|cheap|economico|presupuesto|volumen|alto volumen|masivo)\b/, tags: ['cheap', 'high-volume'], label: 'costo/volumen' },
  { re: /\b(imagen|captura|vision|video|multimodal|ocr|pdf|chart|grafico)\b/, tags: ['vision', 'multimodal'], label: 'vision/multimodal' },
  { re: /\b(gui|navegador|browser|computer|click|interfaz grafica)\b/, tags: ['gui', 'computer-use'], label: 'GUI/computer-use' },
  { re: /\b(matematic|algoritmo|math|calculo|logica|demostra)\b/, tags: ['math', 'reasoning'], label: 'matematica/razonamiento' },
  { re: /\b(oficina|excel|ppt|word|ofimatica|hoja de calculo|documento)\b/, tags: ['office'], label: 'ofimatica' },
  { re: /\b(investig|research|analisis|analiza|estudiar)\b/, tags: ['research'], label: 'research/analisis' },
  { re: /\b(resumen|resumir|summary|compaction|compactar|clasific|clasificar|extrae|extraer)\b/, tags: ['docs'], label: 'resumen/clasificacion' },
  { re: /\b(repo grande|codebase|monorepo|gran escala|migracion de repo|contexto largo)\b/, tags: ['long-horizon', 'long-context', 'multi-file'], label: 'repo/contexto grande' },
  { re: /\b(agente|agent|auto(m|t)at|orquest|loop)\b/, tags: ['agentic'], label: 'agentico' },
  { re: /\b(test|testing|prueba)\b/, tags: ['code-daily'], label: 'testing' },
];

const SPEED_SCORE = { 'muy alto': 1, alto: 0.85, medio: 0.55, bajo: 0.25 };

export function catalogStatus(catalog, maxAgeDays = 7) {
  const generatedAt = catalog?.generatedAt ? new Date(catalog.generatedAt) : null;
  const ageMs = generatedAt ? Date.now() - generatedAt.getTime() : Infinity;
  const ageDays = ageMs / 86400000;
  return {
    generatedAt: catalog?.generatedAt ?? null,
    ageDays: Number.isFinite(ageDays) ? Number(ageDays.toFixed(2)) : null,
    stale: !Number.isFinite(ageDays) || ageDays > maxAgeDays,
    maxAgeDays,
    modelCount: catalog?.modelCount ?? 0,
  };
}

export function inferTags(task) {
  const t = strip(task || '');
  const tags = new Set();
  const labels = [];
  for (const r of TASK_RULES) {
    if (r.re.test(t)) { r.tags.forEach((x) => tags.add(x)); labels.push(r.label); }
  }
  const hard = ['refactor', 'multi-file', 'frontend', 'debug', 'security', 'math', 'reasoning', 'long-horizon', 'agentic', 'long-context', 'systems'];
  const easy = ['fast', 'cheap'];
  return {
    tags: [...tags].length ? [...tags] : ['code-daily'],
    labels,
    wantsHard: [...tags].some((x) => hard.includes(x)),
    wantsEasy: [...tags].some((x) => easy.includes(x)) && ![...tags].some((x) => hard.includes(x)),
  };
}

function req5hOf(model, plan) {
  const r = model.requests?.[plan]?.per5h;
  if (!r) return { value: null, unlimited: false };
  return r;
}

function pickVariant(model, wantsHard, wantsEasy) {
  const v = model.variants ?? [];
  if (!v.length) return null;
  const set = new Set(v);
  // Semántica especial: thinking on/off.
  if (set.has('thinking') || (set.has('none') && set.size === 2)) {
    if (set.has('thinking') && wantsHard) return 'thinking';
    if (set.has('none') && (wantsEasy || !wantsHard)) return 'none';
  }
  if (set.has('no_think') && wantsEasy) return 'no_think';
  if (set.has('on') && wantsHard) return 'on';
  if (set.has('off') && wantsEasy) return 'off';
  const hard = ['max', 'xhigh', 'high', 'medium'];
  const easy = ['low', 'minimal', 'none', 'off'];
  const order = wantsHard
    ? [...hard, ...easy]
    : wantsEasy
      ? [...easy, ...hard]
      : ['high', 'medium', 'low', 'max', 'xhigh', 'none'];
  for (const p of order) if (set.has(p)) return p;
  return v[0] ?? null;
}

function cheapnessScore(model) {
  const out = model.prices?.go?.output;
  if (out == null) return 0.5;
  if (out <= 0.4) return 1;
  if (out <= 0.9) return 0.8;
  if (out <= 1.5) return 0.6;
  if (out <= 3) return 0.4;
  return 0.2;
}

function scoreModel(model, ctx) {
  const ed = model.editorial ?? {};
  const q = ed.quality ?? 5;
  const wanted = ctx.tags;
  const tags = ed.tags ?? [];
  const match = wanted.filter((t) => tags.includes(t)).length;
  const matchRatio = wanted.length ? match / wanted.length : 0;
  let s = q;
  if (ctx.priority === 'quality') s = q * 1.5 + matchRatio * 2;
  else if (ctx.priority === 'cost') s = q * 0.6 + matchRatio * 2 + cheapnessScore(model) * 3;
  else if (ctx.priority === 'speed') s = q * 0.7 + matchRatio * 2 + (SPEED_SCORE[ed.speed] ?? 0.5) * 3;
  else s = q + matchRatio * 2.5;
  return s;
}

function passesFilters(model, ctx) {
  const ed = model.editorial ?? {};
  if (ctx.needsVision && !(ed.tags ?? []).some((t) => ['vision', 'multimodal'].includes(t))) return false;
  if (ctx.needsAudio && !(ed.tags ?? []).includes('audio')) return false;
  if (ctx.excludeDataTraining && (ed.trainsData || model.privacy?.training)) return false;
  if (ctx.onlyLive && model.live === false) return false;
  if (ctx.freeOnly && !model.free) return false;
  if (ctx.minContext && (ed.context ?? 0) < ctx.minContext) return false;
  const r5 = req5hOf(model, ctx.plan);
  if (ctx.minReq5h != null && !r5.unlimited && !(r5.value != null && r5.value >= ctx.minReq5h)) return false;
  if (ctx.maxReq5h != null && (r5.unlimited || (r5.value != null && r5.value > ctx.maxReq5h))) return false;
  return true;
}

export function recommend(catalog, opts = {}) {
  const ctx = {
    plan: opts.plan === 'goPlus' ? 'goPlus' : 'go',
    priority: opts.priority || 'balanced',
    needsVision: !!opts.needsVision,
    needsAudio: !!opts.needsAudio,
    excludeDataTraining: opts.excludeDataTraining === true, // por defecto false: incluir y solo destacar
    onlyLive: !!opts.onlyLive,
    freeOnly: !!opts.freeOnly,
    minContext: opts.minContext ?? 0,
    minReq5h: opts.minReq5h ?? null,
    maxReq5h: opts.maxReq5h ?? null,
    limit: opts.limit ?? 5,
  };
  const inferred = inferTags(opts.task || '');
  ctx.tags = inferred.tags;

  const ranked = (catalog?.models ?? [])
    .filter((m) => passesFilters(m, ctx))
    .map((m) => {
      const variant = pickVariant(m, inferred.wantsHard, inferred.wantsEasy);
      const r5 = req5hOf(m, ctx.plan);
      return {
        name: m.name,
        id: m.id,
        ref: m.providerModel ? m.providerModel + (variant ? `#${variant}` : '') : null,
        quality: m.editorial?.quality ?? null,
        lab: m.editorial?.lab ?? null,
        kind: m.editorial?.kind ?? null,
        bestFor: m.editorial?.bestFor ?? [],
        effort: m.editorial?.effort ?? null,
        suggestedVariant: variant,
        monthlyLimit: m.monthlyLimit?.[ctx.plan] ?? null,
        unlimited: !!m.unlimited?.[ctx.plan],
        req5h: r5.unlimited ? 'ilimitado' : r5.value,
        free: !!m.free,
        trainsData: !!m.editorial?.trainsData || !!m.privacy?.training,
        dataPolicy: (m.editorial?.trainsData || m.privacy?.training) ? 'trains' : 'safe',
        warnings: [m.editorial?.caution, (m.editorial?.trainsData || m.privacy?.training) ? 'Entrena con tus datos: no usar con codigo propietario.' : null].filter(Boolean),
        score: Number(scoreModel(m, ctx).toFixed(2)),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, ctx.limit);

  return {
    task: opts.task ?? null,
    interpretedAs: inferred.labels.length ? inferred.labels : ['uso general'],
    tags: inferred.tags,
    plan: ctx.plan,
    priority: ctx.priority,
    generatedAt: catalog?.generatedAt ?? null,
    recommendations: ranked,
  };
}

export function bestHighVolume(catalog, opts = {}) {
  const plan = opts.plan === 'goPlus' ? 'goPlus' : 'go';
  const min = opts.minReq5h ?? 6000;
  const excludeDataTraining = opts.excludeDataTraining === true;
  const candidates = (catalog?.models ?? []).filter((m) => {
    const r5 = req5hOf(m, plan);
    const big = r5.unlimited || (r5.value != null && r5.value >= min);
    if (!big) return false;
    if (excludeDataTraining && (m.editorial?.trainsData || m.privacy?.training)) return false;
    return true;
  });
  const order = new Map(HIGH_VOLUME_ORDER.map((n, i) => [n, i]));
  candidates.sort((a, b) => {
    const ia = order.has(a.name) ? order.get(a.name) : 99;
    const ib = order.has(b.name) ? order.get(b.name) : 99;
    return ia - ib || (b.editorial?.quality ?? 0) - (a.editorial?.quality ?? 0);
  });
  const list = candidates.map((m, i) => ({
    rank: i + 1,
    name: m.name,
    id: m.id,
    ref: m.providerModel,
    req5h: req5hOf(m, plan).unlimited ? 'ilimitado' : req5hOf(m, plan).value,
    monthlyLimit: m.monthlyLimit?.[plan] ?? null,
    free: !!m.free,
    trainsData: !!m.editorial?.trainsData || !!m.privacy?.training,
    lab: m.editorial?.lab ?? null,
    bestFor: m.editorial?.bestFor ?? [],
    effort: m.editorial?.effort ?? null,
    why: m.editorial?.strengths ?? null,
  }));
  return {
    plan,
    minReq5h: min,
    excludedDataTraining: excludeDataTraining,
    winner: list[0] ?? null,
    ranking: list,
  };
}

export function listModels(catalog, opts = {}) {
  const plan = opts.plan === 'goPlus' ? 'goPlus' : 'go';
  const min = opts.minReq5h ?? null;
  return (catalog?.models ?? [])
    .filter((m) => {
      const r5 = req5hOf(m, plan);
      if (min != null && !r5.unlimited && !(r5.value != null && r5.value >= min)) return false;
      if (opts.freeOnly && !m.free) return false;
      if (opts.excludeDataTraining && (m.editorial?.trainsData || m.privacy?.training)) return false;
      if (opts.needsVision && !(m.editorial?.tags ?? []).some((t) => ['vision', 'multimodal'].includes(t))) return false;
      if (opts.onlyLive && m.live === false) return false;
      return true;
    })
    .map((m) => ({
      name: m.name,
      id: m.id,
      ref: m.providerModel,
      lab: m.editorial?.lab ?? null,
      quality: m.editorial?.quality ?? null,
      context: m.editorial?.context ?? null,
      limitGo: m.monthlyLimit?.go ?? null,
      limitGoPlus: m.monthlyLimit?.goPlus ?? null,
      req5hGo: req5hOf(m, 'go').unlimited ? '∞' : req5hOf(m, 'go').value,
      req5hGoPlus: req5hOf(m, 'goPlus').unlimited ? '∞' : req5hOf(m, 'goPlus').value,
      free: !!m.free,
      live: m.live,
      trainsData: !!m.editorial?.trainsData || !!m.privacy?.training,
      bestFor: m.editorial?.bestFor ?? [],
    }))
    .sort((a, b) => (b.quality ?? 0) - (a.quality ?? 0));
}

export function modelDetail(catalog, query) {
  const q = strip(query);
  const models = catalog?.models ?? [];
  let m = models.find((x) => x.id && strip(x.id) === q);
  if (!m) m = models.find((x) => strip(x.name) === q);
  if (!m) m = models.find((x) => (x.id && strip(x.id).includes(q)) || strip(x.name).includes(q));
  if (!m) return { found: false, query, available: models.map((x) => x.name) };
  return { found: true, model: m };
}
