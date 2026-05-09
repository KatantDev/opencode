import { describe, expect, test } from "bun:test"
import { renderReport } from "@/insights/render"
import type { Aggregate, Sections } from "@/insights/schema"

const baseAggregate: Aggregate = {
  total_sessions: 2,
  sessions_with_facets: 1,
  date_range: { start_ms: 0, end_ms: 86_400_000 },
  total_user_messages: 5,
  total_assistant_messages: 6,
  total_duration_hours: 1,
  total_cost: 0.5,
  totals_tokens: { input: 1000, output: 200, reasoning: 0, cache_read: 0, cache_write: 0 },
  tool_counts: { bash: 3, edit: 2 },
  languages: { TypeScript: 2 },
  git_commits: 1,
  git_pushes: 0,
  projects: { p1: { id: "p1", path: "/tmp/p1", sessions: 2 } },
  goal_categories: {},
  outcomes: {},
  satisfaction: {},
  helpfulness: {},
  session_types: {},
  friction: {},
  success: {},
  total_interruptions: 0,
  total_tool_errors: 0,
  tool_error_categories: {},
  user_response_times_sec: [],
  median_response_time_sec: 0,
  avg_response_time_sec: 0,
  sessions_using_task_agent: 0,
  sessions_using_mcp: 0,
  sessions_using_web_search: 0,
  sessions_using_web_fetch: 0,
  total_lines_added: 5,
  total_lines_removed: 1,
  total_files_modified: 1,
  days_active: 1,
  messages_per_day: 5,
  message_hours: [9, 10, 14],
  multi_clauding: { overlap_events: 0, sessions_involved: 0, user_messages_during: 0 },
  models_used: { "anthropic/claude-opus-4-7": 6 },
  agents_used: { build: 6 },
  session_summaries: [{ id: "abc", started_iso: "1970-01-01", project_path: "/tmp/p1", summary: "hi" }],
}

describe("renderReport", () => {
  test("emits valid skeleton, escapes summary text", () => {
    const sections: Sections = { interaction_style: { narrative: "x", key_pattern: "you iterate quickly <fast>" } }
    const html = renderReport({ aggregate: baseAggregate, sections, generated_at_iso: "1970-01-01T00:00:00Z" })
    expect(html.startsWith("<!doctype html>")).toBe(true)
    expect(html).toContain("OpenCode — Your Usage Report")
    expect(html).toContain("you iterate quickly &lt;fast&gt;")
    expect(html).not.toContain("<script")
  })

  test("omits sections that are absent", () => {
    const html = renderReport({ aggregate: baseAggregate, sections: {}, generated_at_iso: "x" })
    expect(html.toLowerCase().includes("memorable")).toBe(false)
  })

  test("inlines the IBM Plex Mono font and OpenCode logo", () => {
    const html = renderReport({ aggregate: baseAggregate, sections: {}, generated_at_iso: "x" })
    expect(html).toContain("IBM Plex Mono")
    expect(html).toContain('aria-label="opencode"')
  })
})
