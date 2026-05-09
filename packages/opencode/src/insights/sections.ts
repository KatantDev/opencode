import { Effect } from "effect"
import { generateObject, type LanguageModel } from "ai"
import type { ZodType } from "zod"
import type { UsageEvent } from "./facets"
import {
  ProjectAreasSection,
  InteractionStyleSection,
  WhatWorksSection,
  FrictionAnalysisSection,
  SuggestionsSection,
  OnTheHorizonSection,
  FunEndingSection,
  type Aggregate,
  type Sections,
  type SessionFacets,
} from "./schema"

interface SectionDef<T> {
  name: keyof Sections
  schema: ZodType<T>
  prompt: (agg: Aggregate, facets: SessionFacets[]) => string
  maxTokens: number
}

const compactInput = (agg: Aggregate, facets: SessionFacets[]) => {
  const compactFacets = facets.map((f) => ({
    session_id: f.session_id,
    underlying_goal: f.underlying_goal,
    outcome: f.outcome,
    claude_helpfulness: f.claude_helpfulness,
    session_type: f.session_type,
    goal_categories: f.goal_categories,
    friction_counts: f.friction_counts,
    friction_detail: f.friction_detail,
    primary_success: f.primary_success,
    brief_summary: f.brief_summary,
  }))
  return [
    "## AGGREGATE STATS",
    "```json",
    JSON.stringify(agg, null, 2),
    "```",
    "",
    `## ALL FACETS (${compactFacets.length} sessions)`,
    "```json",
    JSON.stringify(compactFacets),
    "```",
  ].join("\n")
}

const SECTIONS: SectionDef<unknown>[] = [
  {
    name: "project_areas",
    schema: ProjectAreasSection,
    prompt: (a, f) =>
      `Identify 4-5 project areas from this OpenCode usage data.\nReturn one description per area (2-3 sentences).\n\n${compactInput(a, f)}`,
    maxTokens: 8192,
  },
  {
    name: "interaction_style",
    schema: InteractionStyleSection,
    prompt: (a, f) =>
      `Describe the user's interaction style. 2-3 paragraphs second person ("you"). Use **bold** for key insights.\n\n${compactInput(a, f)}`,
    maxTokens: 8192,
  },
  {
    name: "what_works",
    schema: WhatWorksSection,
    prompt: (a, f) =>
      `Identify 3 impressive workflows from this user. Use second person ("you").\n\n${compactInput(a, f)}`,
    maxTokens: 8192,
  },
  {
    name: "friction_analysis",
    schema: FrictionAnalysisSection,
    prompt: (a, f) =>
      `Identify 3 friction categories with 2 concrete examples each. Use second person ("you").\n\n${compactInput(a, f)}`,
    maxTokens: 8192,
  },
  {
    name: "suggestions",
    schema: SuggestionsSection,
    prompt: (a, f) =>
      `Suggest improvements based on actual session evidence. Include AGENTS.md additions PRIORITIZING instructions the user gave 2+ times across sessions, OpenCode features (skills, hooks, MCP, headless mode), and copyable prompts to try.\n\n${compactInput(a, f)}`,
    maxTokens: 8192,
  },
  {
    name: "on_the_horizon",
    schema: OnTheHorizonSection,
    prompt: (a, f) =>
      `Identify 3 ambitious future opportunities — autonomous workflows, parallel agents, iterating against tests. Each gets a copyable prompt.\n\n${compactInput(a, f)}`,
    maxTokens: 8192,
  },
  {
    name: "fun_ending",
    schema: FunEndingSection,
    prompt: (a, f) =>
      `Surface ONE memorable QUALITATIVE moment from the session summaries — not a statistic. Something funny, surprising, or human.\n\n${compactInput(a, f)}`,
    maxTokens: 4096,
  },
]

export interface GenerateSectionsInput {
  model: LanguageModel
  aggregate: Aggregate
  facets: SessionFacets[]
  /**
   * Called once per section as soon as that section's `generateObject`
   * resolves (success or fallback). Total invocations equals `SECTIONS.length`.
   */
  onProgress?: () => void
  /**
   * Called once per successful section LLM call (not on failures). Lets the
   * CLI sum real cost/tokens for the post-run summary.
   */
  onUsage?: (e: UsageEvent) => void
}

export const generateSections = (input: GenerateSectionsInput) =>
  Effect.fn("Insights.generateSections")(function* () {
    const results = yield* Effect.forEach(
      SECTIONS,
      (section) =>
        Effect.tryPromise({
          try: () =>
            generateObject({
              model: input.model,
              schema: section.schema,
              prompt: section.prompt(input.aggregate, input.facets),
              maxOutputTokens: section.maxTokens,
            }).then((r) => {
              input.onUsage?.({ usage: r.usage, metadata: r.providerMetadata, kind: "section" })
              return { name: section.name, value: r.object as unknown }
            }),
          catch: (e) => new Error(`section ${section.name} failed: ${String(e)}`),
        }).pipe(
          Effect.orElseSucceed(() => ({
            name: section.name,
            value: undefined as unknown,
          })),
          Effect.tap(() => Effect.sync(() => input.onProgress?.())),
        ),
      { concurrency: 4 },
    )
    const out: Sections = {}
    for (const r of results) {
      if (r.value !== undefined) (out as Record<string, unknown>)[r.name] = r.value
    }
    return out
  })()

export * as InsightsSections from "./sections"
