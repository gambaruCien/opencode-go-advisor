---
name: OpenCode Go Advisor
description: Elige el mejor modelo del plan OpenCode Go (Go o Go Plus) para una tarea concreta, con el esfuerzo de razonamiento recomendado (high/default/low/max) y un respaldo. Úsala cuando pregunten qué modelo usar, cuál es el mejor para una tarea, cómo ahorrar cuota, qué modelo tiene visión o contexto largo, o cuál es el mejor del set de alto volumen (6000+ peticiones cada 5 h).
---

# OpenCode Go Advisor

Ayuda a elegir el modelo correcto de **OpenCode Go** para cada tarea, sin adivinar, según el plan contratado (Go $10 o Go Plus $40), el esfuerzo de razonamiento y el presupuesto de cuota.

## Cuándo usar esta skill

- "¿Qué modelo uso para X?"
- "¿Cuál es el mejor para refactor/frontend/debugging/visión?"
- "¿Cuál conviene para alto volumen / no gastar cuota?"
- "¿Cuál es el mejor del set 6000+?"
- "¿Qué esfuerzo (high/default/low/max) le pongo?"

## Fuente de verdad

El catálogo se mantiene en:

```
~/.config/opencode/opencode-go-advisor/data/catalog.json
```

y el informe legible en:

```
~/.config/opencode/opencode-go-advisor/report/informe-opencode-go.md
```

Ambos se regeneran desde la documentación oficial (`opencode.ai/docs/go`) y el catálogo de la API.

## Flujo de trabajo

1. **Preferí la herramienta MCP.** Si está disponible, llamá a la herramienta MCP `opencode-go-advisor` → `recommend_model` con la tarea. Es la vía más rápida y confiable. La herramienta **se auto-refresca** si el catálogo tiene más de 7 días.
   - Para el set de alto volumen usá `best_high_volume`.
   - Para listar con filtros usá `list_models`.
   - Para una ficha puntual usá `model_detail`.
2. **Si el MCP no está disponible**, leé `data/catalog.json` directamente o ejecutá:
   ```
   node "~/.config/opencode/opencode-go-advisor/refresh.mjs"
   ```
   y después interpretá el `catalog.json` con los criterios de `references/decision-matrix.md`.
3. **Verificá la frescura.** Si el `generatedAt` del catálogo tiene más de 7 días, refrescá antes de responder (paso 2) o llamá a `refresh_catalog`.
4. **Confirmá la variante exacta.** Los `#variant` (p. ej. `#high`) dependen del catálogo de modelos de OpenCode. Antes de afirmar que existe, confirmalo con `/models` o la herramienta de modelos del agente. Si no estás seguro, ofrecé el id sin variante y mencioná el esfuerzo recomendado como texto.
5. **Respondé en el formato de salida** (abajo).

## Cómo elegir (resumen)

- **Default diario:** `DeepSeek V4.1 Flash` (multimodal, agéntico, $60, 26.000 req/5h) o `Hy3` (barato, texto).
- **Mejor del set 6000+:** `DeepSeek V4.1 Flash`; luego `MiMo-V2.6-Flash` y `GLM-5.3-Flash`.
- **Frontend/UI:** `GLM-5.3-Flash` o `Qwen3.8 Max`.
- **Refactor grande / multiarchivo:** `Kimi K3`, `GLM-5.3`, `Hy4 preview`, `MiMo-V2.6-Pro`.
- **Debugging profundo / seguridad:** `DeepSeek V4 Pro`, `GLM-5.3`.
- **Visión/multimodal:** `Qwen3.7 Plus`, `GLM-5.3-Flash`, `MiniMax M3`, `MiMo-V2.6-Flash`.
- **GUI/computer-use:** `MiniMax M3`, `Claude Haiku 5.5`, `Qwen3.7 Plus`.
- **Subagente rápido / resúmenes:** `Claude Haiku 5.5`, `GPT 6 Luna`.
- **Presupuesto cero:** `Step 5 Preview Free`, `LongCat 2.5 Preview Free`.

Regla de esfuerzo: `low`/`no_think` para formato y resúmenes · `high` para multiarchivo · `max`/`xhigh` para arquitectura, debugging profundo y seguridad.

## Privacidad (siempre avisar, nunca excluir)

Los modelos `Muse Spark 1.3/1.2 Contributor` **entrenan modelos de Meta con tus prompts y respuestas** (sin ZDR). **Incluilos siempre en las recomendaciones** y destacá esa modalidad con ⚠️; sugerilos libremente salvo que el usuario haya dicho que el código/datos son propietarios o sensibles. El resto del catálogo está marcado como "no entrena". No excluyas a nadie por defecto.

## Formato de salida

Respondé conciso y accionable:

```
## Recomendación para: <tarea interpretada>
**Modelo:** <Nombre> — `opencode-go/<id>#<variant>`
**Por qué:** <1-2 líneas>
**Esfuerzo:** <high/default/low> — <para qué>
**Respaldo:** <Nombre> — `opencode-go/<id>`
**Cuota:** límite Go $X · ~Y req/5h
**Aviso:** <privacidad u otra advertencia, si aplica>
```

Si el usuario no aclaró el plan, asumí **Go** y mencionalo. Si la tarea es ambigua, preguntá solo lo mínimo (¿texto o con imágenes?, ¿es código propietario?).

## Referencias

- `references/decision-matrix.md` — matriz tarea → modelo, y guía de esfuerzo.
- `lib/metadata.mjs` — capa editorial (editable a mano): calidad, contexto, casos de uso y esfuerzo por modelo.
