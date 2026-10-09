# Roadmap — OpenCode Go Advisor

Plan incremental para incorporar: (1) modelos con entrenamiento de datos incluidos y destacados,
(2) cambio de variante con tecla, (3) % de cuota restante, (4) MCP context7 + enriquecimiento editorial.

Cada fase es independiente y reversible. Orden sugerido: 1 → 2 → 4 → 3 (la 3 depende de investigación).

---

## Fase 1 — Incluir modelos "entrena con tus datos" y destacarlos  ✅ HECHO

**Objetivo:** nunca excluirlos por defecto; mostrarlos con una marca clara.

> Implementado: `exclude_data_training` ahora default **false**; resultados con `dataPolicy`/`trainsData`;
> plugin con marca `⚠`; reporte con dos lecturas; skill y agente actualizados.

**Cambios**
- `lib/recommend.mjs`: `excludeDataTraining` por defecto **false** en `recommend()` y `bestHighVolume()`.
  Cada resultado lleva `dataPolicy: "trains" | "safe"` y un `warning` (no un filtro).
- `mcp-server.mjs`: el parámetro `exclude_data_training` pasa a default **false**; ajustar descripciones.
- `cli-plugins/opencode-go-status/index.tsx`: quitar el filtro `trainsData`; mostrar marca `⚠` en la barra.
- `lib/report.mjs`: reescribir la línea "mejor del set (sin exponer datos propietarios)" →
  dos lecturas: mejor en crudo y mejor si no querés exponer datos.
- `skills/opencode-go-advisor/SKILL.md` y `references/decision-matrix.md`:
  cambiar "NUNCA recomiendes Muse Spark" → "incluilo y destacá la modalidad; sugerilo solo si el usuario acepta".
- `lib/metadata.mjs`: se mantiene `trainsData: true` (ya existe).

**Verificación:** `node refresh.mjs`; `recommend_model` y `best_high_volume` deben listar Muse Spark con `⚠`.
**Riesgo:** bajo. **Rollback:** volver el default a `true`.

---

## Fase 2 — Cambiar la variante con una tecla  ✅ HECHO

**Contexto:** OpenCode ya trae `variant.cycle` en `ctrl+t` y `variant.list`. No duplicar el ciclo.

> Implementado: comando `opencode-go.variant.apply` en `ctrl+alt+v` (aplica la variante recomendada
> al modelo actual, con toast). El built-in `ctrl+t` sigue cicleando.

**Cambios** (en `index.tsx`)
- Comando `opencode-go.variant.apply`: aplica la **variante recomendada** para el último prompt
  (`context.ui.model.variant.set(v)`) y muestra un toast. Tecla propuesta: **`ctrl+alt+v`** (libre en defaults).
- (Opcional) `opencode-go.variant.cycle`: ciclo propio con tecla alternativa.
- Registrar en `context.keymap.layer` dentro de `setup`.

**Verificación:** en una sesión, apretar la tecla; el footer cambia de variante y aparece el toast.
**Riesgo:** bajo (solo si la tecla no colisiona). **Rollback:** quitar el comando del layer.

---

## Fase 3 — % de cuota restante  ❌ DESCARTADA

> Descartada por decisión del usuario: el dato no sería lo bastante fiable y no justifica el gasto de recursos.
> (Investigación: no hay endpoint público de cuota de Go; el uso dentro del plan no cuenta para los budgets.)

**Hallazgos del sondeo:**
- `GET https://opencode.ai/console/api/v1/budgets/members` y `.../api/v2/config` existen pero **requieren token** (401).
- El uso de **Go dentro del plan NO cuenta para los budgets** (ver docs de Budgets). La API de budgets devuelve
  montos en USD del **presupuesto del miembro**, no la cuota por modelo de Go.
- La cuota de Go (20%/50%/100% por modelo) se ve en la consola web (`opencode.ai/auth`); **no hay endpoint público conocido**.

**Opciones a implementar (cuando retomemos):**
- **3b-1 (si configurás un presupuesto):** leer `/api/v1/budgets/members` con el token de consola → mostrar % del presupuesto.
- **3b-2 (cuota Go por modelo):** estimación local acumulando `context.data.session.cost(sessionID)` por modelo vs el
  límite mensual del catálogo, marcada como `~42%` (aproximada).
- Revisar cabeceras de rate-limit del endpoint de inferencia de Go.

**Punto de decisión:** no hay endpoint público conocido de cuota de Go.

**3a. Investigación (primero)**
- Probar `GET https://opencode.ai/console/api/v1/budgets/members` con el token de consola.
- Revisar si el endpoint de inferencia de Go devuelve cabeceras de rate-limit/uso.
- Revisar `GET /api/v2/config` y la consola web.

**3b. Si hay fuente real**
- `lib/usage.mjs`: consulta con el token (`OPENCODE_CONSOLE_TOKEN` o el del provider), caché 5 min,
  devuelve `usado/límite` por modelo.
- Plugin: `Resta 42%` en la barra.
- MCP: nueva herramienta `usage_status`.

**3c. Fallback (si no hay API)**
- Estimación local: acumular `context.data.session.cost(sessionID)` por modelo y comparar con el límite
  mensual del catálogo. Mostrar como `~42%` (aproximado).

**Verificación:** comparar contra la consola web (`opencode.ai/auth`).
**Riesgo:** medio (datos posiblemente aproximados). **Rollback:** ocultar el indicador.

---

## Fase 4 — MCP context7 + enriquecimiento editorial  ✅ HECHO

> Implementado: `context7` agregado y **connected**. Herramientas disponibles: `context7.resolve-library-id`
> y `context7.query-docs`. Nota: para docs de librerías, no para benchmarks de modelos.

**Cambios**
- `opencode mcp add context7 --global --url https://mcp.context7.com/mcp`; si pide auth → `/mcps`.
- Verificar `opencode mcp list`.
- Documentar el flujo: al agregar/actualizar un modelo en `lib/metadata.mjs`, consultar context7 (docs de
  librerías) y complementar benchmarks con websearch/Artificial Analysis.
- (Opcional) script `enrich.mjs` que marca fichas sin actualizar hace N días.

**Nota:** context7 sirve para **docs de librerías**, no para rankings de benchmarks de modelos.
Para benchmarks conviene websearch. Usaremos ambos según el caso.

**Verificación:** `opencode mcp list` muestra `context7 connected`.
**Riesgo:** bajo. **Rollback:** quitar la entrada de `mcp.servers`.

---

## Decisiones abiertas

1. **Tecla de variante:** `ctrl+alt+v` (aplicar recomendada) — recomendado; o `ctrl+alt+shift+v`.
2. **Cuota:** ¿investigo e implemento la API real o arranco con la estimación local?
3. **context7:** instalar ahora (puede pedir login en `/mcps`).
