# Instalador — OpenCode Go Advisor

Paquete portable para instalar el asesor de modelos de OpenCode Go en cualquier PC con OpenCode.

## Qué instala

| Componente | Destino |
| --- | --- |
| Motor (catálogo + recomendador) | `<config>/opencode-go-advisor/` |
| Plugin de barra de estado | `<config>/plugins/opencode-go-status/` |
| Skill | `<config>/skills/opencode-go-advisor/` |
| Agente `model-advisor` | `<config>/agents/model-advisor.md` |
| Comando `/mejor-modelo` | `<config>/commands/mejor-modelo.md` |
| MCP `opencode-go-advisor` + `context7` | `opencode.jsonc` global |

`<config>` es `%USERPROFILE%\.config\opencode` (Windows) o `~/.config/opencode` (Linux/macOS),
o `$XDG_CONFIG_HOME/opencode` si está definido.

## Requisitos

- **Node.js ≥ 18** (probado en 22). El instalador usa el mismo `node` con el que se ejecuta.
- **OpenCode** en el `PATH` (para registrar los MCP). Si no está, el instalador te deja los comandos a mano.

## Uso

Desde esta carpeta:

```sh
# Instalación normal
node install.mjs

# Con espejo del informe en una carpeta tuya
node install.mjs --mirror "C:/dev/modelos/informe-opencode-go.md"

# Solo copiar archivos, sin tocar la config de MCP
node install.mjs --no-mcp

# Ver el plan sin instalar nada
node install.mjs --dry-run

# Re-registrar los MCP aunque ya existan
node install.mjs --force-mcp
```

> Re-ejecutar el instalador es **seguro e idempotente**:
> - `opencode-go-advisor` se **re-registra siempre** (corrige las rutas absolutas de esta máquina).
> - `context7` se **preserva** si ya existe (mantiene el login OAuth salvo que uses `--force-mcp`).
> - Los archivos se copian y sobreescriben; los datos generados se regeneran.

## Después de instalar

1. **Reiniciá OpenCode.**
2. Verificá:
   ```sh
   opencode plugin list     # debe listar "opencode-go.status"
   opencode mcp list        # debe listar "opencode-go-advisor" y "context7"
   ```
3. Si `context7` pide autenticación, corré `/mcps` en la TUI y completá el login.
4. En la TUI:
   - `/mejor-modelo <tarea>` para una recomendación completa;
   - tecla **`ctrl+alt+v`** para aplicar la variante recomendada;
   - la **barra de estado** del prompt muestra el modelo recomendado (marca ⚠ si entrena con tus datos).

## Llevarlo a otra PC

1. Copiá esta carpeta completa (`opencode-go-advisor-install/`) a la otra PC.
2. Asegurate de tener Node y OpenCode.
3. `node install.mjs` (opcional `--mirror <ruta>`).
4. Reiniciá OpenCode.

El instalador detecta las rutas y usa el `node` y la carpeta de config de esa máquina, así que no hay que
editar JSON a mano.

## Actualizar en el futuro

Los **datos** (modelos, precios, límites) se **auto-refrescan**. Para el **motor/editorial**:

```sh
# Re-instala el payload local y refresca los datos
node update.mjs

# Baja la última versión desde un origen Git/carpeta y la instala
node update.mjs --source "https://github.com/usuario/opencode-go-advisor.git"

# Solo comparar versiones
node update.mjs --check
```

Origen por defecto: variable de entorno `OPENCODE_GO_ADVISOR_SOURCE` (git URL o carpeta local).

### Automatización (para no olvidarte)

1. Publicá este bundle en un repo Git (por ejemplo GitHub).
2. Definí `OPENCODE_GO_ADVISOR_SOURCE=<git-url>` en tu entorno.
3. Con eso, el plugin de barra de estado **auto-actualiza** en segundo plano cuando el motor supera los 14 días.
4. Aun sin origen configurado, la barra muestra **`↻`** cuando la instalación supera los **30 días**, como recordatorio.

## Solución de problemas

- **La barra no aparece:** `opencode plugin list` debe listar `opencode-go.status`. Mirá
  `<config>/opencode-go-advisor/data/plugin-server.json` (cargó el servidor) y `plugin-loaded.json` (cargó la TUI).
- **El MCP no conecta:** revisá que la ruta de `mcp-server.mjs` en `opencode.jsonc` sea la correcta para esa PC
  (el instalador la escribe por vos; si copiaste config de otra máquina, puede quedar vieja).
- **Catálogo vacío:** corré `node "<config>/opencode-go-advisor/refresh.mjs"`.
