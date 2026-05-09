const OVERLAP_WINDOW_MS = 30 * 60_000

export function detectMultiClauding(
  sessions: Array<{ session_id: string; user_message_timestamps_ms: number[] }>,
) {
  const all = sessions
    .flatMap((s) => s.user_message_timestamps_ms.map((ts) => ({ ts, sessionId: s.session_id })))
    .sort((a, b) => a.ts - b.ts)

  const pairs = new Set<string>()
  const messagesDuring = new Set<string>()
  const lastIndex = new Map<string, number>()
  let windowStart = 0

  for (let i = 0; i < all.length; i++) {
    const msg = all[i]!
    while (windowStart < i && msg.ts - all[windowStart]!.ts > OVERLAP_WINDOW_MS) {
      const expiring = all[windowStart]!
      if (lastIndex.get(expiring.sessionId) === windowStart) lastIndex.delete(expiring.sessionId)
      windowStart++
    }
    const prev = lastIndex.get(msg.sessionId)
    if (prev !== undefined) {
      for (let j = prev + 1; j < i; j++) {
        const between = all[j]!
        if (between.sessionId !== msg.sessionId) {
          pairs.add([msg.sessionId, between.sessionId].sort().join(":"))
          messagesDuring.add(`${all[prev]!.ts}:${msg.sessionId}`)
          messagesDuring.add(`${between.ts}:${between.sessionId}`)
          messagesDuring.add(`${msg.ts}:${msg.sessionId}`)
          break
        }
      }
    }
    lastIndex.set(msg.sessionId, i)
  }

  const involved = new Set<string>()
  for (const pair of pairs) {
    const parts = pair.split(":")
    if (parts[0]) involved.add(parts[0])
    if (parts[1]) involved.add(parts[1])
  }
  return {
    overlap_events: pairs.size,
    sessions_involved: involved.size,
    user_messages_during: messagesDuring.size,
  }
}

export * as InsightsMultiClauding from "./multi-clauding"
