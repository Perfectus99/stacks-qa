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

    const out = resolve(this.testDir, '..', 'playwright-report', 'summary.md')
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, markdown, 'utf8')

    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown, 'utf8')
    }

    console.log(`\n${markdown}`)
    console.log(`Written to ${relative(process.cwd(), out)}`)
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
