import { Plugin } from "@opencode/plugin/tui"
import { createSignal } from "solid-js"
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { spawn } from "node:child_process"
import { homedir } from "node:os"
import path from "node:path"

// ---------------------------------------------------------------------------
// Plugin de barra de estado: muestra el modelo recomendado de OpenCode Go para
// el ultimo prompt de la sesion y si el modelo actual coincide.
// Autocontenido: lee data/catalog.json del asesor. Nunca debe romper la TUI.
// ---------------------------------------------------------------------------

const ADVISOR_DIR = path.join(homedir(), ".config", "opencode", "opencode-go-advisor")
const CATALOG_PATH = path.join(ADVISOR_DIR, "data", "catalog.json")
const PLAN = process.env.OPENCODE_GO_ADVISOR_PLAN === "goPlus" ? "goPlus" : "go"
const RELOAD_MS = 10 * 60 * 1000

type Model = any

const RULES: Array<[RegExp, string[]]> = [
  [/frontend|\bui\b|interfaz|captura|screenshot|react|vue|css|html|componente/i, ["frontend"]],
  [/refactor|multiarchivo|multi-file|migra|reescrib|arquitect/i, ["refactor", "multi-file"]],
  [/bug|debug|depura|error|falla|crash|trazas|\blog\b/i, ["debug"]],
  [/seguridad|security|vulnerab|cve|exploit|auditor/i, ["security"]],
  [/resumen|resumir|summary|compaction|clasific|extrae/i, ["docs"]],
  [/imagen|captura|visi[oó]n|video|pdf|ocr|multimodal|gr[aá]fico|chart/i, ["vision", "multimodal"]],
  [/gui|navegador|browser|computer|click/i, ["gui", "computer-use"]],
  [/matem|algoritmo|\bmath\b|c[aá]lculo|l[oó]gica/i, ["math", "reasoning"]],
  [/oficina|excel|ppt|word|ofim/i, ["office"]],
  [/investig|research|an[aá]lisis|analizar|estudiar/i, ["research"]],
  [/agente|agent|automat|orquest|loop/i, ["agentic"]],
  [/r[aá]pido|velocidad|latencia|autocomplet|simple/i, ["fast"]],
]

const HARD = new Set([
  "refactor", "multi-file", "frontend", "debug", "security", "math",
  "reasoning", "long-horizon", "agentic", "long-context", "systems",
])

function inferTags(text: string): string[] {
  const tags = new Set<string>()
  for (const [re, t] of RULES) if (re.test(text)) for (const x of t) tags.add(x)
  if (tags.size === 0) tags.add("code-daily")
  return [...tags]
}

function pickVariant(model: Model, tags: string[]): string | null {
  const v: string[] = model?.variants ?? []
  if (!v.length) return null
  const set = new Set(v)
  const hard = tags.some((t) => HARD.has(t))
  if (set.has("thinking") && hard) return "thinking"
  if (set.has("none") && set.has("thinking")) return hard ? "thinking" : "none"
  if (set.has("none") && v.length === 2) return hard ? (v.find((x) => x !== "none") ?? null) : "none"
  const order = hard
    ? ["max", "xhigh", "high", "medium", "low"]
    : ["low", "medium", "high"]
  for (const p of order) if (set.has(p)) return p
  return v[0] ?? null
}

function quickRecommend(text: string, models: Model[]) {
  const tags = inferTags(text)
  let best: Model | null = null
  let bestScore = -1
  for (const m of models) {
    const e = m?.editorial
    if (!e) continue
    const mt: string[] = e.tags ?? []
    const match = tags.filter((t) => mt.includes(t)).length
    const score = (e.quality ?? 5) + match * 1.5
    if (score > bestScore) {
      bestScore = score
      best = m
    }
  }
  if (!best) return null
  return {
    model: best,
    variant: pickVariant(best, tags),
    tags,
    trains: Boolean(best.editorial?.trainsData || best.privacy?.training),
  }
}

function extractText(content: any): string {
  if (!content) return ""
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    return content.filter((p: any) => p?.type === "text").map((p: any) => p.text).join(" ")
  }
  return ""
}

function lastUserText(messages: any[]): string {
  if (!Array.isArray(messages)) return ""
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    const role = m?.role ?? m?.type
    if (role === "user") {
      const t = m?.text ?? extractText(m?.content)
      if (t) return String(t)
    }
  }
  return ""
}

