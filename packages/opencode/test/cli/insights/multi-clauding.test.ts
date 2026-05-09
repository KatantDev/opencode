import { describe, expect, test } from "bun:test"
import { detectMultiClauding } from "@/insights/multi-clauding"

describe("detectMultiClauding", () => {
  test("no overlap → zeroes", () => {
    const r = detectMultiClauding([
      { session_id: "a", user_message_timestamps_ms: [1_000, 2_000] },
      { session_id: "b", user_message_timestamps_ms: [10 * 60 * 60_000] },
    ])
    expect(r).toEqual({ overlap_events: 0, sessions_involved: 0, user_messages_during: 0 })
  })

  test("a-b-a within 30 min window → one overlap event, both involved", () => {
    const r = detectMultiClauding([
      { session_id: "a", user_message_timestamps_ms: [0, 20 * 60_000] },
      { session_id: "b", user_message_timestamps_ms: [10 * 60_000] },
    ])
    expect(r.overlap_events).toBe(1)
    expect(r.sessions_involved).toBe(2)
    expect(r.user_messages_during).toBeGreaterThanOrEqual(2)
  })

  test("a-a outside window → no overlap", () => {
    const r = detectMultiClauding([
      { session_id: "a", user_message_timestamps_ms: [0, 60 * 60_000] },
      { session_id: "b", user_message_timestamps_ms: [30 * 60_000 + 1] },
    ])
    expect(r.overlap_events).toBe(0)
  })
})
