import { describe, expect, test } from "bun:test"
import { estimateLLMCost, type CostModelLike } from "@/insights/cost"
import { sessionMeta } from "./_fixtures"

const sonnet: CostModelLike = {
  cost: { input: 3, output: 15, cache: { read: 0, write: 0 } },
}

const zeroCost: CostModelLike = {
  cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
}

describe("estimateLLMCost", () => {
  test("with no sessions, only sections-cost contributes", () => {
    const e = estimateLLMCost(sonnet, [])
    expect(e.facetCalls).toBe(0)
    expect(e.sectionCalls).toBe(7)
    expect(e.totalCalls).toBe(7)
    expect(e.chunkSummaryCalls).toBe(0)
    expect(e.cachedFacets).toBe(0)
    expect(e.costUSD).toBeGreaterThan(0)
    expect(e.estSeconds).toBeGreaterThan(0)
  })

  test("single small session adds exactly one facet call", () => {
    const e = estimateLLMCost(sonnet, [sessionMeta({ input_tokens: 5_000 })])
    expect(e.facetCalls).toBe(1)
    expect(e.sectionCalls).toBe(7)
    expect(e.totalCalls).toBe(8)
    expect(e.chunkSummaryCalls).toBe(0)
    expect(e.cachedFacets).toBe(0)
  })

  test("90K-input-token session → exact chunk count", () => {
    // Math (mirrors cost.ts constants):
    //   totalTokens          = 90_000 (input) + 0 (output) + 0 (reasoning)
    //   approxChars          = 90_000 × 4 chars/token         = 360_000
    //   TRANSCRIPT_INLINE    = 30_000 chars  →  chunking active
    //   TRANSCRIPT_CHUNK     = 25_000 chars
    //   chunkSummaryCalls    = ceil(360_000 / 25_000) = ceil(14.4) = 15
    const e = estimateLLMCost(sonnet, [sessionMeta({ input_tokens: 90_000 })])
    expect(e.facetCalls).toBe(1)
    expect(e.chunkSummaryCalls).toBe(15)
    // chunk summaries are excluded from the progress total — only sessions+sections tick.
    expect(e.totalCalls).toBe(8)
  })

  test("cost math is consistent: facet + sections × $/1M", () => {
    const e = estimateLLMCost(sonnet, [sessionMeta({ input_tokens: 5_000 })])
    // sanity: cost should be (input * $3/1M) + (output * $15/1M); both > 0
    expect(e.inputTokens).toBeGreaterThan(0)
    expect(e.outputTokens).toBeGreaterThan(0)
    const handCalc = (e.inputTokens * 3) / 1_000_000 + (e.outputTokens * 15) / 1_000_000
    // allow 5% slack for rounding
    expect(Math.abs(e.costUSD - handCalc)).toBeLessThan(handCalc * 0.05 + 1e-6)
  })

  test("zero-cost model returns $0 but still positive token / time estimate", () => {
    const e = estimateLLMCost(zeroCost, [sessionMeta({ input_tokens: 5_000 })])
    expect(e.costUSD).toBe(0)
    expect(e.inputTokens).toBeGreaterThan(0)
    expect(e.estSeconds).toBeGreaterThan(0)
  })

  test("estSeconds scales with totalCalls", () => {
    const small = estimateLLMCost(sonnet, [sessionMeta({ input_tokens: 1_000 })])
    const big = estimateLLMCost(
      sonnet,
      Array.from({ length: 50 }, () => sessionMeta({ input_tokens: 1_000 })),
    )
    expect(big.estSeconds).toBeGreaterThan(small.estSeconds)
    expect(big.totalCalls).toBeGreaterThan(small.totalCalls)
  })
})

describe("estimateLLMCost with cache", () => {
  test("all sessions cached → zero facet/chunk calls, zero token cost from facets", () => {
    const metas = [
      sessionMeta({ session_id: "a", input_tokens: 90_000 }),
      sessionMeta({ session_id: "b", input_tokens: 5_000 }),
    ]
    const cached = new Set(["a", "b"])
    const e = estimateLLMCost(sonnet, metas, { cachedSessionIds: cached })
    expect(e.facetCalls).toBe(0)
    expect(e.chunkSummaryCalls).toBe(0)
    expect(e.cachedFacets).toBe(2)
    // sections still cost
    expect(e.sectionCalls).toBe(7)
    // progress total: every session ticks once (cache hit or fresh) + sections.
    expect(e.totalCalls).toBe(2 + 7)
  })

  test("partial cache → only uncached sessions contribute facet/chunk", () => {
    const metas = [
      sessionMeta({ session_id: "a", input_tokens: 5_000 }),
      sessionMeta({ session_id: "b", input_tokens: 90_000 }),
      sessionMeta({ session_id: "c", input_tokens: 5_000 }),
    ]
    const cached = new Set(["a"])
    const e = estimateLLMCost(sonnet, metas, { cachedSessionIds: cached })
    // only b and c are uncached → 2 facet calls
    expect(e.facetCalls).toBe(2)
    expect(e.cachedFacets).toBe(1)
    // session b (90K input) triggers exactly 15 chunk summaries; session c is small.
    expect(e.chunkSummaryCalls).toBe(15)
    // all 3 sessions tick progress + 7 sections
    expect(e.totalCalls).toBe(3 + 7)
  })

  test("empty cache set behaves like no cache", () => {
    const metas = [sessionMeta({ session_id: "a", input_tokens: 5_000 })]
    const withEmpty = estimateLLMCost(sonnet, metas, { cachedSessionIds: new Set() })
    const without = estimateLLMCost(sonnet, metas)
    expect(withEmpty).toEqual(without)
  })

  test("cached session does NOT contribute tokens or cost", () => {
    const metas = [sessionMeta({ session_id: "a", input_tokens: 5_000 })]
    const fresh = estimateLLMCost(sonnet, metas)
    const cached = estimateLLMCost(sonnet, metas, { cachedSessionIds: new Set(["a"]) })
    // Cached version should have strictly fewer input tokens (no FACET_INPUT_TOKENS contribution)
    // and strictly lower USD cost, while sectionCalls remain 7.
    expect(cached.inputTokens).toBeLessThan(fresh.inputTokens)
    expect(cached.outputTokens).toBeLessThan(fresh.outputTokens)
    expect(cached.costUSD).toBeLessThan(fresh.costUSD)
    expect(cached.sectionCalls).toBe(fresh.sectionCalls)
  })

  test("cachedSessionIds entries that don't match any session are ignored", () => {
    const metas = [sessionMeta({ session_id: "real", input_tokens: 5_000 })]
    const ghost = estimateLLMCost(sonnet, metas, { cachedSessionIds: new Set(["nonexistent"]) })
    const fresh = estimateLLMCost(sonnet, metas)
    expect(ghost).toEqual(fresh)
  })
})
