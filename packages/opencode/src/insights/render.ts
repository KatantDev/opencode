import type { Aggregate, Sections } from "./schema"

const ESC_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESC_MAP[c]!)

const LOGO_SVG = String.raw`
<svg class="logo" viewBox="0 0 234 42" xmlns="http://www.w3.org/2000/svg" aria-label="opencode">
  <path class="fg-weak"   d="M18 30H6V18H18V30Z"/>
  <path class="fg-strong" d="M18 12H6V30H18V12ZM24 36H0V6H24V36Z"/>
  <path class="fg-weak"   d="M48 30H36V18H48V30Z"/>
  <path class="fg-strong" d="M36 30H48V12H36V30ZM54 36H36V42H30V6H54V36Z"/>
  <path class="fg-weak"   d="M84 24V30H66V24H84Z"/>
  <path class="fg-strong" d="M84 24H66V30H84V36H60V6H84V24ZM66 18H78V12H66V18Z"/>
  <path class="fg-weak"   d="M108 36H96V18H108V36Z"/>
  <path class="fg-strong" d="M108 12H96V36H90V6H108V12ZM114 36H108V12H114V36Z"/>
  <path class="fg-weak"   d="M144 30H126V18H144V30Z"/>
  <path class="fg-strong" d="M144 12H126V30H144V36H120V6H144V12Z"/>
  <path class="fg-weak"   d="M168 30H156V18H168V30Z"/>
  <path class="fg-strong" d="M168 12H156V30H168V12ZM174 36H150V6H174V36Z"/>
  <path class="fg-weak"   d="M198 30H186V18H198V30Z"/>
  <path class="fg-strong" d="M198 12H186V30H198V12ZM204 36H180V6H198V0H204V36Z"/>
  <path class="fg-weak"   d="M234 24V30H216V24H234Z"/>
  <path class="fg-strong" d="M216 12V18H228V12H216ZM234 24H216V30H234V36H210V6H234V24Z"/>
</svg>`

