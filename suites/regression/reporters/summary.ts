import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter'

/**
 * A summary somebody can read.
 *
 * The HTML report answers "what happened in this test" — it lists HTTP calls
 * and source lines, which is the right level when something has failed and
 * somebody is debugging it. It is the wrong level for the far more common
 * question: "what does this suite actually cover, and is it healthy?"
 *
 * This writes that answer as plain Markdown: totals, coverage by area and by
 * tag, and any failures with the reason. It goes to the console, to a file
 * beside the HTML report, and — when running in GitHub Actions — to the job
 * summary, so the run page itself carries it.
 */

interface Row {
  area: string
  title: string
  file: string
  line: number
  tags: string[]
  status: TestResult['status']
  retries: number
  durationMs: number
}

const AREA_LABELS: Record<string, string> = {
  journeys: 'Cross-service journeys',
  security: 'Security',
  user: 'Identity',
  wallet: 'Wallet & ledger',
  payment: 'Payments',
  promotion: 'Promotions',
}

const REPORTED_TAGS = ['@p0', '@smoke', '@negative', '@security', '@journey', '@pending']

export default class SummaryReporter implements Reporter {
  private rows: Row[] = []
  private testDir = ''
  private startedAt = 0

  onBegin(config: FullConfig, suite: Suite): void {
    this.testDir = config.projects[0]?.testDir ?? ''
    this.startedAt = Date.now()
    void suite
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const file = relative(this.testDir, test.location.file)
    this.rows.push({
      area: file.split('/')[0] ?? 'other',
      title: test.title.replace(/\s*@[a-z0-9-]+/g, '').trim(),
      file,
      line: test.location.line,
      tags: test.title.match(/@[a-z0-9-]+/g) ?? [],
      status: result.status,
      retries: result.retry,
      durationMs: result.duration,
    })
  }

  onEnd(result: FullResult): void {
    const markdown = this.render(result)

    // The site root is this page; the full Playwright report is published
    // beneath it at /report. A link somebody opens should render, not hand
    // them raw Markdown.
    const site = resolve(this.testDir, '..', 'site')
    mkdirSync(site, { recursive: true })
    writeFileSync(resolve(site, 'index.html'), this.renderHtml(result), 'utf8')
    writeFileSync(resolve(site, 'summary.md'), markdown, 'utf8')

    const beside = resolve(this.testDir, '..', 'playwright-report', 'summary.md')
    mkdirSync(dirname(beside), { recursive: true })
    writeFileSync(beside, markdown, 'utf8')

    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown, 'utf8')
    }

    console.log(`\n${markdown}`)
    console.log(`Written to ${relative(process.cwd(), beside)} and site/index.html`)
  }

  private renderHtml(result: FullResult): string {
    const total = this.rows.length
    const passed = this.rows.filter((r) => r.status === 'passed').length
    const failed = this.rows.filter((r) => r.status === 'failed' || r.status === 'timedOut')
    const flaky = this.rows.filter((r) => r.status === 'passed' && r.retries > 0)
    const ok = result.status === 'passed'
    const seconds = ((Date.now() - this.startedAt) / 1000).toFixed(1)
    const sha = (process.env.GITHUB_SHA ?? '').slice(0, 7)
    const when = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC'

    const esc = (v: string) =>
      v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

    const areaRows = [...new Set(this.rows.map((r) => r.area))]
      .sort()
      .map((area) => {
        const inArea = this.rows.filter((r) => r.area === area)
        const bad = inArea.filter((r) => r.status === 'failed').length
        return `<tr><td>${esc(AREA_LABELS[area] ?? area)}</td><td class="n">${inArea.length}</td><td class="n good">${inArea.filter((r) => r.status === 'passed').length}</td><td class="n ${bad ? 'bad' : 'dim'}">${bad}</td></tr>`
      })
      .join('')

    const meanings: Record<string, string> = {
      '@p0': 'Breaks the product if it fails',
      '@smoke': 'Shortest useful signal',
      '@negative': 'Error paths and refusals',
      '@security': 'Authorisation, tenancy, roles',
      '@journey': 'Crosses services',
      '@pending': 'Specification for work not yet built',
    }
    const tagRows = REPORTED_TAGS.map((tag) => {
      const count = this.rows.filter((r) => r.tags.includes(tag)).length
      return count === 0
        ? ''
        : `<tr><td><code>${tag}</code></td><td class="mut">${meanings[tag]}</td><td class="n">${count}</td></tr>`
    }).join('')

    const failureBlock = failed.length
      ? `<h2>Failures</h2><ul class="fails">${failed
          .map(
            (r) =>
              `<li><strong>${esc(r.title)}</strong><span class="mut">${esc(r.file)}:${r.line} · ${r.tags.join(' ')}</span></li>`,
          )
          .join('')}</ul>`
      : ''

    const flakyBlock = flaky.length
      ? `<h2>Flaky — passed only on a retry</h2><ul class="fails">${flaky
          .map((r) => `<li><strong>${esc(r.title)}</strong><span class="mut">${esc(r.file)}:${r.line}</span></li>`)
          .join('')}</ul><p class="note">A test that only passes on a retry has not passed. If it reproduces only under parallelism it is a bug about shared state, not noise.</p>`
      : ''

    const slowRows = [...this.rows]
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, 5)
      .map((r) => `<tr><td>${esc(r.title)}</td><td class="n mut">${(r.durationMs / 1000).toFixed(2)}s</td></tr>`)
      .join('')

    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>stacks-qa — API suite</title>
