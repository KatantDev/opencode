import type { Aggregate, Sections } from "./schema"

const ESC_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESC_MAP[c]!)

const CSS = String.raw`
  :root { color-scheme: light dark; --accent: #6366f1; --good: #10b981; --warn: #f59e0b; --bg: #fff; --fg: #111; --muted: #555; --card: #f7f7f8; --border: #e5e7eb; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #0b0d12; --fg: #e5e7eb; --muted: #9ca3af; --card: #11141b; --border: #1f2937; }
  }
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; max-width: 920px; margin: 2rem auto; padding: 0 1rem; background: var(--bg); color: var(--fg); line-height: 1.55; }
  h1, h2, h3 { line-height: 1.2; }
  h1 { font-size: 2rem; margin: 0 0 .25rem 0; }
  h2 { margin-top: 2.25rem; padding-bottom: .25rem; border-bottom: 1px solid var(--border); }
  h3 { margin-top: 1.25rem; }
  .muted { color: var(--muted); }
  .grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; }
  .stat { font-size: 1.6rem; font-weight: 600; }
  .bar-row { display: grid; grid-template-columns: 16ch 1fr 8ch; align-items: center; gap: .5rem; margin: .25rem 0; }
  .bar-track { background: var(--card); border-radius: 3px; height: 14px; overflow: hidden; }
  .bar { height: 14px; background: var(--accent); border-radius: 3px; min-width: 2px; }
  .bar.warn { background: var(--warn); }
  .hours { display: grid; grid-template-columns: repeat(24, 1fr); gap: 2px; align-items: end; height: 80px; margin: .5rem 0; }
  .hours .h { background: var(--accent); border-radius: 2px 2px 0 0; min-height: 1px; }
  .hours-labels { display: grid; grid-template-columns: repeat(24, 1fr); font-size: 10px; color: var(--muted); text-align: center; }
  details > summary { cursor: pointer; padding: .5rem 0; font-weight: 600; }
  ul { padding-left: 1.25rem; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: .35rem .5rem; border-bottom: 1px solid var(--border); }
  pre { background: var(--card); padding: .75rem; border-radius: 6px; overflow-x: auto; white-space: pre-wrap; }
  .pill { display: inline-block; padding: .15rem .5rem; border-radius: 999px; background: var(--card); border: 1px solid var(--border); font-size: .8rem; margin: .15rem .15rem 0 0; }
  .ok { color: var(--good); }
  .warn { color: var(--warn); }
  .banner { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 1rem 1.25rem; }
  .archive-group { margin: .5rem 0 1rem 0; }
  .archive-group h4 { margin: .5rem 0 .25rem 0; font-size: .95rem; }
  .archive-list { margin: 0; padding-left: 1.25rem; }
`

type Pair = readonly [string, number]

const sortDesc = (entries: Record<string, number>): Pair[] =>
  Object.entries(entries).sort((a, b) => b[1] - a[1])

const totalTokens = (a: Aggregate): number =>
  a.totals_tokens.input +
  a.totals_tokens.output +
  a.totals_tokens.reasoning +
  a.totals_tokens.cache_read +
  a.totals_tokens.cache_write

const renderBars = (entries: Pair[], limit: number): string => {
  const top = entries.slice(0, limit)
  const max = top.reduce((m, [, v]) => (v > m ? v : m), 0)
  return top
    .map(([label, value]) => {
      const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0
      return `<div class="bar-row"><div class="muted">${esc(label)}</div><div class="bar-track"><div class="bar" style="width:${pct}%"></div></div><div>${value.toLocaleString()}</div></div>`
    })
    .join("")
}

function renderAtAGlance(a: Aggregate): string {
  const total = totalTokens(a)
  const tpsAvg = a.total_sessions > 0 ? Math.round(total / a.total_sessions).toLocaleString() : "0"
  return `
<section>
  <h2>At a glance</h2>
  <div class="grid">
    <div class="card"><div class="muted">Sessions</div><div class="stat">${a.total_sessions.toLocaleString()}</div></div>
    <div class="card"><div class="muted">Days active</div><div class="stat">${a.days_active.toLocaleString()}</div></div>
    <div class="card"><div class="muted">Avg tokens/session</div><div class="stat">${tpsAvg}</div></div>
    <div class="card"><div class="muted">Total cost</div><div class="stat">$${a.total_cost.toFixed(2)}</div></div>
    <div class="card"><div class="muted">Multi-clauding events</div><div class="stat">${a.multi_clauding.overlap_events.toLocaleString()}</div></div>
  </div>
</section>`
}

