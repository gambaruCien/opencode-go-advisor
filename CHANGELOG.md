# Changelog

## 1.2.0

- **MCP sin dependencias:** el servidor MCP ahora es JSON-RPC puro sobre stdio (no requiere `@modelcontextprotocol/sdk`). Funciona en cualquier PC con solo Node ≥ 18.
- **Instalación portable con `npx`:** `package.json` con `bin`, para instalar con un solo comando.
- **Actualizador reescrito:** clona el origen (Git o carpeta) y ejecuta su `install.mjs`; no depende de un bundle local.
- **Auto-update:** el plugin ejecuta `update.mjs` en segundo plano cuando hay un origen configurado y el motor supera los 14 días. Recordatorio `↻` a los 30 días.
- Licencia MIT, changelog y README orientados a otros usuarios.

## 1.1.0

- Instalador portable (`install.mjs`) y actualizador (`update.mjs`).
- Marca de instalación (`data/installed.json`) con versión, fecha, origen y espejo.
- El espejo del informe se hereda entre ejecuciones.
- Los modelos que entrenan con tus datos se **incluyen** y se marcan con ⚠️ (ya no se excluyen).
- Cambio de variante con `ctrl+alt+v`.

## 1.0.0

- Motor de catálogo auto-actualizable desde la documentación oficial de OpenCode Go.
- Recomendador (MCP, skill, agente y comando `/mejor-modelo`).
- Plugin de barra de estado con el modelo recomendado en vivo.
