import { Effect } from "effect"
import * as prompts from "@clack/prompts"
import { effectCmd, fail } from "../effect-cmd"
import { Insights, type ProgressEvent, type RunResult } from "@/insights/insights"
import { reportsDir } from "@/insights/paths"
import { resolveLanguageModel, resolveModelMetadata } from "@/insights/model"
import { estimateLLMCost } from "@/insights/cost"
import { loadCachedFacet } from "@/insights/facets"
import type { Provider } from "@/provider/provider"
import type { SessionMeta } from "@/insights/schema"

const ORANGE = "\x1b[38;5;214m"
const MUTED = "\x1b[0;2m"
const RESET = "\x1b[0m"
const BAR_WIDTH = 36

interface ProgressReporter {
  report: (e: ProgressEvent) => void
  finish: () => void
}

/**
 * Inline progress bar for stderr. Mirrors the SQLite-migration bar in
 * `src/index.ts` (TTY → percent + bar + label, non-TTY → plain lines).
 *
 * Also disables stdin echo for the duration of the bar so stray arrow-key
 * presses don't leak escape sequences (`^[[C^[[D`) into the bar line.
 */
function makeProgressReporter(): ProgressReporter {
  const tty = process.stderr.isTTY
  const state = { last: -1, restoreStdin: false }
  if (tty) {
    process.stderr.write("\x1b[?25l") // hide cursor
    // Disable terminal echo on stdin so accidental keypresses (arrow keys,
    // enter, etc.) don't print escape codes over the bar. We intentionally
    // do NOT touch raw mode — we want Ctrl-C to keep working normally.
    if (process.stdin.isTTY && typeof process.stdin.setRawMode === "function") {
      // setRawMode also suppresses echo. Pair it with `pause()` so stdin
      // bytes are consumed silently rather than queued for the parent shell.
      process.stdin.setRawMode(true)
      process.stdin.pause()
      state.restoreStdin = true
    }
  }

  const report = (e: ProgressEvent) => {
    const percent = e.total > 0 ? Math.floor((e.current / e.total) * 100) : 0
    const final = e.total > 0 && e.current === e.total
    if (percent === state.last && !final) return
    state.last = percent
    if (tty) {
      const fill = Math.round((percent / 100) * BAR_WIDTH)
      const bar = `${"\u25A0".repeat(fill)}${"\u30FB".repeat(BAR_WIDTH - fill)}`
      // Erase the rest of the line (\x1b[K) before redraw — defends against
      // any stray bytes from stdin that managed to land before we paused it.
      process.stderr.write(
        `\r\x1b[K${ORANGE}${bar} ${percent.toString().padStart(3)}%${RESET} ${MUTED}${e.label.padEnd(10)} ${e.current}/${e.total}${RESET}`,
      )
      if (final) process.stderr.write("\n")
      return
    }
    process.stderr.write(`insights-progress: ${percent}% ${e.label} ${e.current}/${e.total}\n`)
  }

  const finish = () => {
    if (tty) process.stderr.write("\x1b[?25h") // show cursor
    if (state.restoreStdin && typeof process.stdin.setRawMode === "function") {
      process.stdin.setRawMode(false)
      process.stdin.resume()
    }
  }

  return { report, finish }
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return `${n}`
}

