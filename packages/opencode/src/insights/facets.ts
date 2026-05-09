import { Effect } from "effect"
import { generateObject, type LanguageModel } from "ai"
import path from "node:path"
import { mkdir } from "node:fs/promises"
import { facetsDir } from "./paths"
import { SessionFacets, type SessionMeta } from "./schema"
import { formatTranscript, chunkTranscript } from "./transcript"
import type { MessageV2 } from "@/session/message-v2"

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

async function summariseChunk(model: LanguageModel, chunk: string): Promise<string> {
  const result = await generateObject({
    model,
    schema: SessionFacets.pick({ brief_summary: true }),
    prompt: SUMMARIZE_CHUNK_PROMPT + chunk,
    maxOutputTokens: 500,
  })
  return result.object.brief_summary
}

async function compactTranscript(
  model: LanguageModel,
  meta: SessionMeta,
  transcript: string,
): Promise<string> {
  const chunks = chunkTranscript(transcript)
  if (chunks.length === 1) return transcript
  const summaries = await Promise.all(chunks.map((c) => summariseChunk(model, c)))
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
}

export const extractFacet = (input: ExtractFacetInput) =>
  Effect.fn("Insights.extractFacet")(function* () {
    const cached = yield* Effect.promise(() => loadCachedFacet(input.meta.session_id, input.meta.end_time))
    if (cached) return cached

    const transcript = formatTranscript(input.meta, input.messages)
    const compacted = yield* Effect.promise(() => compactTranscript(input.model, input.meta, transcript))

    const result = yield* Effect.promise(() =>
      generateObject({
        model: input.model,
        schema: SessionFacets.omit({ session_id: true }),
        prompt: FACET_EXTRACTION_PROMPT + compacted,
        maxOutputTokens: 4096,
      }),
    )
    const facet: SessionFacets = { ...result.object, session_id: input.meta.session_id }
    yield* Effect.promise(() => saveCachedFacet(facet, input.meta.end_time))
    return facet
  })()

export * as InsightsFacets from "./facets"
