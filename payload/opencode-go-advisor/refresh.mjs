#!/usr/bin/env node
// refresh.mjs — Actualiza el catalogo y el informe de OpenCode Go.
// Uso: node refresh.mjs [--out <ruta-informe.md>] [--quiet]
import { refresh } from './lib/refresh-core.mjs';

const args = process.argv.slice(2);
function arg(name, def = null) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] ?? def : def;
}
const out = arg('--out');
const quiet = args.includes('--quiet');

try {
  const summary = await refresh({ out, quiet });
  // Resumen legible por stdout (el MCP lo ignora; acá es util para CLI).
  console.log(`Actualizado: ${summary.generatedAt}`);
  console.log(`Modelos: ${summary.models} (${summary.live} vivos en el catalogo API)`);
  console.log(`Nuevos: ${summary.added.join(', ') || 'ninguno'}`);
  console.log(`Quitados: ${summary.removed.join(', ') || 'ninguno'}`);
  console.log(`Modificados: ${summary.changed.map((c) => c.name).join(', ') || 'ninguno'}`);
  console.log(`Catalogo: ${summary.catalogPath}`);
  console.log(`Informe: ${summary.reportPath}`);
} catch (err) {
  console.error(`[advisor] ERROR: ${err.message}`);
  process.exit(1);
}
