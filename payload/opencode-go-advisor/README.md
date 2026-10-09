# OpenCode Go Advisor

Sistema que **mantiene actualizado** el catálogo de modelos de OpenCode Go y **recomienda el mejor modelo para cada tarea**, sin adivinar.

Instalado globalmente en `~/.config/opencode/opencode-go-advisor/`.

## Qué resuelve

- Los modelos y planes de OpenCode Go cambian rápido. Este sistema se **auto-actualiza** desde la documentación oficial y avisa qué cambió.
- Responde "¿qué modelo uso para X?" con el `id` exacto y la **variante de esfuerzo** real de OpenCode.
- Filtra por plan (Go / Go Plus), privacidad, visión, contexto y **volumen (6000+ req/5h)**.

## Componentes

| Componente | Ruta | Función |
| --- | --- | --- |
| Motor | `lib/` | Parser de la doc, metadatos editoriales, motor de recomendación y generador de informe. |
| Actualizador | `refresh.mjs` | Descarga, normaliza, compara y regenera datos + informe. |
| MCP | `mcp-server.mjs` | Servidor MCP local con 6 herramientas. Registrado como `opencode-go-advisor`. |
| MCP externo | `mcp.servers.context7` | Docs de librerías, para enriquecer la capa editorial. |
| Skill | `../skills/opencode-go-advisor/SKILL.md` | Instrucciones para que el agente asesore. |
| Agente | `../agents/model-advisor.md` | Agente `model-advisor` (usa `opencode-go/hy3`). |
| Comando | `../commands/mejor-modelo.md` | Comando `/mejor-modelo <tarea>`. |
| Plugin de TUI | `../plugins/opencode-go-status/` (`index.ts` + `tui.tsx` + `package.json`) | Barra de estado con el modelo recomendado en vivo. |
| Datos | `data/catalog.json` | Catálogo normalizado (fuente de verdad). |
| Diff | `data/last-diff.json` | Cambios desde la última actualización. |
| Informe | `report/informe-opencode-go.md` | Informe legible autogenerado. |
| Espejo | `C:/dev/modelos/informe-opencode-go.md` | Copia del informe (vía `OPENCODE_GO_ADVISOR_MIRROR`). |

## Uso

### Desde el chat
```
/mejor-modelo refactor grande de un monorepo con tests
```

O en lenguaje natural: "¿qué modelo me conviene para analizar capturas de pantalla?".

### Desde la línea de comandos
```sh
# Actualizar catálogo + informe (y el espejo si tiene --out)
node "~/.config/opencode/opencode-go-advisor/refresh.mjs" --out "C:/dev/modelos/informe-opencode-go.md"
```

### Herramientas MCP
- `recommend_model({ task, plan, priority, needs_vision, min_context, min_req_5h, ... })`
- `best_high_volume({ plan, min_req_5h })` → el mejor del set 6000+.
- `list_models({ plan, min_req_5h, free_only, needs_vision, ... })`
- `model_detail({ query })`
- `refresh_catalog({ force })`
- `catalog_status()`

El MCP **se auto-refresca** si el catálogo supera `OPENCODE_GO_ADVISOR_MAX_AGE_DAYS` (7 por defecto).

## Plugin de barra de estado

Paquete de plugin **descubierto** en `~/.config/opencode/plugins/opencode-go-status/`:
`index.ts` (entrypoint de servidor, obligatorio) + `tui.tsx` (la UI) + `package.json` (exports `.` y `./tui`).
No se registra en `cli.json`: OpenCode descubre los paquetes de `<config-global>/plugins/` automáticamente.

Muestra en el footer del prompt:

```
⚡ Go · deepseek-v4.1-flash        (sin tarea detectada: modelo actual)
⚡ sug: GLM-5.3-Flash#max          (modelo actual distinto)
⚡ Kimi K3#max ✓                   (el modelo actual coincide)
⚡ sug: Muse Spark 1.3#high ⚠      (usa tus datos para entrenar)
```

- **Tecla `ctrl+alt+v`:** aplica la **variante recomendada** para tu último prompt al modelo actual (con toast).
  El `ctrl+t` nativo sigue cicleando variantes.
- **Comando de paleta:** "OpenCode Go: ver modelo recomendado" → toast con el `ref` completo y aviso de privacidad.
- Detecta la tarea por palabras clave del último prompt (frontend, refactor, debug, visión, etc.).
- **Incluye** los modelos que entrenan con tus datos y los marca con **⚠** (no los excluye).
- **Refresca el catálogo en segundo plano** si tiene más de 7 días.
- Deja marcas de diagnóstico: `data/plugin-server.json` (entrypoint servidor) y `data/plugin-loaded.json` (TUI).
- Es tolerante a fallos: nunca interrumpe la TUI.

**Requiere reiniciar OpenCode.** Verificación:
```sh
opencode plugin list     # debe listar "opencode-go.status · local"
cat ~/.config/opencode/opencode-go-advisor/data/plugin-loaded.json   # marca al abrir la TUI
```

## Cómo se actualiza

