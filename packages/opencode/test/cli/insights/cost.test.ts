import { describe, expect, test } from "bun:test"
import { estimateLLMCost, type CostModelLike } from "@/insights/cost"
import type { SessionMeta } from "@/insights/schema"

const sonnet: CostModelLike = {
  cost: { input: 3, output: 15, cache: { read: 0, write: 0 } },
}

const zeroCost: CostModelLike = {
  cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
}

const meta = (overrides: Partial<SessionMeta> = {}): SessionMeta => ({
  session_id: "s",
  project_id: "p",
  project_path: "/p",
  start_time: 0,
  end_time: 1_000,
  duration_minutes: 1,
  user_message_count: 1,
  assistant_message_count: 1,
  tool_counts: {},
  languages: {},
  git_commits: 0,
  git_pushes: 0,
  input_tokens: 0,
  output_tokens: 0,
  reasoning_tokens: 0,
  cache_read_tokens: 0,
  cache_write_tokens: 0,
  total_cost: 0,
  user_interruptions: 0,
  user_response_times_sec: [],
  tool_errors: 0,
  tool_error_categories: {},
  uses_task_agent: false,
  uses_mcp: false,
  uses_web_search: false,
  uses_web_fetch: false,
  lines_added: 0,
  lines_removed: 0,
  files_modified: 0,
  message_hours: [],
  user_message_timestamps_ms: [],
  agents_used: [],
  models_used: [],
  first_user_prompt: "",
  ...overrides,
})

describe("estimateLLMCost", () => {
  test("with no sessions, only sections-cost contributes", () => {
    const e = estimateLLMCost(sonnet, [])
    expect(e.facetCalls).toBe(0)
    expect(e.sectionCalls).toBe(7)
    expect(e.totalCalls).toBe(7)
    expect(e.chunkSummaryCalls).toBe(0)
    expect(e.costUSD).toBeGreaterThan(0)
    expect(e.estSeconds).toBeGreaterThan(0)
  })

  test("single small session adds exactly one facet call", () => {
    const e = estimateLLMCost(sonnet, [meta({ input_tokens: 5_000 })])
    expect(e.facetCalls).toBe(1)
    expect(e.sectionCalls).toBe(7)
    expect(e.totalCalls).toBe(8)
    expect(e.chunkSummaryCalls).toBe(0)
  })

  test("large session triggers chunk summaries (counted in cost, not in totalCalls)", () => {
    // 90K input tokens → transcript chars > INLINE_LIMIT, multiple chunks
    const e = estimateLLMCost(sonnet, [meta({ input_tokens: 90_000, output_tokens: 90_000 })])
    expect(e.facetCalls).toBe(1)
    expect(e.totalCalls).toBe(8) // chunk summaries excluded from progress total
    expect(e.chunkSummaryCalls).toBeGreaterThan(0)
  })

  test("cost math is consistent: facet + sections × $/1M", () => {
    const e = estimateLLMCost(sonnet, [meta({ input_tokens: 5_000 })])
    // sanity: cost should be (input * $3/1M) + (output * $15/1M); both > 0
    expect(e.inputTokens).toBeGreaterThan(0)
    expect(e.outputTokens).toBeGreaterThan(0)
    const handCalc = (e.inputTokens * 3) / 1_000_000 + (e.outputTokens * 15) / 1_000_000
    // allow 5% slack for rounding
    expect(Math.abs(e.costUSD - handCalc)).toBeLessThan(handCalc * 0.05 + 1e-6)
  })

  test("zero-cost model returns $0 but still positive token / time estimate", () => {
    const e = estimateLLMCost(zeroCost, [meta({ input_tokens: 5_000 })])
    expect(e.costUSD).toBe(0)
    expect(e.inputTokens).toBeGreaterThan(0)
    expect(e.estSeconds).toBeGreaterThan(0)
  })

  test("estSeconds scales with totalCalls", () => {
    const small = estimateLLMCost(sonnet, [meta({ input_tokens: 1_000 })])
    const big = estimateLLMCost(
      sonnet,
      Array.from({ length: 50 }, () => meta({ input_tokens: 1_000 })),
    )
    expect(big.estSeconds).toBeGreaterThan(small.estSeconds)
    expect(big.totalCalls).toBeGreaterThan(small.totalCalls)
  })
})