function renderHoursHistogram(message_hours: number[]): string {
  const counts = new Array(24).fill(0) as number[]
  message_hours.forEach((h) => {
    const idx = Math.max(0, Math.min(23, Math.floor(h)))
    counts[idx] = (counts[idx] ?? 0) + 1
  })
  const max = counts.reduce((m, v) => (v > m ? v : m), 0)
  const bars = counts
    .map((c) => {
      const pct = max > 0 ? Math.max(1, Math.round((c / max) * 100)) : 0
      return `<div class="h" title="${c}" style="height:${pct}%"></div>`
    })
    .join("")
  const labels = Array.from({ length: 24 }, (_, i) => (i % 3 === 0 ? `<div>${i}</div>` : `<div></div>`)).join("")
  return `<div class="hours">${bars}</div><div class="hours-labels">${labels}</div>`
}

function renderHowYouUse(a: Aggregate): string {
  const goalEntries = sortDesc(a.goal_categories)
  const sessionTypes = sortDesc(a.session_types)
  const projectsEntries = Object.values(a.projects).sort((p1, p2) => p2.sessions - p1.sessions)
  const toolsEntries = sortDesc(a.tool_counts)
  const langEntries = sortDesc(a.languages)

  const goalBars = goalEntries.length > 0 ? renderBars(goalEntries, 10) : `<p class="muted">No data.</p>`
  const sessionTypePills =
    sessionTypes.length > 0
      ? sessionTypes
          .map(([k, v]) => `<span class="pill">${esc(k)} · ${v.toLocaleString()}</span>`)
          .join("")
      : `<p class="muted">No data.</p>`
  const projectRows =
    projectsEntries.length > 0
      ? projectsEntries
          .map(
            (p) =>
              `<tr><td>${esc(p.path)}</td><td>${esc(p.id)}</td><td>${p.sessions.toLocaleString()}</td></tr>`,
          )
          .join("")
      : `<tr><td colspan="3" class="muted">No projects.</td></tr>`
  const toolBars = toolsEntries.length > 0 ? renderBars(toolsEntries, 10) : `<p class="muted">No tool calls recorded.</p>`
  const langBars = langEntries.length > 0 ? renderBars(langEntries, 10) : `<p class="muted">No languages detected.</p>`

  return `
<section>
  <h2>How you use OpenCode</h2>
  <h3>Goal categories</h3>
  ${goalBars}
  <h3>Session types</h3>
  <div>${sessionTypePills}</div>
  <h3>Projects</h3>
  <table><thead><tr><th>Path</th><th>ID</th><th>Sessions</th></tr></thead><tbody>${projectRows}</tbody></table>
  <h3>Time of day</h3>
  ${renderHoursHistogram(a.message_hours)}
  <h3>Top tools</h3>
  ${toolBars}
  <h3>Languages</h3>
  ${langBars}
</section>`
}

function renderInteractionStyle(s: NonNullable<Sections["interaction_style"]>): string {
  return `
<section>
  <h2>What makes your usage distinctive</h2>
  <p>${esc(s.narrative)}</p>
  ${s.key_pattern ? `<p><strong>${esc(s.key_pattern)}</strong></p>` : ""}
</section>`
}

function renderWhatWorks(s: NonNullable<Sections["what_works"]>): string {
  const items =
    s.impressive_workflows.length > 0
      ? `<ul>${s.impressive_workflows
          .map((w) => `<li><strong>${esc(w.title)}</strong> — ${esc(w.description)}</li>`)
          .join("")}</ul>`
      : ""
  return `
<section>
  <h2>What's working well</h2>
  <p>${esc(s.intro)}</p>
  ${items}
</section>`
}

function renderFriction(s: NonNullable<Sections["friction_analysis"]>): string {
  const cats =
    s.categories.length > 0
      ? s.categories
          .map((c) => {
            const examples =
              c.examples.length > 0
                ? `<ul>${c.examples.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>`
                : ""
            return `<div class="card"><h3>${esc(c.category)}</h3><p>${esc(c.description)}</p>${examples}</div>`
          })
          .join("")
      : ""
  return `
<section>
  <h2>What to change</h2>
  <p>${esc(s.intro)}</p>
  ${cats}
</section>`
}