1. **Datos duros** (precios, límites, peticiones estimadas, privacidad, endpoints): se parsean de
   `https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/web/src/content/docs/go.mdx`
   y del catálogo `https://opencode.ai/zen/go/v1/models`. **Automático.**
2. **Capa editorial** (calidad relativa 1-10, contexto, casos de uso, esfuerzo): vive en
   `lib/metadata.mjs`. Es **curada a mano** y cambia poco.
3. **Variantes reales** (`#high`, `#max`, ...): en `lib/metadata.mjs` (`VARIANTS`). Se capturan del
   runtime de OpenCode. La skill verifica en vivo antes de afirmar una variante.

## Mantenimiento

- **Modelo nuevo que aparece:** el refresco lo agrega con `editorial: null`. Se muestra como "sin ficha editorial". Para enriquecerlo, agregá una entrada en `lib/metadata.mjs` con la misma clave (nombre base, sin paréntesis) y volvé a refrescar.
- **Cambió un precio/límite:** se detecta solo y aparece en la sección "Cambios" del informe.
- **Nueva variante:** actualizá `VARIANTS` en `lib/metadata.mjs`.
- **Reordenar preferencias de alto volumen:** editá `HIGH_VOLUME_ORDER` en `lib/metadata.mjs`.

## Archivos que NO se editan a mano

- `data/catalog.json`, `data/last-diff.json`, `report/informe-opencode-go.md` y el espejo: son autogenerados.

## Portabilidad

### Usar desde otra carpeta
No hay que hacer nada: todo es **global** en `~/.config/opencode/`. Abrí OpenCode en cualquier carpeta y tenés:
- la barra de estado en el prompt,
- el comando `/mejor-modelo`,
- el agente `model-advisor`,
- y las herramientas MCP `opencode-go-advisor` + `context7`.

> El único componente atado a una carpeta es el **espejo del informe** (`OPENCODE_GO_ADVISOR_MIRROR`), que apunta a
> `C:/dev/modelos/informe-opencode-go.md`. Si trabajás en otra carpeta y querés el informe ahí, cambiá esa variable
> en la entrada del MCP, o corré el refresh con `--out "<ruta>"`.

### Usar desde otra PC
Se copia la configuración global y se ajustan las rutas absolutas. Elementos a copiar/crear en `~/.config/opencode/`:

| Origen | Destino |
| --- | --- |
| `opencode-go-advisor/` (motor, datos, informe) | `~/.config/opencode/opencode-go-advisor/` |
| `plugins/opencode-go-status/` | `~/.config/opencode/plugins/opencode-go-status/` |
| `skills/opencode-go-advisor/` | `~/.config/opencode/skills/opencode-go-advisor/` |
| `agents/model-advisor.md` | `~/.config/opencode/agents/model-advisor.md` |
| `commands/mejor-modelo.md` | `~/.config/opencode/commands/mejor-modelo.md` |
| entrada `mcp.servers.opencode-go-advisor` + `context7` | en `opencode.jsonc` de la otra PC |

**Ajustes obligatorios en la otra PC:**
1. Requiere **Node.js ≥ 18** (probado en 22) disponible.
2. La entrada MCP usa rutas absolutas de Windows (`C:/Program Files/nodejs/node.exe` y la ruta del
   `mcp-server.mjs`). **Reemplazá ambas** por las de la otra máquina (o usá `node` del PATH).
3. Corré `node ~/.config/opencode/opencode-go-advisor/refresh.mjs` para regenerar `data/catalog.json`.
4. Reiniciá OpenCode y verificá con `opencode plugin list` y `opencode mcp list`.

## Actualización

- **Datos** (modelos, precios, límites, peticiones): se **auto-refrescan**. El MCP lo hace si supera 7 días; el plugin también en segundo plano.
- **Motor/editorial** (lógica, metadatos, plugin, skill): se actualiza con `update.mjs` del bundle de instalación:
  ```sh
  node "<bundle>/update.mjs"                              # re-instala el payload local
  node "<bundle>/update.mjs" --source <git-url|carpeta>   # baja la última versión
  ```
- **Auto-update:** si definís `OPENCODE_GO_ADVISOR_SOURCE`, el plugin ejecuta `update.mjs` en segundo plano cuando el motor supera 14 días.
- **Recordatorio:** la barra muestra `↻` cuando la instalación supera los 30 días (según `data/installed.json`).

## Verificación

```sh
opencode mcp list          # debe mostrar "opencode-go-advisor connected" y "context7 connected"
opencode plugin list       # debe mostrar "opencode-go.status · local"
node "~/.config/opencode/opencode-go-advisor/refresh.mjs"   # refresca y muestra el diff
```

### Si la barra de estado no aparece
1. `opencode plugin list` → si no lista `opencode-go.status`, el paquete no está en `~/.config/opencode/plugins/opencode-go-status/`.
2. Mirá `data/plugin-server.json` (existe si cargó el entrypoint de servidor) y `data/plugin-loaded.json` (existe si cargó la TUI).
3. Revisá el log: `~/.local/share/opencode/log/opencode.log`, buscá `failed to load plugin` o `opencode-go`.
4. Reiniciá OpenCode (la TUI cachea plugins en memoria).
