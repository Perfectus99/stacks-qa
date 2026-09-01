import { test, expect } from '../../fixtures/index.js'

/**
 * The money chain.
 *
 * A player submits a manual deposit; an administrator approves it; the funds
 * land and the movement is recorded. It crosses payment and wallet, so it lives
 * in `journeys/` — neither service owns it.
 *
 * The assertions that matter here are arithmetic. That the calls return 200 is
 * the client's business; that the balance moved by exactly the deposited amount
 * is this test's.
 *
 * Written in named steps, so the report reads as the business chain rather than
 * as a list of HTTP calls. Someone who has never seen the code should be able to
 * follow what was checked, and see which step it stopped at.
 */
test('a manual deposit is credited once an administrator approves it @p0 @payment @wallet @journey', async ({
  player,
  admin,
}) => {
  const balanceBefore = await test.step('Given a player with an empty wallet', async () => {
    return player.client.wallet.balance()
  })

  const deposit = await test.step('When the player submits a manual deposit of 100', async () => {
    const method = await player.client.payment.methods('BANK_TRANSFER')
    return player.client.payment.submitDeposit({
      amount: 100,
      gatewayConfigId: method.gatewayConfigId,
    })
  })

  await test.step('Then it is pending, and no money has moved', async () => {
    expect(deposit.status).toBe('PENDING_APPROVAL')
    expect(deposit.flowType).toBe('BANK_TRANSFER')
    expect(await player.client.wallet.balance()).toBe(balanceBefore)
  })

  // Scoped to this player: the tenant-wide counters move whenever any other
  // test approves something, so an unfiltered before/after only holds when
  // nothing else is running.
  const before = await test.step("And it appears in the administrator's queue", async () => {
    const queue = await admin.payment.listDeposits({ userId: player.userId })
    const detail = await admin.payment.viewDeposit(deposit.depositId)
    expect(detail.status).toBe('PENDING_APPROVAL')
    expect(detail.userId).toBe(player.userId)
    return queue
  })

  await test.step('When the administrator approves it', async () => {
    await admin.payment.approveDeposit(deposit.depositId)
  })

  await test.step('Then the queue shows it completed', async () => {
    const after = await admin.payment.listDeposits({ userId: player.userId })
    expect(after.summary.completedCount).toBe(before.summary.completedCount + 1)
    expect(after.deposits.find((d) => d.depositId === deposit.depositId)?.status).toBe('APPROVED')
  })

  await test.step('And the player has been credited exactly 100', async () => {
    expect(await player.client.wallet.balance()).toBe(balanceBefore + 100)
  })

  await test.step('And the movement is recorded against the deposit', async () => {
    const transactions = await player.client.wallet.transactions()
    expect(transactions).toContainEqual(
      expect.objectContaining({ referenceId: deposit.depositId }),
    )
  })
})

test('the ledger reconciles after a deposit is approved @p0 @wallet @journey', async ({
  player,
  admin,
}) => {
  await test.step('Given an approved deposit of 250', async () => {
    const method = await player.client.payment.methods('BANK_TRANSFER')
    const deposit = await player.client.payment.submitDeposit({
      amount: 250,
      gatewayConfigId: method.gatewayConfigId,
    })
    await admin.payment.approveDeposit(deposit.depositId)
  })

  await test.step('Then the ledger and the balance agree', async () => {
    const reconciliation = await player.client.wallet.reconciliation()
    expect(reconciliation.balanced).toBe(true)
    expect(reconciliation.ledgerTotal).toBe(reconciliation.balance)
  })
})

test('a player cannot approve their own deposit @negative @security @payment', async ({
  player,
}) => {
  const deposit = await test.step('Given the player has a pending deposit', async () => {
    const method = await player.client.payment.methods('BANK_TRANSFER')
    return player.client.payment.submitDeposit({
      amount: 100,
      gatewayConfigId: method.gatewayConfigId,
    })
  })

  await test.step('When the player tries to approve it themselves', async () => {
    // Role, not tenancy. This test used to be named for tenant isolation, which
    // it never asserted — that lives in tests/security/tenant-isolation.spec.ts.
    const status = await player.client.status(
      'PATCH',
      `/payment/admin/deposits/${deposit.depositId}`,
      { body: { status: 'APPROVED' } },
    )
    expect(status).toBe(403)
  })

  await test.step('Then nothing has been credited', async () => {
    expect(await player.client.wallet.balance()).toBe(0)
  })
})
