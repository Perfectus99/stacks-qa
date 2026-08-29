# stacks-qa

API test automation for a multi-tenant payments platform — wallet, payments,
promotions and users — with the system under test included, so the whole thing
runs from a clean clone.

> **Status: specification.** The suite is written and failing. The system under
> test is next. See [Build order](#build-order).

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
packages/core/          the typed client — one definition of how to call the platform
packages/test-data/     factories; uniqueness and cleanup live here, never in a spec
suites/regression/      the API suite: folder = owning service, tags = why it exists
```

Folders appear when their first test lands. An empty skeleton is a promise the
repository has not kept.

## Running it

```bash
npm install
cp .env.example .env
npm run test:api
```

Every test currently fails with a connection error. That is correct: there is
nothing listening yet.

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

**Actors are fixtures.** `admin` is worker-scoped, because admin state is
read-mostly and one login per worker is enough. `player` is test-scoped and
unique, because two tests sharing a wallet couple their balances and fail in
whichever order is unlucky.

## Build order

| | | |
|---|---|---|
| 1 | Workspace, typed client, the first three chains as failing tests | ✅ done |
| 2 | `demo-api` skeleton, docker compose, CI | next |
| 3 | `user` service — registration and login turn green | |
| 4 | `wallet` service — balances, ledger, reconciliation | |
| 5 | `payment` service — the deposit approval journey turns green | |
| 6 | `promotion` service — deposits with a bonus attached | |
| 7 | Browser layer over a minimal UI | |
| 8 | Load thresholds and an authorisation matrix | |
