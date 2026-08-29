# stacks-qa

API test automation for a multi-tenant payments platform — wallet, payments,
promotions and users — with the system under test included, so the whole thing
runs from a clean clone.

> **Status: identity and wallet work.** Registration, sessions, balances and the
> ledger are built and tested. Payments still answer `501`. 15 of 18 tests pass;
> the other three are tagged `@pending`. See [Build order](#build-order).

## Why the tests come first

The suite is not written against an existing API — it *is* the specification for
one. Each test describes a business chain that must work; the API is then built
until the test passes. Anything no test asks for does not get built.

Two consequences worth stating, because they are the point rather than a
side-effect:

- The specification is **executable**. It goes red on day one and turns green a
  service at a time. A written spec cannot fail, so it cannot tell you anything.
- The endpoint surface stays exactly as large as the behaviour it supports.

## Layout

```
apps/demo-api/          the system under test — one process, one module per service
packages/core/          the typed client — one definition of how to call the platform
packages/test-data/     factories; uniqueness and cleanup live here, never in a spec
suites/regression/      the API suite: folder = owning service, tags = why it exists
```

Folders appear when their first test lands. An empty skeleton is a promise the
repository has not kept.

## Running it

```bash
docker compose up -d --wait     # the system under test, on :3100
npm install
npm run test:api
```

Fifteen tests pass. The remaining three are tagged **`@pending`** — their service
has not been built yet, so they fail with `501 NOT_IMPLEMENTED`. They stay in
the repository because they are the specification for what comes next, and out
of the CI gate so a red build always means a real regression:

```bash
npm run test:ci     # what CI runs — everything except @pending
npm run test:api    # everything, including the specification for what's next
```

A tag comes off in the session that turns its test green.

**Ports are deliberately uncommon** — `3100` for the API, `5442` for the
database — so the stack never collides with whatever else is running locally.

## Conventions

**Folder = the service that owns the endpoint. Tags = why the test exists.**
A file lives in one folder but carries any number of tags, so the folder is spent
on the axis that changes least. Services are architectural and stable; product
modules get renamed every redesign.

```
tests/payment/admin/deposit-approve.spec.ts     ← who owns this
test('… @negative @security @p0 @payment')      ← why it exists
```

Cross-service chains live in `tests/journeys/` — no single service owns them.

**Assertions are layered.** Status is the client's job and throws on an
unexpected code. Schema checks that the contract still holds. The spec itself
asserts business meaning — that the balance moved by exactly the amount
deposited.

**One process, one module per service.** Not four containers: the suite folds by
service and the URL prefixes preserve that, while the whole system still starts
with a single command. Modules never import each other's internals, so the
boundary is real even though the deployment is not.

**The ledger is the record; the balance is a convenience.** The balance is
maintained by a database trigger on ledger inserts, so any path that writes an
entry moves the balance by exactly that amount — including paths written later
by someone who has not read this file. That is what makes
`GET /wallet/reconciliation` worth asserting: it compares two values that cannot
drift through the intended route, so a mismatch is evidence of an unintended one.

**Money is stored in minor units as an integer.** Floats invite the rounding
class of bug that is hardest to notice and worst to explain.

**Every authorisation rule gets a pair.** Someone who may, and someone who may
not. A test that only proves an endpoint refuses cannot tell "correctly refuses"
from "refuses everyone" — see [`docs/lessons.md`](docs/lessons.md) for the time
that mattered.

**Actors are fixtures.** `admin` is worker-scoped, because admin state is
read-mostly and one login per worker is enough. `player` is test-scoped and
unique, because two tests sharing a wallet couple their balances and fail in
whichever order is unlucky.

## Build order

| | | |
|---|---|---|
| 1 | Workspace, typed client, the first three chains as failing tests | ✅ done |
| 2 | `demo-api` skeleton, docker compose, CI | ✅ done |
| 3 | `user` service — registration and login turn green | ✅ done |
| 4 | `wallet` service — balances, ledger, reconciliation | ✅ done |
| 5 | `payment` service — the deposit approval journey turns green | next |
| 6 | `promotion` service — deposits with a bonus attached | |
| 7 | Browser layer over a minimal UI | |
| 8 | Load thresholds and an authorisation matrix | |
