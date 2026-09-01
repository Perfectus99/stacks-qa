# stacks-qa

[![ci](https://github.com/Perfectus99/stacks-qa/actions/workflows/ci.yml/badge.svg)](https://github.com/Perfectus99/stacks-qa/actions/workflows/ci.yml)

API test automation for a multi-tenant payments platform — users, wallets,
payments and promotions — **with the system under test included**, so the whole
thing runs from a clean clone.

**[Read the latest test report →](https://perfectus99.github.io/stacks-qa/)**
Published from `main` on every green run. Journeys are written in named steps,
so the report reads as the business chain rather than a list of HTTP calls —
`playwright-report/summary.md` beside it is the plain-text version.

```bash
git clone https://github.com/Perfectus99/stacks-qa && cd stacks-qa
npm install
docker compose up -d --wait     # the system under test, on :3100
npm run test:api                # 108 API tests
```

> **Status:** the full promotional lifecycle works — deposit, approval, bonus,
> hold, and release through qualifying spend. 108 API tests and 17 unit tests,
> all passing, nothing pending.

---

## Why the tests come first

The suite is not written against an existing API — it *is* the specification for
one. Each test describes a business chain that must work; the API is then built
until the test passes. Anything no test asks for does not get built.

Two consequences, which are the point rather than a side-effect:

- The specification is **executable**. It went red on day one and turned green a
  service at a time. A written spec cannot fail, so it cannot tell you anything.
- The endpoint surface stays exactly as large as the behaviour it supports.

## What is under test

A deliberately awkward system, because the awkward parts are the ones worth
testing:

| | |
|---|---|
| **Multi-tenant** | two tenants are seeded, so isolation tests are capable of failing; usernames are unique per tenant, not globally |
| **A ledger** | the balance is maintained by a database trigger on ledger inserts, and `GET /wallet/reconciliation` compares the two |
| **A decision with side effects in three modules** | approving a deposit transitions it, credits the wallet, grants a bonus and opens a hold — in one transaction |
| **Eventual consistency** | hold progress is applied by a background job, not inline |
| **A real state machine** | deposits and holds both have terminal states and refuse to leave them |

## Running it

```bash
npm run test:api      # 108 API tests against the running stack
npm run test:unit     # 17 unit tests — no database, no server
npm run test:ci       # what CI runs: everything except @pending
npm run verify        # typecheck + lint + unit, the static gate
```

**Ports are deliberately uncommon** — `3100` for the API, `5442` for the
database — so the stack never collides with whatever else is running locally.

## Layout

```
apps/demo-api/          the system under test — one process, one module per service
                        (pure rules carry unit tests beside the code)
packages/core/          the typed client, and the response contracts it enforces
packages/test-data/     factories; uniqueness and cleanup live here, never in a spec
suites/regression/      the API suite: folder = owning service, tags = why it exists
docs/                   TESTING-STRATEGY.md · lessons.md · a bug report worth reading
```

Folders appear when their first test lands. An empty skeleton is a promise the
repository has not kept.

## How the suite is organised

**Folder = the service that owns the endpoint. Tags = why the test exists.**
A file lives in one folder but carries any number of tags, so the folder is spent
on the axis that changes least. Services are architectural and stable; product
modules get renamed every redesign.

```
tests/payment/admin/deposit-approve.spec.ts     ← who owns this
test('… @negative @security @p0 @payment')      ← why it exists
```

Cross-service chains live in `tests/journeys/`, and tenant isolation and the
authorisation matrix in `tests/security/` — no single service owns them.

**Assertions are layered, and each layer catches what the others cannot:**

| Layer | Catches | Where |
|---|---|---|
| Status | the call failed | the client, which throws on an unexpected code |
| **Contract** | a field renamed, dropped or retyped | `packages/core/src/contracts.ts`, checked on every response — errors included |
| Business | the *system* is wrong | the spec — "the balance moved by exactly the amount deposited" |

The contract layer is the one most suites skip. Status assertions sail straight
past a renamed field; business assertions only catch fields they happen to read.
Here a break fails in the call that caused it, naming the field.

**Journeys are written in named steps.** The report's default view is HTTP calls
and source lines, which is the right level for debugging a failure and the wrong
level for understanding what a chain covers. Named steps make the report legible
to somebody who has never seen the code, and show which step it stopped at.

**Two reports, because there are two questions.** The HTML report answers "what
happened in this test". A custom reporter
([`reporters/summary.ts`](suites/regression/reporters/summary.ts)) answers "what
does the suite cover and is it healthy" — totals, coverage by area and intent,
failures, flakes and the slowest tests, as Markdown. It prints to the console,
writes `playwright-report/summary.md`, and appends to the GitHub Actions job
summary so the run page itself carries it.

**Actors are fixtures.** `admin` is worker-scoped, because admin state is
read-mostly and one login per worker is enough. `player` is test-scoped and
unique, because two tests sharing a wallet couple their balances and fail in
whichever order is unlucky.

**`@pending`** marks a test whose service is not built yet. It stays in the
repository because it is the specification for what comes next, and out of the
CI gate so a red build always means a real regression.

## Principles the suite holds itself to

**Every authorisation rule gets a pair** — someone who may, and someone who may
not. A test that only proves an endpoint refuses cannot tell "correctly refuses"
from "refuses everyone". That distinction hid a broken authentication hook for
two sessions.

**A test written to catch a defect is not finished until it has been seen to
fail.** Break the fix, watch it go red, put the fix back. The concurrent-approval
test passed against a build with the row lock removed until it was checked that
way — [`docs/bugs/001`](docs/bugs/001-double-credit-on-concurrent-approval.md).

**If it only fails in parallel, it is a bug about shared state, not flake.**

**Unique means unique at the concurrency the suite actually runs at.** A
per-process counter is not.

Everything above is a rule because something went wrong first.
[`docs/lessons.md`](docs/lessons.md) is the record, and
[`docs/TESTING-STRATEGY.md`](docs/TESTING-STRATEGY.md) is the reasoning: the risk
model, what each layer is for, and what is deliberately **not** tested.

## How the system under test is built

**One process, one module per service.** Not four containers: the suite folds by
service and the URL prefixes preserve that, while the whole system still starts
with one command. Modules never import each other's internals — each publishes a
narrow surface and nothing else.

**Money is stored in minor units as an integer.** Floats invite the rounding
class of bug that is hardest to notice and worst to explain.

**The ledger is the record; the balance is a convenience.** A trigger maintains
the balance from ledger inserts, so every path that writes an entry moves the
balance by exactly that amount — including paths written later by someone who
has not read this file.

**Eligibility for a bonus is decided twice** — previewed when a deposit is
submitted, decided again when it is approved, because a promotion can be
withdrawn in between. One pure function does both, so the two moments cannot
drift apart.

**Release progress is deliberately eventual.** The delay is configurable and
never zero: a queue that ran inline in CI would let the suite quietly assume
immediacy and pass, which is the same thing as not testing it. Every read of
progress polls.

**Request bodies are `.strict()`.** An unknown field is a `400`, not a shrug.

## Build order

| | | |
|---|---|---|
| 1 | Workspace, typed client, the first three chains as failing tests | ✅ |
| 2 | `demo-api` skeleton, docker compose, CI | ✅ |
| 3 | `user` — registration and login turn green | ✅ |
| 4 | `wallet` — balances, ledger, reconciliation | ✅ |
| 5 | `payment` — the deposit approval journey turns green | ✅ |
| 6 | `promotion` — deposits with a bonus attached | ✅ |
| 7 | Holds — release requirement, progress, expiry | ✅ |
| 8 | Response contracts, published report | ✅ |
| 9 | Tenant isolation, real teardown, testing strategy | ✅ |
| 10 | Browser layer over a minimal UI | next |
| 11 | Load thresholds and an authorisation matrix | |