export default Plugin.define({
  id: "opencode-go.status",

  setup(context: any) {
    const [hint, setHint] = createSignal<{ name: string; id: string; ref: string; variant: string | null; trains: boolean; tags: string[] } | null>(null)

    let catalog: Model[] = []
    let loadedAt = 0
    const loadCatalog = () => {
      try {
        const st = statSync(CATALOG_PATH)
        if (catalog.length && st.mtimeMs === loadedAt && Date.now() - loadedAt < RELOAD_MS) return
        const data = JSON.parse(readFileSync(CATALOG_PATH, "utf8"))
        catalog = data.models ?? []
        loadedAt = st.mtimeMs
      } catch {
        // Catalogo aun no generado; se reintenta luego.
      }
    }
    loadCatalog()

    // Estado de instalacion (para recordatorio y auto-update).
    let engineStale = false
    let sourceDir: string | null = null
    try {
      const inst = JSON.parse(readFileSync(path.join(ADVISOR_DIR, "data", "installed.json"), "utf8"))
      sourceDir = inst.sourceDir ?? null
      if (inst.installedAt) {
        engineStale = (Date.now() - new Date(inst.installedAt).getTime()) / 86400000 > 30
      }
    } catch {
      // Sin marca (instalacion previa a esta funcion).
    }

    // Mantenimiento en segundo plano: actualiza el motor (si hay origen) o refresca datos.
    const maybeMaintain = () => {
      const source = process.env.OPENCODE_GO_ADVISOR_SOURCE
      if (source && sourceDir) {
        const updater = path.join(sourceDir, "update.mjs")
        try {
          const inst = JSON.parse(readFileSync(path.join(ADVISOR_DIR, "data", "installed.json"), "utf8"))
          const age = inst?.installedAt ? (Date.now() - new Date(inst.installedAt).getTime()) / 86400000 : 999
          if (existsSync(updater) && age > 14) {
            spawn(process.execPath, [updater, "--source", source], { detached: true, stdio: "ignore", windowsHide: true }).unref()
            return
          }
        } catch {
          // Si falla, seguimos con el refresco de datos.
        }
      }
      try {
        const st = statSync(CATALOG_PATH)
        if (Date.now() - st.mtimeMs < 7 * 86400000) return
      } catch {
        // Sin catalogo: igual intentamos generarlo.
      }
      try {
        spawn(process.execPath, [path.join(ADVISOR_DIR, "refresh.mjs")], { detached: true, stdio: "ignore", windowsHide: true }).unref()
      } catch {
        // Silencioso.
      }
    }
    maybeMaintain()

    // Marca de que el plugin cargo (util para diagnostico).
    try {
      writeFileSync(
        path.join(ADVISOR_DIR, "data", "plugin-loaded.json"),
        JSON.stringify({ at: new Date().toISOString(), plan: PLAN, models: catalog.length }) + "\n",
      )
    } catch {
      // Sin permiso de escritura: no es critico.
    }

    let lastKey = ""
    const compute = async (sessionID?: string) => {
      if (!sessionID || !catalog.length) return
      try {
        const messages: any[] = await context.client.session.context({ sessionID })
        const text = lastUserText(messages ?? [])
        if (!text) return
        const key = text.slice(0, 240)
        if (key === lastKey) return
        lastKey = key
        const rec = quickRecommend(text, catalog)
        if (!rec || !rec.model) {
          setHint(null)
          return
        }
        setHint({
          name: rec.model.name ?? rec.model.id,
          id: rec.model.id ?? "",
          ref: rec.model.providerModel ?? "",
          variant: rec.variant,
          trains: rec.trains,
          tags: rec.tags,
        })
      } catch {
        // Silencioso: el plugin no debe interferir con la sesion.
      }
    }

    const stop = context.data.listen((event: any) => {
      try {
        const details = event?.details ?? {}
        const type = String(details.type ?? event?.type ?? "")
        const sid = details?.data?.sessionID
        if (sid && /inbox|message|session\.(created|updated|idle|execution)/.test(type)) {
          void compute(sid)
        }
      } catch {
        // Ignorar eventos mal formados.
      }
    })

    const unregister = context.ui.slot({
      append: "prompt.footer.status",
      render: () => {
        const current = context.ui.model.current()
        const currentID = current?.modelID ?? ""
        const currentTxt = currentID ? `${currentID}${current.variant ? "#" + current.variant : ""}` : ""
        const upd = engineStale ? " ↻" : ""
        const h = hint()
        if (!h) {
          return currentTxt ? <text fg={context.theme.text.base}>{`⚡ Go · ${currentTxt}${upd}`}</text> : null
        }
        const matches = Boolean(currentID) && currentID === h.id
        const variant = h.variant ? "#" + h.variant : ""
        const mark = h.trains ? " ⚠" : ""
        const text = matches
          ? `⚡ ${h.name}${variant}${mark} ✓${upd}`
          : `⚡ sug: ${h.name}${variant}${mark}${upd}`
        return (
          <text fg={context.theme.text.base}>
            {text}
          </text>
        )
      },
    })

    // Comando de paleta para ver la recomendacion completa.
    try {
      context.keymap.layer(() => ({
        mode: "global",
        commands: [
          {
            id: "opencode-go.suggest",
            title: "OpenCode Go: ver modelo recomendado",
            group: "OpenCode Go",
            palette: true,
            run: () => {
              const h = hint()
              if (!h) {
                context.ui.toast.show({ message: "Todavia no detecte una tarea en esta sesion." })
                return
              }
              context.ui.toast.show({
                title: "Modelo recomendado (OpenCode Go)",
                message: `${h.name}${h.variant ? "#" + h.variant : ""}${h.trains ? " (⚠ entrena con tus datos)" : ""} → ${h.ref}`,
                variant: "info",
              })
            },
          },
          {
            id: "opencode-go.variant.apply",
            title: "OpenCode Go: aplicar variante recomendada",
            group: "OpenCode Go",
            palette: true,
            bind: "ctrl+alt+v",
            run: () => {
              const h = hint()
              if (!h) {
                context.ui.toast.show({ message: "Todavia no detecte una tarea en esta sesion." })
                return
              }
              const variants: string[] = context.ui.model.variant.list() ?? []
              if (!variants.length) {
                context.ui.toast.show({ message: "El modelo actual no expone variantes." })
                return
              }
              const pick = pickVariant({ variants }, h.tags) ?? variants[0]
              const ok = context.ui.model.variant.set(pick)
              context.ui.toast.show({
                title: "OpenCode Go",
                message: ok ? `Variante → ${pick}` : `No se pudo aplicar la variante ${pick}`,
                variant: ok ? "success" : "warning",
              })
            },
          },
        ],
      }))
    } catch {
      // Sin comando si la capa no esta disponible.
    }

    return () => {
      try { stop?.() } catch {}
      try { unregister?.() } catch {}
    }
  },
})