<style>
:root{--bg:#fbfbfa;--card:#fff;--ink:#17181a;--mut:#6b6f76;--line:#e6e6e3;--good:#1a7f4b;--bad:#c0392b;--accent:#2f5fd0}
@media(prefers-color-scheme:dark){:root{--bg:#111213;--card:#191a1c;--ink:#ecebe8;--mut:#9a9ea6;--line:#2b2d30;--good:#5fc98d;--bad:#f07a6c;--accent:#8fb0ff}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);padding:48px 20px 80px;
 font:15px/1.55 ui-sans-serif,-apple-system,"Segoe UI",Inter,system-ui,sans-serif}
.wrap{max-width:820px;margin:0 auto}
h1{font-size:22px;margin:0 0 2px;letter-spacing:-.01em}
.sub{color:var(--mut);margin:0 0 22px;font-size:14px}
.status{display:inline-flex;align-items:center;gap:9px;font-size:13px;font-weight:650;
 letter-spacing:.06em;text-transform:uppercase;padding:6px 13px;border-radius:99px;
 border:1px solid var(--line);background:var(--card)}
.dot{width:8px;height:8px;border-radius:50%}
.headline{font-size:28px;font-weight:660;letter-spacing:-.02em;margin:18px 0 4px}
.headline .of{color:var(--mut);font-weight:400}
.meta{color:var(--mut);font-size:13.5px;margin:0 0 26px}
a.cta{display:inline-block;margin:0 0 34px;padding:10px 17px;border-radius:8px;
 background:var(--accent);color:#fff;text-decoration:none;font-weight:600;font-size:14px}
h2{font-size:12px;letter-spacing:.09em;text-transform:uppercase;color:var(--mut);
 margin:32px 0 12px;font-weight:650}
table{width:100%;border-collapse:collapse;background:var(--card);
 border:1px solid var(--line);border-radius:10px;overflow:hidden;font-size:14px}
th{text-align:left;font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:var(--mut);
 font-weight:600;padding:11px 14px;border-bottom:1px solid var(--line)}
td{padding:10px 14px;border-bottom:1px solid var(--line)}
tr:last-child td{border-bottom:0}
.n{text-align:right;font-variant-numeric:tabular-nums}
.good{color:var(--good)}.bad{color:var(--bad);font-weight:650}.dim{color:var(--mut)}
.mut{color:var(--mut)}
code{font:12.5px ui-monospace,SFMono-Regular,Menlo,monospace}
ul.fails{list-style:none;padding:0;margin:0;background:var(--card);
 border:1px solid var(--line);border-radius:10px;overflow:hidden}
ul.fails li{padding:11px 14px;border-bottom:1px solid var(--line);display:flex;
 flex-direction:column;gap:3px;font-size:14px}
ul.fails li:last-child{border-bottom:0}
ul.fails span{font:12px ui-monospace,SFMono-Regular,Menlo,monospace}
.note{color:var(--mut);font-size:13.5px}
footer{margin-top:44px;padding-top:16px;border-top:1px solid var(--line);
 color:var(--mut);font-size:12.5px}
footer a{color:var(--accent)}
</style></head><body><div class="wrap">
<h1>stacks-qa · API suite</h1>
<p class="sub">Automated tests against a multi-tenant payments platform.</p>

<span class="status"><span class="dot" style="background:${ok ? 'var(--good)' : 'var(--bad)'}"></span>${ok ? 'Passed' : 'Failed'}</span>

<div class="headline">${passed}<span class="of">/${total} passed</span></div>
<p class="meta">${failed.length} failed · ${flaky.length} flaky · ${seconds}s · ${when}${sha ? ` · <code>${sha}</code>` : ''}</p>

<a class="cta" href="report/">Open the full report →</a>

<h2>Coverage by area</h2>
<table><tr><th>Area</th><th class="n">Tests</th><th class="n">Passed</th><th class="n">Failed</th></tr>${areaRows}</table>

<h2>Coverage by intent</h2>
<table><tr><th>Tag</th><th>Meaning</th><th class="n">Tests</th></tr>${tagRows}</table>

${failureBlock}
${flakyBlock}

<h2>Slowest tests</h2>
<table><tr><th>Test</th><th class="n">Duration</th></tr>${slowRows}</table>

<footer>
Published from <code>main</code> on every green run ·
<a href="https://github.com/Perfectus99/stacks-qa">source</a> ·
<a href="summary.md">summary.md</a>
</footer>
</div></body></html>`
  }

  private render(result: FullResult): string {
    const total = this.rows.length
    const passed = this.rows.filter((r) => r.status === 'passed').length
    const failed = this.rows.filter((r) => r.status === 'failed' || r.status === 'timedOut')
    // A test that only passed on a retry has not passed cleanly, and saying so
    // is the entire point of tracking it separately.
    const flaky = this.rows.filter((r) => r.status === 'passed' && r.retries > 0)
    const skipped = this.rows.filter((r) => r.status === 'skipped').length
    const seconds = ((Date.now() - this.startedAt) / 1000).toFixed(1)

    const lines: string[] = []
    const verdict = result.status === 'passed' ? 'PASSED' : result.status.toUpperCase()

    lines.push(`# API suite — ${verdict}`)
    lines.push('')
    lines.push(
      `**${passed}/${total} passed** · ${failed.length} failed · ${flaky.length} flaky · ${skipped} skipped · ${seconds}s`,
    )
    lines.push('')

    // --- what it covers ----------------------------------------------------
    lines.push('## Coverage by area')
    lines.push('')
    lines.push('| Area | Tests | Passed | Failed |')
    lines.push('|---|---:|---:|---:|')
    for (const area of [...new Set(this.rows.map((r) => r.area))].sort()) {
      const inArea = this.rows.filter((r) => r.area === area)
      lines.push(
        `| ${AREA_LABELS[area] ?? area} | ${inArea.length} | ${inArea.filter((r) => r.status === 'passed').length} | ${inArea.filter((r) => r.status === 'failed').length} |`,
      )
    }
    lines.push(`| **Total** | **${total}** | **${passed}** | **${failed.length}** |`)
    lines.push('')

    // --- why the tests exist ------------------------------------------------
    lines.push('## Coverage by intent')
    lines.push('')
    lines.push('| Tag | Meaning | Tests |')
    lines.push('|---|---|---:|')
    const meanings: Record<string, string> = {
      '@p0': 'Breaks the product if it fails',
      '@smoke': 'Shortest useful signal',
      '@negative': 'Error paths and refusals',
      '@security': 'Authorisation, tenancy, roles',
      '@journey': 'Crosses services',
      '@pending': 'Specification for work not yet built',
    }
    for (const tag of REPORTED_TAGS) {
      const count = this.rows.filter((r) => r.tags.includes(tag)).length
      if (count > 0) lines.push(`| \`${tag}\` | ${meanings[tag]} | ${count} |`)
    }
    lines.push('')

    // --- what went wrong ----------------------------------------------------
    if (failed.length > 0) {
      lines.push('## Failures')
      lines.push('')
      for (const row of failed) {
        lines.push(`- **${row.title}**`)
        lines.push(`  \`${row.file}:${row.line}\` · ${row.tags.join(' ')}`)
      }
      lines.push('')
    }

    if (flaky.length > 0) {
      lines.push('## Flaky — passed only on a retry')
      lines.push('')
      for (const row of flaky) {
        lines.push(`- **${row.title}** — \`${row.file}:${row.line}\``)
      }
      lines.push('')
      lines.push(
        '> A test that only passes on a retry has not passed. If it reproduces only under parallelism it is a bug about shared state, not noise.',
      )
      lines.push('')
    }

    // --- the slow ones ------------------------------------------------------
    const slowest = [...this.rows].sort((a, b) => b.durationMs - a.durationMs).slice(0, 5)
    lines.push('## Slowest tests')
    lines.push('')
    lines.push('| Test | Duration |')
    lines.push('|---|---:|')
    for (const row of slowest) {
      lines.push(`| ${row.title} | ${(row.durationMs / 1000).toFixed(2)}s |`)
    }
    lines.push('')

    return lines.join('\n')
  }
}
