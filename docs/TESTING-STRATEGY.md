# Testing strategy

What is tested, at which layer, and why — plus what is deliberately not tested.

---

## 1. The risk model

Testing effort follows what it would cost to get wrong, not what is easy to
reach. For a payments platform the ranking is not close:

| Rank | Risk | Why it leads | Where it is covered |
|---|---|---|---|
| 1 | **Money is created or destroyed** | Unrecoverable, and often silent — the books balance against a figure that is simply wrong | ledger invariant, concurrent approval, overdraft, reconciliation |
| 2 | **One tenant sees or moves another's data** | A single occurrence ends a whitelabel contract | `tests/security/tenant-isolation.spec.ts` |
| 3 | **A decision is applied twice, or half-applied** | Approval touches three modules; a partial write leaves state nobody can reason about | row locking, single-transaction credit + hold, state-machine refusals |
| 4 | **A bonus is paid to someone not entitled to it** | Direct loss, and usually discovered in aggregate long after | eligibility decided again at approval, withdrawn-promotion journey |
| 5 | **Someone acts outside their role** | Contained by the above if scoping holds, but the first step in most abuse | every authorisation rule tested as a pair |
| 6 | **A contract changes silently** | Cheap alone, expensive as the cause of a later mystery | contracts on every response, success and error alike |

Everything below that line — display formatting, pagination shape, ordering —
is not currently tested. That is a decision, not an oversight.

## 2. Layers, and what each is for

Each layer catches something the others structurally cannot.

| Layer | Count | Answers | Cost |
|---|---|---|---|
| **Unit** | 17 | Does the rule handle its boundaries? Inclusive minimums, exclusive deadlines, rounding | Milliseconds, no database, no clock |
| **Status** | every call | Did the call succeed? | Free — lives in the client, throws on an unexpected code |
| **Contract** | every response | Is the shape still what we agreed? | Free — Zod parse per response |
| **API** | 108 | Does the system do the right thing? | Seconds, needs the stack |
| **Journey** | 6 of the 108 | Do the parts work together across services? | Slowest, and the ones that matter most |

Fifty of those API tests are the **authorisation matrix** — every endpoint
against every kind of caller. The scattered `@security` tests each prove one rule
inside a scenario; the matrix proves the whole surface at once, which is a
different claim: that no route was added without an access decision being made
about it. A new endpoint with no row in the matrix is what it exists to catch.

It asserts the *outcome class* — unauthenticated, forbidden, permitted — not an
exact status. Whether a permitted call then answers 200, 404 or 409 depends on
the body it was given, and pinning that here would make the matrix a second copy
of the functional tests that breaks whenever they do.

**Why the pure rules get unit tests and nothing else does.** Eligibility and hold
progress are decisions with awkward boundaries — a deadline that is exclusive, a
minimum that is inclusive, a bonus that must round down. Reaching those through
HTTP means constructing state for each one and waiting on a database. As pure
functions they cost nothing to cover exhaustively.

The rest of the system is thin glue over the database. Unit-testing a repository
against a mocked database would assert that the code calls the mock the way the
test says it does, which is not a fact about the system.

**Why there is no mocking anywhere.** The suite runs against a real service and a
real database, started by one command. A mocked deposit approval could not have
caught the concurrent-credit bug, because that bug lives in the interaction
between two transactions.

## 3. What is deliberately not tested

Stating this matters as much as the coverage — silence reads as an oversight.

| Not tested | Why |
|---|---|
| **Browser / UI** | There is no UI yet. This is the largest known gap, and the next thing being built |
| **Performance under load** | No thresholds defined yet; asserting a latency nobody has agreed is theatre |
| **Repositories in isolation** | See above — a repository test against a mock asserts the mock |
| **Framework behaviour** | Fastify's routing and Zod's parsing are their maintainers' tests, not ours |
| **Idempotency of migrations beyond re-running them** | The runner records applied names; a corrupted history is an operations problem, not a suite one |
| **Multi-currency conversion** | The platform stores a currency per wallet and never converts. Nothing to test until it does |
| **Rate limiting** | Not implemented in the system under test |

## 4. How the suite is organised

