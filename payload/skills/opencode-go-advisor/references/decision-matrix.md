# Matriz de decisión — OpenCode Go

> Capa editorial. Se puede editar a mano. Los datos duros (precios, límites,
> peticiones) se actualizan solos en `data/catalog.json`.

## Tarea → primera opción / alternativas

| Tarea | Primera opción | Alternativas | Esfuerzo |
| --- | --- | --- | --- |
| Frontend / UI desde captura | GLM-5.3-Flash | Qwen3.8 Max, Hy4 preview, Kimi K3 | `max`/`high` |
| Refactor grande / multiarchivo | Kimi K3 | GLM-5.3, Hy4 preview, DeepSeek V4 Pro, MiMo-V2.6-Pro | `high`–`max` |
| Debugging profundo / sistemas | DeepSeek V4 Pro | GLM-5.3, Hy4 preview, MiMo-V2.6-Pro, MiniMax M3 | `max` |
| Código diario rápido (texto) | Hy3 | Kimi K2.7 Code, DeepSeek V4.1 Flash, GPT 6 Luna | `high` / `no_think` |
| Alto volumen / subagentes | DeepSeek V4.1 Flash | MiMo-V2.6-Flash, GPT 6 Luna, Claude Haiku 5.5 | `medium`/`high` |
| Visión / multimodal | Qwen3.7 Plus | GLM-5.3-Flash, MiniMax M3, MiMo-V2.6-Flash | `high` + thinking on |
| Computer-use / GUI | MiniMax M3 | Claude Haiku 5.5, Qwen3.7 Plus, Kimi K3 | `high` |
| Auditoría de codebase (1M) | GLM-5.2 | GLM-5.3, Kimi K3, LongCat-2.0 | `high` |
| Seguridad / vulnerabilidades | GLM-5.3 | MiMo-V2.6-Pro, Hy4 preview | `max` |
| Matemática / razonamiento duro | GLM-5.3 | DeepSeek V4 Pro, Qwen3.8 Max, Hy4 preview | `max` |
| Ofimática / logs / Excel-PPT | MiniMax M2.7 | GLM-5.3-Flash, Claude Haiku 5.5 | `medium`/`high` |
| Revisión de repos largos | Space Bunny | Kimi K3, GLM-5.3 | `medium`/`high` |
| Resúmenes / compaction | Claude Haiku 5.5 | GPT 6 Luna, Qwen3.8 Flash | `low`/`medium` |
| Prototipado visual | Grok 4.6 | Grok 4.7, Qwen3.8 Max | `high` |
| Presupuesto cero | Step 5 Preview Free | LongCat 2.5 Preview Free, LongCat-2.0 | variable |

## Set de alto volumen (6000+ req/5h en Go)

Orden de preferencia (incluye todos; los ⚠️ entrenan con tus datos):

1. **DeepSeek V4.1 Flash** — 26.000 req/5h, multimodal, agéntico, retención 0 días.
2. **MiMo-V2.6-Flash** — 30.100 req/5h, omnimodal (incl. audio).
3. **GLM-5.3-Flash** — 6.320 req/5h, el mejor para frontend/visión del set.
4. **DeepSeek V4 Flash** — 13.000 req/5h, legacy.
5. **LongCat-2.0** — 11.400 req/5h, repo-level muy barato.
6. **DeepSeek V4 Flash Vision Exp** — 6.500 req/5h, nicho de visión.
7. **MiMo-V2.5** — 30.100 req/5h, barato.
8. **Step 5 Preview Free** / **LongCat 2.5 Preview Free** — ilimitados, temporales.
9. **Muse Spark 1.3/1.2 Contributor** — 45.300 req/5h, pero **entrena con tus datos**.

## Guía de esfuerzo

| Si el modelo expone... | Usá |
| --- | --- |
| `low / high / max` (GLM, Kimi K3, DeepSeek Pro) | `high` diario; `max` para lo difícil |
| `no_think / low / high` (Hy) | `high` en código/math; `no_think` en consultas |
| `low / medium / high / xhigh` (Grok, Muse Spark) | `high`; `xhigh` lo más difícil |
| thinking on/off (MiniMax, Qwen, DeepSeek V4.1, MiMo) | on para código/agente; off para latencia |
| `none…max` (GPT 6 Luna) | `medium` rápido; `high` multiarchivo; `max` SWE |
| effort adaptable (Claude Haiku 5.5) | `low`/`medium` volumen; `high`/`xhigh` subagente |

Regla: subí el esfuerzo para tareas de varios pasos, arquitectura o depuración; bajalo para resúmenes, formato y autocompletado.
