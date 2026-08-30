# 001 — One deposit credited twice when two administrators approve at once

| | |
|---|---|
| **Severity** | High — invents money, and leaves no trace that says so |
| **Component** | `payment` · deposit decision |
| **Found by** | `tests/payment/admin/deposit-approve.spec.ts` — "two administrators approving at once credit once" |
| **Status** | Fixed |

## What happens

Two administrators open the pending queue and approve the same deposit at the
same moment. Both requests succeed. The account is credited twice for a single
deposit of one amount.

## Why

The decision read the deposit's status, checked it was `PENDING_APPROVAL`, then
wrote the new status and credited the wallet:

```
select status from deposits where deposit_id = $1     -- no lock
if status != 'PENDING_APPROVAL' -> refuse
update deposits set status = 'APPROVED' ...
insert into ledger_entries ...                        -- credits
```

Under `READ COMMITTED`, both transactions read `PENDING_APPROVAL` before either
writes. Neither sees the other's uncommitted update, so both pass the check and
both insert a ledger entry.

**The part that makes it nasty:** the ledger and the balance still agree.
`GET /wallet/reconciliation` returns `balanced: true`, because the trigger
faithfully applied both entries. The invariant that exists to catch invented
money cannot catch this one — the money was invented *through* the intended
route. Only the deposit-to-entry relationship is wrong, and nothing was
asserting that.

## Reproducing

Two requests through the *same* client will not do it. Playwright serialises
requests issued through one `APIRequestContext`, so the second only starts after
the first has committed and it is correctly refused. Two independent clients are
required:

```ts
const [first, second] = await Promise.all([ApiClient.asAdmin(), ApiClient.asAdmin()])
const outcomes = await Promise.allSettled([
  first.payment.approveDeposit(depositId),
  second.payment.approveDeposit(depositId),
])
expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1)
```

Against the unlocked build both settle `fulfilled` and the balance is `200` for
a deposit of `100`.

## Fix

Take a row lock before reading the status, so the second decision waits for the
first to commit and then sees a deposit that is no longer pending:

```sql
select ... from deposits
where deposit_id = $1 and tenant_id = $2
for update
```

The credit already shared the decision's transaction, so no change was needed
there.

## What it cost, and what it taught

The first version of the test passed against the *broken* build. It fired both
approvals from the shared `admin` fixture, and one context serialised them —
a concurrency test with no concurrency in it. It was only caught by deliberately
removing the lock and checking that the test went red.

**The rule that came out of it:** a test written to catch a specific defect is
not finished until it has been seen to fail in that defect's presence. See
[`../lessons.md`](../lessons.md).