**Folder = the service that owns the endpoint. Tags = why the test exists.** A
file lives in one folder but carries any number of tags, so the folder is spent
on the axis that changes least — services are architectural and stable, product
modules get renamed every redesign.

Cross-service chains live in `tests/journeys/`; tenant isolation lives in
`tests/security/`, because it belongs to no single service.

| Tag | Meaning |
|---|---|
| `@p0` | Breaks the product if it fails |
| `@smoke` | Thin and fast; the shortest useful signal |
| `@negative` | Error paths, refusals, boundaries |
| `@security` | Authorisation, tenancy, role boundaries |
| `@journey` | Crosses services |
| `@pending` | Its service is not built yet — kept as specification, excluded from the gate |

## 5. Isolation and test data

**Every test creates what it needs and removes it afterwards.** No test depends
on another's data, on execution order, or on a shared seed beyond the two tenants
and their administrators.

- Identifiers carry a random component, because a timestamp and a per-process
  counter are not unique across parallel workers.
- Administrators are worker-scoped — their state is read-mostly, so one login per
  worker is enough. Players are test-scoped and unique.
- Cleanup runs through one registry with a fixed order: **accounts first, then
  promotions.** Closing an account cascades its deposits, and a promotion cannot
  be removed while a deposit still cites it.
- A cleanup failure warns and does not fail the test. It leaves a row behind;
  failing a passing test over it would be worse.

Verified rather than assumed: three consecutive full runs leave the database
exactly as they found it.

## 6. Flaky tests

**A test that only passes on a retry has not passed.**

- `retries: 1` in CI, `0` locally. The retry stops one bad run blocking a merge;
  it is still reported as flaky and is not treated as a pass.
- **If a failure only reproduces in parallel, it is a bug about shared state, not
  noise.** Check serially before calling anything flake — that rule exists
  because a real collision in the test-data factory was nearly written off as
  one.
- A test that cannot be stabilised is tagged `@quarantine`, excluded from the
  gate, and either fixed or deleted within fourteen days. Nothing is quarantined
  today.
- Timing is never assumed. Anything eventually-consistent is polled, never read
  once — hold progress is applied by a background job, and the delay is
  configurable and never zero precisely so the suite cannot quietly assume
  otherwise.

## 7. When a test is finished

**A test written to catch a defect is not finished until it has been seen to fail
in that defect's presence.** Break the fix, watch it go red, put it back.

Applied so far to:

| Test | Broken to prove it |
|---|---|
| Concurrent approval | Row lock removed — both approvals succeeded |
| Response contracts | A response field renamed — `available: Required` |
| Tenant isolation (read) | Scoping removed from the deposit lookup |
| Tenant isolation (approve) | Scoping removed from the locking read |
| Authorisation matrix | Role check dropped from one admin endpoint |

Two of those first passed against the broken build and had to be rewritten. The
record is in [`lessons.md`](lessons.md).

## 8. Reporting

Two reports, because there are two different questions.

| Report | Answers | Audience |
|---|---|---|
| Playwright HTML | "What happened in this test?" — every step, call and assertion, with a trace on failure | Whoever is debugging it |
| `summary.md` (custom reporter) | "What does this suite cover, and is it healthy?" — totals, coverage by area and intent, failures, flakes, slowest tests | Anybody else |

The summary goes to the console, to the GitHub Actions job summary, and to the
published site — where it *is* the landing page, with the full Playwright report
beneath it at `/report`. Somebody handed the link gets a rendered answer, not a
raw file.

Journeys are written in named `test.step()` calls. The default report view is
HTTP calls and source locations, which is the right level for a failure and the
wrong level for understanding coverage — a reader who has never seen the code
should still be able to follow the chain and see which step it stopped at.

## 9. Gates

| Gate | Runs | Blocks |
|---|---|---|
| `npm run verify` | typecheck, lint, unit | Local, before pushing |
| `static` | the same, in CI | Merge |
| `stack starts` | `docker compose up` and `/health` | Merge |
| `api suite` | everything except `@pending` | Merge |
| `publish` | Deploys the report to Pages | Nothing — runs after a green `main` |
