import { Effect } from "effect"
import { effectCmd, fail } from "../effect-cmd"
import { Insights } from "@/insights/insights"
import { reportsDir } from "@/insights/paths"
import { resolveLanguageModel } from "@/insights/model"

export const InsightsCommand = effectCmd({
  command: "insights",
  describe: "generate a usage report from your OpenCode session history",
  builder: (yargs) =>
    yargs
      .option("days", {
        describe: "only sessions from the last N days",
        type: "number",
      })
      .option("project", {
        describe: "project ID filter",
        type: "string",
      })
      .option("limit", {
        describe: "max sessions to analyse",
        type: "number",
      })
      .option("llm", {
        describe: "extract per-session facets and generate narrative sections (use --no-llm to skip)",
        type: "boolean",
        default: true,
      })
      .option("open", {
        describe: "open the report in your browser (use --no-open to skip)",
        type: "boolean",
        default: true,
      })
      .option("model", {
        describe: "model id (provider/model)",
        type: "string",
      }),
  handler: Effect.fn("Cli.insights")(function* (args) {
    const withLLM = args.llm
    const model = withLLM
      ? yield* resolveLanguageModel(args.model).pipe(
          Effect.catchDefect((e) => {
            const msg = e instanceof Error ? e.message : String(e)
            if (msg.includes("ProviderModelNotFoundError")) {
              return fail(
                args.model
                  ? `Model not found: ${args.model}. Run 'opencode models' to list available models.`
                  : `No default model configured. Pass --model provider/model or set 'model' in config.`,
              )
            }
            return Effect.die(e)
          }),
        )
      : undefined

    yield* Insights.run({
      days: args.days,
      projectFilter: args.project,
      limit: args.limit,
      withLLM,
      model,
      open: args.open,
    })

    console.log(`Report written to ${reportsDir()}/report-latest.html`)
  }),
})