function renderSuggestions(s: NonNullable<Sections["suggestions"]>): string {
  const agentsMd =
    s.agents_md_additions.length > 0
      ? `<h3>AGENTS.md additions</h3><ul>${s.agents_md_additions
          .map(
            (a) =>
              `<li><p><strong>${esc(a.addition)}</strong> — ${esc(a.why)}</p>${
                a.prompt_scaffold ? `<pre>${esc(a.prompt_scaffold)}</pre>` : ""
              }</li>`,
          )
          .join("")}</ul>`
      : ""
  const features =
    s.features_to_try.length > 0
      ? `<h3>Features to try</h3><ul>${s.features_to_try
          .map(
            (f) =>
              `<li><p><strong>${esc(f.feature)}</strong> — ${esc(f.one_liner)}</p><p class="muted">${esc(f.why_for_you)}</p>${
                f.example_code ? `<pre>${esc(f.example_code)}</pre>` : ""
              }</li>`,
          )
          .join("")}</ul>`
      : ""
  const usage =
    s.usage_patterns.length > 0
      ? `<h3>Usage patterns</h3><ul>${s.usage_patterns
          .map(
            (u) =>
              `<li><p><strong>${esc(u.title)}</strong> — ${esc(u.suggestion)}</p><p>${esc(u.detail)}</p>${
                u.copyable_prompt ? `<pre>${esc(u.copyable_prompt)}</pre>` : ""
              }</li>`,
          )
          .join("")}</ul>`
      : ""
  return `
<section>
  <h2>Suggestions</h2>
  ${agentsMd}
  ${features}
  ${usage}
</section>`
}

function renderHorizon(s: NonNullable<Sections["on_the_horizon"]>): string {
  const items =
    s.opportunities.length > 0
      ? `<ul>${s.opportunities
          .map(
            (o) =>
              `<li><p><strong>${esc(o.title)}</strong></p><p>${esc(o.whats_possible)}</p><p class="muted">${esc(o.how_to_try)}</p>${
                o.copyable_prompt ? `<pre>${esc(o.copyable_prompt)}</pre>` : ""
              }</li>`,
          )
          .join("")}</ul>`
      : ""
  return `
<section>
  <h2>On the horizon</h2>
  <p>${esc(s.intro)}</p>
  ${items}
</section>`
}

function renderFunEnding(s: NonNullable<Sections["fun_ending"]>): string {
  return `
<section>
  <h2>Memorable moment</h2>
  <div class="banner"><h3>${esc(s.headline)}</h3><p>${esc(s.detail)}</p></div>
</section>`
}

function renderArchive(a: Aggregate): string {
  const groups = new Map<string, Aggregate["session_summaries"]>()
  a.session_summaries.forEach((s) => {
    const key = s.project_path || "(unknown project)"
    const existing = groups.get(key) ?? []
    existing.push(s)
    groups.set(key, existing)
  })
  const sortedGroups = Array.from(groups.entries()).sort((a1, b1) => a1[0].localeCompare(b1[0]))
  const body =
    sortedGroups.length > 0
      ? sortedGroups
          .map(([projectPath, sessions]) => {
            const items = sessions
              .map((s) => {
                const outcome = s.outcome ? ` <span class="muted">— ${esc(s.outcome)}</span>` : ""
                const goal = s.goal ? ` <span class="muted">(${esc(s.goal)})</span>` : ""
                return `<li><code>${esc(s.id)}</code> · ${esc(s.started_iso)}${goal}: ${esc(s.summary)}${outcome}</li>`
              })
              .join("")
            return `<div class="archive-group"><h4>${esc(projectPath)} <span class="muted">(${sessions.length})</span></h4><ul class="archive-list">${items}</ul></div>`
          })
          .join("")
      : `<p class="muted">No sessions recorded.</p>`
  return `
<section>
  <h2>Session archive</h2>
  <details>
    <summary>${a.session_summaries.length.toLocaleString()} sessions</summary>
    ${body}
  </details>
</section>`
}

export interface RenderInput {
  aggregate: Aggregate
  sections: Sections
  generated_at_iso: string
}

export function renderReport(input: RenderInput): string {
  const a = input.aggregate
  const dateRange = `${new Date(a.date_range.start_ms).toISOString().slice(0, 10)} → ${new Date(a.date_range.end_ms)
    .toISOString()
    .slice(0, 10)}`
  const personality = input.sections.interaction_style?.key_pattern ?? ""
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><title>OpenCode — Your Usage Report</title>
<style>${CSS}</style>
</head><body>
<header>
  <h1>OpenCode — Your Usage Report</h1>
  <p class="muted">${esc(dateRange)} · ${a.total_sessions.toLocaleString()} sessions · generated ${esc(input.generated_at_iso)}</p>
  ${personality ? `<p><strong>${esc(personality)}</strong></p>` : ""}
</header>
${renderAtAGlance(a)}
${renderHowYouUse(a)}
${input.sections.interaction_style ? renderInteractionStyle(input.sections.interaction_style) : ""}
${input.sections.what_works ? renderWhatWorks(input.sections.what_works) : ""}
${input.sections.friction_analysis ? renderFriction(input.sections.friction_analysis) : ""}
${input.sections.suggestions ? renderSuggestions(input.sections.suggestions) : ""}
${input.sections.on_the_horizon ? renderHorizon(input.sections.on_the_horizon) : ""}
${input.sections.fun_ending ? renderFunEnding(input.sections.fun_ending) : ""}
${renderArchive(a)}
</body></html>`
}

export * as InsightsRender from "./render"