function formatSeconds(s: number): string {
  if (s < 60) return `~${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  return rem === 0 ? `~${m}m` : `~${m}m ${rem}s`
}

async function detectCachedFacets(metas: SessionMeta[]): Promise<Set<string>> {
  // Probe the on-disk facet cache for every meta in parallel. A hit means
  // `extractFacet` will skip the LLM call and the chunk-summary calls.
  const hits = await Promise.all(
    metas.map(async (m) => ((await loadCachedFacet(m.session_id, m.end_time)) ? m.session_id : null)),
  )
  return new Set(hits.filter((id): id is string => id !== null))
}

function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const totalSec = Math.round(ms / 1000)
  if (totalSec < 60) return `${totalSec}s`
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return s === 0 ? `${m}m` : `${m}m ${s}s`
}

/**
 * Post-run summary printed once Insights.run resolves. Reports actual cost
 * (computed via `Session.getUsage` from each LLM call's token usage) and
 * wall-clock duration. Only called when `withLLM` is true; deterministic
 * runs have nothing useful to summarize here.
 */
function printRunSummary(r: RunResult, modelLabel: string): void {
  const totalCalls = r.llmCalls.facet + r.llmCalls.chunk_summary + r.llmCalls.section
  const callBreakdown = [
    `${r.llmCalls.facet} facet`,
    r.llmCalls.chunk_summary > 0 ? `${r.llmCalls.chunk_summary} chunk` : null,
    `${r.llmCalls.section} section`,
  ]
    .filter((s): s is string => s !== null)
    .join(" + ")
  const cacheLine = r.cachedFacets > 0 ? [`  Cache hits:   ${r.cachedFacets} facet${r.cachedFacets === 1 ? "" : "s"}`] : []
  const lines = [
    "",
    "Run summary:",
    `  Duration:     ${formatDurationMs(r.durationMs)}`,
    `  LLM calls:    ${totalCalls} (${callBreakdown})`,
    ...cacheLine,
    `  Tokens:       ${r.inputTokens.toLocaleString()} in / ${r.outputTokens.toLocaleString()} out` +
      (r.cacheReadTokens > 0 ? ` · ${r.cacheReadTokens.toLocaleString()} cache-read` : ""),
    `  Actual cost:  $${r.costUSD.toFixed(4)} (${modelLabel})`,
    "",
  ]
  process.stderr.write(lines.join("\n"))
}

function printEstimate(
  metas: SessionMeta[],
  model: Provider.Model,
  modelLabel: string,
  cached: ReadonlySet<string>,
): void {
  const e = estimateLLMCost(model, metas, { cachedSessionIds: cached })
  const facetLine =
    e.chunkSummaryCalls > 0
      ? `  Facet calls:     ${e.facetCalls} (+${e.chunkSummaryCalls} chunk summaries)`
      : `  Facet calls:     ${e.facetCalls}`
  const cacheLine = e.cachedFacets > 0 ? [`  Cached facets:   ${e.cachedFacets} (skipped, $0)`] : []
  const lines = [
    "",
    "LLM analysis estimate:",
    `  Sessions:        ${metas.length}`,
    ...cacheLine,
    facetLine,
    `  Section calls:   ${e.sectionCalls}`,
    `  Est. tokens:     ~${formatTokens(e.inputTokens)} input / ~${formatTokens(e.outputTokens)} output`,
    `  Est. cost:       ~$${e.costUSD.toFixed(2)} (${modelLabel})`,
    `  Est. time:       ${formatSeconds(e.estSeconds)}`,
    "",
  ]
  process.stderr.write(lines.join("\n"))
}

const handleModelMissing = <A, R>(eff: Effect.Effect<A, never, R>, requested: string | undefined) =>
  eff.pipe(
    Effect.catchDefect((e) => {
      const msg = e instanceof Error ? e.message : String(e)
      const isModelMissing =
        msg.includes("ProviderModelNotFoundError") || msg.includes("no models found") || msg.includes("no providers found")
      if (!isModelMissing) return Effect.die(e)
      return fail(
        requested
          ? `Model not found: ${requested}. Run 'opencode models' to list available models.`
          : `No default model configured. Pass --model provider/model or set 'model' in config.`,
      )
    }),
  )

export const InsightsCommand = effectCmd({
  command: "insights",
  describe: "generate a usage report from your OpenCode session history",
  builder: (yargs) =>
    yargs
      .option("days", {
        describe: "only sessions from the last N days",
        type: "number",
      })
      .option("project", {
        describe: "project ID filter",
        type: "string",
      })
      .option("limit", {
        describe: "max sessions to analyse",
        type: "number",
      })
      .option("llm", {
        describe: "extract per-session facets and generate narrative sections (use --no-llm to skip)",
        type: "boolean",
        default: true,
      })
      .option("open", {
        describe: "open the report in your browser (use --no-open to skip)",
        type: "boolean",
        default: true,
      })
      .option("model", {
        describe: "model id (provider/model)",
        type: "string",
      })
      .option("yes", {
        describe: "skip the cost-confirmation prompt before LLM analysis",
        type: "boolean",
        default: false,
        alias: "y",
      }),
  handler: Effect.fn("Cli.insights")(function* (args) {
    const withLLM = args.llm

    // Resolve model metadata + LanguageModel up front when LLM mode is on,
    // so that estimation in `onBeforeLLM` has the cost rates available.
    const llmModels = withLLM
      ? yield* Effect.all({
          metadata: handleModelMissing(resolveModelMetadata(args.model), args.model),
          language: handleModelMissing(resolveLanguageModel(args.model), args.model),
        })
      : undefined

    const modelLabel = llmModels ? `${llmModels.metadata.providerID}/${llmModels.metadata.id}` : ""
    const metadata = llmModels?.metadata
    const reporter = withLLM ? makeProgressReporter() : undefined
    const yes = args.yes

    const onBeforeLLM = withLLM
      ? async (metas: SessionMeta[]): Promise<boolean> => {
          if (!metadata) return false
          const cached = await detectCachedFacets(metas)
          printEstimate(metas, metadata, modelLabel, cached)
          if (yes) return true
          if (!process.stderr.isTTY) {
            process.stderr.write(
              "Refusing to run LLM analysis non-interactively without --yes.\n" +
                "Re-run with --yes to confirm, or --no-llm to skip LLM analysis.\n",
            )
            return false
          }
          const ok = await prompts.confirm({
            message: "Continue with LLM analysis?",
            initialValue: false,
          })
          if (prompts.isCancel(ok) || !ok) {
            process.stderr.write("Cancelled — generating deterministic-only report.\n")
            return false
          }
          return true
        }
      : undefined

    const result = yield* Effect.acquireUseRelease(
      Effect.sync(() => reporter),
      (rep) =>
        Insights.run({
          days: args.days,
          projectFilter: args.project,
          limit: args.limit,
          withLLM,
          model: llmModels?.language,
          modelMetadata: llmModels?.metadata,
          open: args.open,
          onProgress: rep ? (e) => rep.report(e) : undefined,
          onBeforeLLM,
        }),
      (rep) => Effect.sync(() => rep?.finish()),
    )

    console.log(`Report written to ${result.reportPath}`)
    if (withLLM) printRunSummary(result, modelLabel)
  }),
})
