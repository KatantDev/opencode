import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import path from "node:path"
import { tmpdir } from "node:os"
import { loadCachedFacet, saveCachedFacet } from "@/insights/facets"
import type { SessionFacets } from "@/insights/schema"

const sample: SessionFacets = {
  session_id: "deadbeef0000",
  underlying_goal: "test",
  goal_categories: { feature_implementation: 1 },
  outcome: "fully_achieved",
  user_satisfaction_counts: { satisfied: 1 },
  claude_helpfulness: "very_helpful",
  session_type: "single_task",
  friction_counts: {},
  friction_detail: "",
  primary_success: "correct_code_edits",
  brief_summary: "Sample brief.",
}

let tmp: string

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "opencode-insights-"))
  process.env["OPENCODE_INSIGHTS_DIR"] = tmp
})

afterEach(() => {
  delete process.env["OPENCODE_INSIGHTS_DIR"]
  rmSync(tmp, { recursive: true, force: true })
})

describe("facet cache", () => {
  test("miss returns null when no file exists", async () => {
    const result = await loadCachedFacet(sample.session_id, 1000)
    expect(result).toBeNull()
  })

  test("save then load returns the same facet on matching end_time", async () => {
    await saveCachedFacet(sample, 1000)
    const result = await loadCachedFacet(sample.session_id, 1000)
    expect(result).toEqual(sample)
  })

  test("stale end_time returns null", async () => {
    await saveCachedFacet(sample, 1000)
    const result = await loadCachedFacet(sample.session_id, 2000)
    expect(result).toBeNull()
  })

  test("schema mismatch returns null", async () => {
    const file = path.join(tmp, "facets", `${sample.session_id}.json`)
    await Bun.write(file, JSON.stringify({ _end_time: 1000, facets: { not: "a real facet" } }))
    const result = await loadCachedFacet(sample.session_id, 1000)
    expect(result).toBeNull()
  })
})