const CSS = String.raw`
  /* OpenCode share/docs design tokens (light) */
  :root {
    color-scheme: light dark;

    --bg:               hsl(0, 20%, 99%);
    --bg-weak:          hsl(0, 8%, 97%);
    --bg-weak-hover:    hsl(0, 8%, 94%);
    --bg-strong:        hsl(0, 5%, 12%);
    --bg-interactive:   hsl(62, 84%, 88%);

    --fg:               hsl(0, 1%, 39%);
    --fg-weak:          hsl(0, 1%, 60%);
    --fg-weaker:        hsl(0, 3%, 88%);
    --fg-strong:        hsl(0, 5%, 12%);

    --border:           hsl(30, 2%, 81%);
    --border-weak:      hsl(0, 1%, 85%);

    /* semantic (synthesized to fit the warm palette) */
    --accent:           hsl(0, 5%, 12%);
    --accent-soft:      hsl(62, 84%, 88%);
    --good:             hsl(140, 45%, 38%);
    --warn:             hsl(28,  85%, 48%);
    --danger:           hsl(8,   78%, 52%);

    --font-mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --bg:             hsl(0, 9%, 7%);
      --bg-weak:        hsl(0, 6%, 10%);
      --bg-weak-hover:  hsl(0, 6%, 14%);
      --bg-strong:      hsl(0, 15%, 94%);
      --bg-interactive: hsl(62, 100%, 90%);

      --fg:             hsl(0, 4%, 71%);
      --fg-weak:        hsl(0, 2%, 49%);
      --fg-weaker:      hsl(0, 3%, 28%);
      --fg-strong:      hsl(0, 15%, 94%);

      --border:         hsl(0, 3%, 28%);
      --border-weak:    hsl(0, 4%, 23%);

      --accent:         hsl(0, 15%, 94%);
      --accent-soft:    hsl(62, 100%, 90%);
      --good:           hsl(140, 45%, 60%);
      --warn:           hsl(38,  90%, 60%);
      --danger:         hsl(8,   78%, 64%);
    }
  }

  * { box-sizing: border-box; }

  body {
    font-family: var(--font-mono);
    font-size: 14px;
    line-height: 1.6875;
    background: var(--bg);
    color: var(--fg);
    max-width: 960px;
    margin: 2.5rem auto;
    padding: 0 1.5rem;
    -webkit-font-smoothing: antialiased;
  }

  /* Header / brand */
  header.report-head { display: flex; align-items: center; gap: 1rem; margin-bottom: 2rem; }
  header.report-head .logo { height: 28px; width: auto; }
  header.report-head .logo .fg-strong { fill: var(--fg-strong); }
  header.report-head .logo .fg-weak   { fill: var(--fg-weaker); }
  header.report-head .meta { color: var(--fg-weak); font-size: 13px; }

  h1, h2, h3, h4 { font-weight: 500; color: var(--fg-strong); line-height: 1.2; letter-spacing: -0.01em; }
  h1 { font-size: 26px; margin: 0 0 .25rem 0; }
  h2 { font-size: 22px; margin: 2.5rem 0 1rem 0; padding-bottom: .5rem; border-bottom: 1px solid var(--border-weak); }
  h3 { font-size: 18px; margin: 1.5rem 0 .5rem 0; }
  h4 { font-size: 16px; margin: 1rem 0 .25rem 0; }
  strong { font-weight: 500; color: var(--fg-strong); }

  .muted { color: var(--fg-weak); }

  .grid { display: grid; gap: .75rem; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }

  /* Cards: flat, hairline border, no shadow */
  .card {
    background: var(--bg-weak);
    border: 1px solid var(--border-weak);
    border-radius: 4px;
    padding: .875rem 1rem;
  }
  .stat { font-size: 1.6rem; font-weight: 500; color: var(--fg-strong); margin-top: .25rem; }

  /* Bar rows: dark-fg fill on light bg, light-fg fill on dark bg */
  .bar-row { display: grid; grid-template-columns: 18ch 1fr 8ch; align-items: center; gap: .75rem; margin: .35rem 0; font-size: 13px; }
  .bar-track { background: var(--bg-weak); border: 1px solid var(--border-weak); border-radius: 3px; height: 14px; overflow: hidden; }
  .bar { height: 100%; background: var(--accent); border-radius: 0; min-width: 2px; }
  .bar.warn { background: var(--warn); }
  .bar.good { background: var(--good); }

  /* Hour histogram: brand "interactive" yellow-green */
  .hours { display: grid; grid-template-columns: repeat(24, 1fr); gap: 2px; align-items: end; height: 80px; margin: .5rem 0; }
  .hours .h { background: var(--accent-soft); border: 1px solid var(--border-weak); border-radius: 0; min-height: 1px; }
  .hours-labels { display: grid; grid-template-columns: repeat(24, 1fr); font-size: 11px; color: var(--fg-weak); text-align: center; }

  details > summary {
    cursor: pointer;
    padding: .5rem 0;
    font-weight: 500;
    color: var(--fg-strong);
    list-style: none;
  }
  details > summary::before { content: "▸ "; color: var(--fg-weak); }
  details[open] > summary::before { content: "▾ "; }

  ul, ol { padding-left: 1.25rem; }
  li { margin: .125rem 0; }

  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: .4rem .6rem; border-bottom: 1px solid var(--border-weak); }
  th { font-weight: 500; color: var(--fg-strong); }

  pre, code { font-family: var(--font-mono); }
  pre {
    background: var(--bg-weak);
    border: 1px solid var(--border-weak);
    padding: .75rem 1rem;
    border-radius: 6px;
    overflow-x: auto;
    white-space: pre-wrap;
    font-size: 13px;
    line-height: 1.55;
  }

  .pill {
    display: inline-block;
    padding: .15rem .55rem;
    border-radius: 999px;
    background: var(--bg-weak);
    border: 1px solid var(--border-weak);
    color: var(--fg);
    font-size: 12px;
    margin: .15rem .15rem 0 0;
  }
  .pill.accent { background: var(--bg-interactive); border-color: transparent; color: var(--fg-strong); }

  .ok    { color: var(--good); }
  .warn  { color: var(--warn); }
  .danger{ color: var(--danger); }

  .banner {
    background: var(--bg-weak);
    border: 1px solid var(--border-weak);
    border-left: 2px solid var(--bg-strong);
    border-radius: 4px;
    padding: 1rem 1.25rem;
  }

  .archive-group { margin: .5rem 0 1rem 0; }
  .archive-group h4 { margin: .5rem 0 .25rem 0; font-size: 14px; }
  .archive-list { margin: 0; padding-left: 1.25rem; }

  hr { border: none; border-top: 1px solid var(--border-weak); margin: 2rem 0; }

  a { color: var(--fg-strong); text-underline-offset: 3px; }
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
<meta charset="utf-8">
<title>OpenCode — Your Usage Report</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head><body>
<header class="report-head">
  ${LOGO_SVG}
  <div>
    <h1>Your Usage Report</h1>
    <p class="meta">${esc(dateRange)} · ${a.total_sessions.toLocaleString()} sessions · generated ${esc(input.generated_at_iso)}</p>
    ${personality ? `<p><strong>${esc(personality)}</strong></p>` : ""}
  </div>
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
