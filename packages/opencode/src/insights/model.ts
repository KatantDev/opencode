import { Effect } from "effect"
import type { LanguageModel } from "ai"
import { Provider } from "@/provider/provider"

/**
 * Resolve a `LanguageModel` for `generateObject` calls.
 *
 * - If `input` is a `"providerID/modelID"` string, parse + resolve.
 * - If `input` is `undefined`, fall back to `Provider.defaultModel()`.
 *
 * Throws `ProviderModelNotFoundError` as a defect when the model can't be
 * resolved. The CLI handler can catch this via `Effect.catchAllDefect`; if it
 * doesn't, the existing global formatter in `cli/error.ts` already prints a
 * friendly "Model not found / try `opencode models`" message.
 *
 * `provider.getLanguage()` returns `LanguageModelV3` (from `@ai-sdk/provider`);
 * `LanguageModel` (from `ai`) is `LanguageModelV3 | string`. The cast is
 * structural — same value `agent.ts:482` passes to `generateObject`.
 */
export const resolveLanguageModel = Effect.fn("Insights.resolveLanguageModel")(function* (input?: string) {
  const provider = yield* Provider.Service
  const selection = input ? Provider.parseModel(input) : yield* provider.defaultModel()
  const model = yield* provider.getModel(selection.providerID, selection.modelID)
  return (yield* provider.getLanguage(model)) as LanguageModel
})

export * as InsightsModel from "./model"
