import { Effect } from "effect"
import { AISDKError, generateObject, type LanguageModel, type LanguageModelUsage, type ProviderMetadata } from "ai"
import { z } from "zod"
import path from "node:path"
import { mkdir } from "node:fs/promises"
import { facetsDir } from "./paths"
import { SessionFacets, SessionFacetsInput, fromSessionFacetsInput, type SessionMeta } from "./schema"
import { formatTranscript, chunkTranscript } from "./transcript"
import type { MessageV2 } from "@/session/message-v2"

/**
 * Reported once per LLM call (facet extraction or chunk summary), so the CLI
 * can sum up real cost / token counts after the run.
 */
export interface UsageEvent {
  usage: LanguageModelUsage
  metadata?: ProviderMetadata
  kind: "facet" | "chunk_summary" | "section"
}

const SUMMARIZE_CHUNK_PROMPT = `Summarize this portion of an OpenCode session transcript. Focus on:
1. What the user asked for
2. What the assistant did (tools used, files modified)
3. Any friction or issues
4. The outcome
Keep it concise — 3-5 sentences. Preserve specific details like file names, error messages, and user feedback.

TRANSCRIPT CHUNK:
`

const FACET_EXTRACTION_PROMPT = `Analyze this OpenCode session and extract structured facets.

CRITICAL GUIDELINES:

1. **goal_categories**: Count ONLY what the USER explicitly asked for. Do not count autonomous exploration the assistant performed on its own.
2. **user_satisfaction_counts**: Base ONLY on explicit user signals. "yay/great/perfect" → happy, "thanks/looks good" → satisfied, "ok now let's…" → likely_satisfied, "that's not right/try again" → dissatisfied, "this is broken/I give up" → frustrated.
3. **friction_counts**: Be specific. misunderstood_request, wrong_approach, buggy_code, user_rejected_action, excessive_changes.
4. If very short or just warmup, use warmup_minimal in goal_categories.

SESSION:
`

const cachePath = (session_id: string) => path.join(facetsDir(), `${session_id}.json`)

export async function loadCachedFacet(
  session_id: string,
  end_time: number,
): Promise<SessionFacets | null> {
  const file = Bun.file(cachePath(session_id))
  if (!(await file.exists())) return null
  const raw = await file.text()
  const parsed = JSON.parse(raw) as { _end_time?: number; facets?: unknown }
  if (parsed._end_time !== end_time) return null
  const validated = SessionFacets.safeParse(parsed.facets)
  return validated.success ? validated.data : null
}

export async function saveCachedFacet(facet: SessionFacets, end_time: number): Promise<void> {
  await mkdir(facetsDir(), { recursive: true })
  await Bun.write(cachePath(facet.session_id), JSON.stringify({ _end_time: end_time, facets: facet }, null, 2))
}

async function summariseChunk(
  model: LanguageModel,
  chunk: string,
  onUsage?: (e: UsageEvent) => void,
): Promise<string> {
  const result = await generateObject({
    model,
    schema: z.object({ brief_summary: z.string() }),
    prompt: SUMMARIZE_CHUNK_PROMPT + chunk,
    maxOutputTokens: 500,
  })
  onUsage?.({ usage: result.usage, metadata: result.providerMetadata, kind: "chunk_summary" })
  return result.object.brief_summary
}

async function compactTranscript(
  model: LanguageModel,
  meta: SessionMeta,
  transcript: string,
  onUsage?: (e: UsageEvent) => void,
): Promise<string> {
  const chunks = chunkTranscript(transcript)
  if (chunks.length === 1) return transcript
  const summaries = await Promise.all(chunks.map((c) => summariseChunk(model, c, onUsage)))
  const header = [
    `Session: ${meta.session_id.slice(0, 8)}`,
    `Date: ${new Date(meta.start_time).toISOString()}`,
    `Project: ${meta.project_path}`,
    `Duration: ${meta.duration_minutes} min`,
    `[Long session — ${chunks.length} parts summarised]`,
    "",
  ].join("\n")
  return header + summaries.join("\n\n---\n\n")
}

export interface ExtractFacetInput {
  meta: SessionMeta
  messages: MessageV2.WithParts[]
  model: LanguageModel
  /**
   * Called exactly once per `extractFacet` invocation, after the facet is
   * resolved (whether from cache or from a fresh LLM call). Lets the CLI
   * draw a progress bar over `sessions + sections` total calls.
   */
  onProgress?: () => void
  /**
   * Called once per actual LLM round-trip (facet + each chunk summary).
   * Cache hits do NOT emit a usage event. Use this to sum real cost/tokens
   * for the post-run summary.
   */
  onUsage?: (e: UsageEvent) => void
  /**
   * Called exactly once when the facet is served from the on-disk cache (i.e.
   * no LLM round-trip happened). Lets the caller maintain an authoritative
   * cache-hit count without inferring it arithmetically — important because
   * `saveCachedFacet` failures must NOT mask cache hits.
   */
  onCacheHit?: () => void
}

/**
 * Wraps an AI-SDK promise so that recoverable provider errors (network
 * blips, malformed model output, API errors) are converted to a tagged
 * `Error` we can fall back from with `Effect.orElseSucceed(() => null)`,
 * while unexpected programmer errors (TypeError, RangeError, etc.) propagate
 * as defects so regressions are visible instead of being silently swallowed.
 */
const tryAISDK = <T>(label: string, run: () => Promise<T>) =>
  Effect.tryPromise({
    try: run,
    catch: (e) => {
      if (AISDKError.isInstance(e)) return new Error(`${label}: ${String(e)}`)
      throw e
    },
  })

export const extractFacet = (input: ExtractFacetInput) =>
  Effect.fn("Insights.extractFacet")(function* () {
    const cached = yield* Effect.promise(() => loadCachedFacet(input.meta.session_id, input.meta.end_time))
    if (cached) {
      input.onCacheHit?.()
      input.onProgress?.()
      return cached as SessionFacets | null
    }

    const transcript = formatTranscript(input.meta, input.messages)
    // `compactTranscript` itself runs LLM `summariseChunk` calls under the hood
    // which can fail on malformed responses; isolate them so a single bad
    // session doesn't kill the whole pipeline. AI-SDK errors are recoverable;
    // anything else (TypeError, programmer bugs) bubbles up as a defect.
    const compacted = yield* tryAISDK(`compact ${input.meta.session_id}`, () =>
      compactTranscript(input.model, input.meta, transcript, input.onUsage),
    ).pipe(Effect.orElseSucceed(() => null))

    if (compacted === null) {
      input.onProgress?.()
      return null
    }

    const facetOrNull = yield* tryAISDK(`facet ${input.meta.session_id}`, async () => {
      const result = await generateObject({
        model: input.model,
        schema: SessionFacetsInput,
        prompt: FACET_EXTRACTION_PROMPT + compacted,
        maxOutputTokens: 4096,
      })
      input.onUsage?.({ usage: result.usage, metadata: result.providerMetadata, kind: "facet" })
      const facet = fromSessionFacetsInput(input.meta.session_id, result.object)
      // Persisting the cache is best-effort: a disk-full / EACCES failure
      // shouldn't waste the LLM round-trip we just paid for. Swallow the
      // error and return the in-memory facet anyway.
      await saveCachedFacet(facet, input.meta.end_time).catch(() => {})
      return facet
    }).pipe(Effect.orElseSucceed(() => null))

    input.onProgress?.()
    return facetOrNull
  })()

export * as InsightsFacets from "./facets"
