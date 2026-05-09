import { Effect } from "effect"
import path from "node:path"
import { mkdir, symlink, unlink } from "node:fs/promises"
import type { LanguageModel } from "ai"
import { Database } from "@/storage/db"
import { Session } from "@/session/session"
import { SessionTable } from "@/session/session.sql"
import { Provider } from "@/provider/provider"
import { extractSessionMeta, aggregate } from "./aggregate"
import { extractFacet, type UsageEvent } from "./facets"
import { generateSections } from "./sections"
import { renderReport } from "./render"
import { reportsDir } from "./paths"
import type { SessionFacets, Sections } from "./schema"

export interface ProgressEvent {
  current: number
  total: number
  label: string
}

/**
 * Real-usage summary of an `Insights.run` invocation. Reflects only the
 * LLM calls that actually happened (cache hits and skipped sections do not
 * contribute). When `withLLM` is `false`, `costUSD`, token counts, and
 * `llmCalls` are all `0`.
 */
export interface RunResult {
  reportPath: string
  durationMs: number
  costUSD: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  reasoningTokens: number
  llmCalls: { facet: number; chunk_summary: number; section: number }
  cachedFacets: number
}

export interface RunOptions {
  days?: number
  projectFilter?: string
  limit?: number
  withLLM: boolean
  model?: LanguageModel
  /**
   * `Provider.Model` metadata (carries `cost.input`/`cost.output`/cache rates
   * per 1M tokens). Used to compute real cost from each LLM call's usage and
   * to pick the >200K-context tier when applicable. Optional even with
   * `withLLM: true`: if missing, the run will still succeed but the returned
   * `costUSD` will be `0`.
   */
  modelMetadata?: Provider.Model
  open: boolean
  /**
   * Optional progress reporter for LLM calls. Total = sessions + 7 sections.
   * Invoked once per facet extraction (cache hit OR fresh call) and once per
   * section. Only emitted when `withLLM` is true.
   */
  onProgress?: (e: ProgressEvent) => void
  /**
   * Called after sessions+metas are loaded but before any LLM work runs.
   * Returns `true` to proceed with LLM extraction, `false` to skip LLM and
   * generate a deterministic-only report (same as `withLLM: false`).
   *
   * Lets the CLI show a cost/time estimate and prompt the user to confirm.
   * No-op when `withLLM: false`.
   */
  onBeforeLLM?: (metas: import("./schema").SessionMeta[]) => Promise<boolean>
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
    const startedAt = Date.now()
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

    // Confirmation gate — caller may inspect the loaded metas (token totals,
    // session counts) and return false to skip the LLM phase entirely.
    const proceedWithLLM =
      opts.withLLM && opts.onBeforeLLM ? yield* Effect.promise(() => opts.onBeforeLLM!(metas.map((m) => m.meta))) : opts.withLLM

    const totalProgress = metas.length + 7
    const progressState = { current: 0 }
    const tick = (label: string) => {
      progressState.current += 1
      opts.onProgress?.({ current: progressState.current, total: totalProgress, label })
    }
    if (proceedWithLLM && opts.onProgress) {
      // Initial 0/N nudge so the bar renders immediately rather than after the
      // first call resolves.
      opts.onProgress({ current: 0, total: totalProgress, label: "facets" })
    }

    // Real-cost accumulator. `onUsage` is invoked once per actual LLM round-
    // trip (cache hits skip it). Each call's usage is fed through the canonical
    // `Session.getUsage` so prices match the rest of the product.
    const usageState = {
      cost: 0,
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      reasoning: 0,
      callsByKind: { facet: 0, chunk_summary: 0, section: 0 } as Record<UsageEvent["kind"], number>,
    }
    const onUsage = (e: UsageEvent) => {
      usageState.callsByKind[e.kind] += 1
      if (!opts.modelMetadata) return
      const u = Session.getUsage({ model: opts.modelMetadata, usage: e.usage, metadata: e.metadata })
      usageState.cost += u.cost
      usageState.input += u.tokens.input
      usageState.output += u.tokens.output
      usageState.cacheRead += u.tokens.cache.read
      usageState.cacheWrite += u.tokens.cache.write
      usageState.reasoning += u.tokens.reasoning
    }

    const facetsMap = new Map<string, SessionFacets>()
    const facetsResult = proceedWithLLM
      ? yield* Effect.gen(function* () {
          if (!opts.model) return yield* Effect.die(new Error("model required when withLLM=true"))
          const model = opts.model
          return yield* Effect.forEach(
            metas,
            (m) =>
              extractFacet({
                meta: m.meta,
                messages: m.messages,
                model,
                onProgress: () => tick("facets"),
                onUsage,
              }),
            { concurrency: 4 },
          )
        })
      : []
    for (const f of facetsResult) {
      if (f) facetsMap.set(f.session_id, f)
    }
    // Cache hits = sessions which produced a facet but did NOT trigger a
    // `facet`-kind usage event (those are LLM round-trips, cache lookups stay
    // silent on `onUsage`).
    const cachedFacets = proceedWithLLM
      ? Math.max(0, facetsResult.filter((f) => f).length - usageState.callsByKind.facet)
      : 0

    const agg = aggregate(
      metas.map((m) => m.meta),
      facetsMap,
    )

    const sections: Sections =
      proceedWithLLM && opts.model
        ? yield* generateSections({
            model: opts.model,
            aggregate: agg,
            facets: [...facetsMap.values()],
            onProgress: () => tick("sections"),
            onUsage,
          })
        : {}

    const html = renderReport({
      aggregate: agg,
      sections,
      generated_at_iso: new Date().toISOString(),
    })

    const reportPath = yield* Effect.promise(async () => {
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

    const result: RunResult = {
      reportPath,
      durationMs: Date.now() - startedAt,
      costUSD: usageState.cost,
      inputTokens: usageState.input,
      outputTokens: usageState.output,
      cacheReadTokens: usageState.cacheRead,
      cacheWriteTokens: usageState.cacheWrite,
      reasoningTokens: usageState.reasoning,
      llmCalls: { ...usageState.callsByKind },
      cachedFacets,
    }
    return result
  })()

export * as Insights from "./insights"
