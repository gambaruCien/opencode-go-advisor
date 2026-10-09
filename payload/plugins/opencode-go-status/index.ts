import { writeFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

// Entrypoint de servidor (obligatorio para el descubrimiento del paquete).
// Es intencionalmente vacio: toda la logica de UI vive en tui.tsx.
try {
  writeFileSync(
    path.join(homedir(), ".config", "opencode", "opencode-go-advisor", "data", "plugin-server.json"),
    new Date().toISOString() + "\n",
  )
} catch {}

export default {
  id: "opencode-go.status",
  setup() {},
}
