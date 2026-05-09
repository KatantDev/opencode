import type { SessionMeta } from "./schema"

// Per-call heuristics — calibrated against the prompts in `facets.ts` and
// `sections.ts`. These are estimates, not measurements: actual token use
// varies with transcript length and LLM verbosity. We deliberately keep
// these constants conservative so the displayed estimate skews slightly
// high rather than surprising the user.
const FACET_INPUT_TOKENS = 30_000 // upper cap when transcript fully fits
const FACET_OUTPUT_TOKENS = 2_000
const SECTION_INPUT_TOKENS = 5_000
const SECTION_OUTPUT_TOKENS = 1_500
const SECTIONS_COUNT = 7
const CHUNK_SUMMARY_INPUT_TOKENS = 25_000
const CHUNK_SUMMARY_OUTPUT_TOKENS = 500

// Mirrors `transcript.ts` constants (chars). 1 token ~= 4 chars for English
// prose / source code, which is good enough for a first-pass estimate.
const TRANSCRIPT_INLINE_CHAR_LIMIT = 30_000
const TRANSCRIPT_CHUNK_CHARS = 25_000
const CHARS_PER_TOKEN = 4

// Concurrency from `Effect.forEach({ concurrency: 4 })` in facets/sections.
const CONCURRENCY = 4
const AVG_CALL_SECONDS = 8

export interface CostModelLike {
  cost: {
    input: number
    output: number
    cache: { read: number; write: number }
  }
}

export interface CostEstimate {
  facetCalls: number
  sectionCalls: number
  chunkSummaryCalls: number
  cachedFacets: number
  totalCalls: number
  inputTokens: number
  outputTokens: number
  costUSD: number
  estSeconds: number
}

export interface EstimateOptions {
  /**
   * Sessions whose facets are already cached on disk. They contribute zero
   * facet+chunk-summary calls (and zero tokens) to the estimate, but still
   * count against the progress total because `extractFacet` ticks once per
   * cache hit too.
   *
   * Pass an empty set (or omit) to assume no cache.
   */
  cachedSessionIds?: ReadonlySet<string>
}

function chunkSummaryCallsFor(meta: SessionMeta): number {
  // Approximate transcript chars from token totals; if larger than the
  // inline-paste limit, chunk summaries kick in (see transcript.ts).
  const totalTokens = meta.input_tokens + meta.output_tokens + meta.reasoning_tokens
  const approxChars = totalTokens * CHARS_PER_TOKEN
  if (approxChars <= TRANSCRIPT_INLINE_CHAR_LIMIT) return 0
  return Math.ceil(approxChars / TRANSCRIPT_CHUNK_CHARS)
}

export function estimateLLMCost(
  model: CostModelLike,
  sessions: SessionMeta[],
  options: EstimateOptions = {},
): CostEstimate {
  const cached = options.cachedSessionIds ?? new Set<string>()
  const uncached = sessions.filter((s) => !cached.has(s.session_id))

  const facetCalls = uncached.length
  const cachedFacets = sessions.length - facetCalls
  const sectionCalls = SECTIONS_COUNT
  const chunkSummaryCalls = uncached.reduce((acc, s) => acc + chunkSummaryCallsFor(s), 0)
  // `totalCalls` reflects the progress bar — every session ticks once whether
  // it hit the cache or not, so we keep counting all sessions.
  const totalCalls = sessions.length + sectionCalls

  const inputTokens =
    facetCalls * FACET_INPUT_TOKENS +
    sectionCalls * SECTION_INPUT_TOKENS +
    chunkSummaryCalls * CHUNK_SUMMARY_INPUT_TOKENS
  const outputTokens =
    facetCalls * FACET_OUTPUT_TOKENS +
    sectionCalls * SECTION_OUTPUT_TOKENS +
    chunkSummaryCalls * CHUNK_SUMMARY_OUTPUT_TOKENS

  // Per-million pricing → USD.
  const costUSD = (inputTokens * model.cost.input) / 1_000_000 + (outputTokens * model.cost.output) / 1_000_000

  // Time: actual LLM-bound calls (uncached facets + sections) split across
  // CONCURRENCY workers. Cached facets resolve from disk in microseconds, so
  // they don't show up here. Chunk summaries are serial within a single
  // `extractFacet`, so add them as extra wall time.
  const llmBoundCalls = facetCalls + sectionCalls
  const concurrentSeconds = (llmBoundCalls / CONCURRENCY) * AVG_CALL_SECONDS
  const chunkSeconds = (chunkSummaryCalls / CONCURRENCY) * AVG_CALL_SECONDS
  const estSeconds = Math.max(1, Math.round(concurrentSeconds + chunkSeconds))

  return {
    facetCalls,
    sectionCalls,
    chunkSummaryCalls,
    cachedFacets,
    totalCalls,
    inputTokens,
    outputTokens,
    costUSD,
    estSeconds,
  }
}

export * as InsightsCost from "./cost"
