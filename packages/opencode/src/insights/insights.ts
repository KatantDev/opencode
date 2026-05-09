import { Effect } from "effect"
import path from "node:path"
import { mkdir, symlink, unlink } from "node:fs/promises"
import type { LanguageModel } from "ai"
import { Database } from "@/storage/db"
import { Session } from "@/session/session"
import { SessionTable } from "@/session/session.sql"
import { extractSessionMeta, aggregate } from "./aggregate"
import { extractFacet } from "./facets"
import { generateSections } from "./sections"
import { renderReport } from "./render"
import { reportsDir } from "./paths"
import type { SessionFacets, Sections } from "./schema"

export interface RunOptions {
  days?: number
  projectFilter?: string
  limit?: number
  withLLM: boolean
  model?: LanguageModel
  open: boolean
}

/**
 * End-to-end pipeline for a single insights run:
 * - load all sessions from the DB, apply day/project/limit filters
 * - for each filtered session, fetch messages and extract `SessionMeta`
 * - if `withLLM`: extract per-session facets (cached by `end_time`) and
 *   generate the narrative sections via `generateObject` calls
 * - aggregate everything, render to HTML, write `report-<ISO>.html` plus a
 *   `report-latest.html` symlink, optionally `open` it.
 *
 * Returns the absolute path to the timestamped HTML file.
 */
export const run = (opts: RunOptions) =>
  Effect.fn("Insights.run")(function* () {
    const svc = yield* Session.Service
    const allRows = yield* Effect.sync(() =>
      Database.use((db) => db.select().from(SessionTable).all()).map((r) => Session.fromRow(r)),
    )

    const cutoff = opts.days !== undefined ? Date.now() - opts.days * 86_400_000 : 0
    const filtered = allRows
      .filter((s) => (cutoff > 0 ? s.time.updated >= cutoff : true))
      .filter((s) => (opts.projectFilter ? s.projectID === opts.projectFilter : true))
    const sessions = opts.limit ? filtered.slice(0, opts.limit) : filtered

    const metas = yield* Effect.forEach(
      sessions,
      (session) =>
        Effect.gen(function* () {
          const messages = yield* svc.messages({ sessionID: session.id })
          const meta = extractSessionMeta(session, messages)
          return { meta, messages }
        }),
      { concurrency: 20 },
    )

    const facetsMap = new Map<string, SessionFacets>()
    if (opts.withLLM) {
      if (!opts.model) return yield* Effect.die(new Error("model required when withLLM=true"))
      const model = opts.model
      const facets = yield* Effect.forEach(
        metas,
        (m) => extractFacet({ meta: m.meta, messages: m.messages, model }),
        { concurrency: 4 },
      )
      for (const f of facets) facetsMap.set(f.session_id, f)
    }

    const agg = aggregate(
      metas.map((m) => m.meta),
      facetsMap,
    )

    const sections: Sections =
      opts.withLLM && opts.model
        ? yield* generateSections({
            model: opts.model,
            aggregate: agg,
            facets: [...facetsMap.values()],
          })
        : {}

    const html = renderReport({
      aggregate: agg,
      sections,
      generated_at_iso: new Date().toISOString(),
    })

    return yield* Effect.promise(async () => {
      await mkdir(reportsDir(), { recursive: true })
      const stamp = new Date().toISOString().replace(/[:.]/g, "-")
      const file = path.join(reportsDir(), `report-${stamp}.html`)
      await Bun.write(file, html)
      const latest = path.join(reportsDir(), "report-latest.html")
      await unlink(latest).catch(() => {})
      await symlink(path.basename(file), latest).catch(() => {})
      if (opts.open) {
        const cmd = process.platform === "darwin" ? "open" : "xdg-open"
        Bun.spawn([cmd, file])
      }
      return file
    })
  })()

export * as Insights from "./insights"
