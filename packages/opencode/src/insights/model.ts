import { Effect } from "effect"
import { Provider } from "@/provider/provider"

/**
 * Resolve a `LanguageModel` for `generateObject` calls.
 *
 * - If `input` is a `"providerID/modelID"` string, parse + resolve.
 * - If `input` is `undefined`, fall back to `Provider.defaultModel()`.
 *
 * Throws `ProviderModelNotFoundError` as a defect when the model can't be
 * resolved. The CLI handler can catch this via `Effect.catchDefect`; if it
 * doesn't, the existing global formatter in `cli/error.ts` already prints a
 * friendly "Model not found / try `opencode models`" message.
 */
export const resolveLanguageModel = Effect.fn("Insights.resolveLanguageModel")(function* (input?: string) {
  const provider = yield* Provider.Service
  const selection = input ? Provider.parseModel(input) : yield* provider.defaultModel()
  const model = yield* provider.getModel(selection.providerID, selection.modelID)
  return yield* provider.getLanguage(model)
})

export * as InsightsModel from "./model"
