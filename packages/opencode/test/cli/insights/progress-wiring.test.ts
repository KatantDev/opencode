import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import path from "node:path"
import { tmpdir } from "node:os"
import { Effect } from "effect"
import { extractFacet, saveCachedFacet } from "@/insights/facets"
import type { SessionFacets, SessionMeta } from "@/insights/schema"

const sample: SessionFacets = {
  session_id: "wiringtest01",
  underlying_goal: "wiring",
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

const meta: SessionMeta = {
  session_id: sample.session_id,
  project_id: "p",
  project_path: "/p",
  start_time: 0,
  end_time: 1000,
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
}

let tmp: string

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "opencode-insights-progress-"))
  process.env["OPENCODE_INSIGHTS_DIR"] = tmp
})

afterEach(() => {
  delete process.env["OPENCODE_INSIGHTS_DIR"]
  rmSync(tmp, { recursive: true, force: true })
})

describe("extractFacet onProgress wiring", () => {
  test("invokes onProgress exactly once when facet is served from cache", async () => {
    await saveCachedFacet(sample, meta.end_time)
    const calls: number[] = []
    const onProgress = () => calls.push(Date.now())
    // Model arg is irrelevant — cached path never calls the LLM. Pass {} cast.
    const result = await Effect.runPromise(
      extractFacet({
        meta,
        messages: [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        model: {} as any,
        onProgress,
      }),
    )
    expect(result?.session_id).toBe(sample.session_id)
    expect(calls.length).toBe(1)
  })
})
