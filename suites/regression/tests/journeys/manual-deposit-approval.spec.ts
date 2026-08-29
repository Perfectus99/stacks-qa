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
 */
test('a manual deposit is credited once an administrator approves it @p0 @payment @wallet @journey', async ({
  player,
  admin,
}) => {
  const balanceBefore = await player.client.wallet.balance()

  const method = await player.client.payment.methods('BANK_TRANSFER')
  const deposit = await player.client.payment.submitDeposit({
    amount: 100,
    gatewayConfigId: method.gatewayConfigId,
  })

  expect(deposit.status).toBe('PENDING_APPROVAL')
  expect(deposit.flowType).toBe('BANK_TRANSFER')

  // --- admin half ---------------------------------------------------------
  const before = await admin.payment.listDeposits()

  const detail = await admin.payment.viewDeposit(deposit.depositId)
  expect(detail.status).toBe('PENDING_APPROVAL')
  expect(detail.userId).toBe(player.userId)

  await admin.payment.approveDeposit(deposit.depositId)

  const after = await admin.payment.listDeposits()
  expect(after.summary.completedCount).toBe(before.summary.completedCount + 1)
  expect(after.deposits.find((d) => d.depositId === deposit.depositId)?.status).toBe('APPROVED')

  // --- the player's view --------------------------------------------------
  expect(await player.client.wallet.balance()).toBe(balanceBefore + 100)

  const transactions = await player.client.wallet.transactions()
  expect(transactions).toContainEqual(
    expect.objectContaining({ referenceId: deposit.depositId }),
  )
})

test('the ledger reconciles after a deposit is approved @p0 @wallet @journey', async ({
  player,
  admin,
}) => {
  const method = await player.client.payment.methods('BANK_TRANSFER')
  const deposit = await player.client.payment.submitDeposit({
    amount: 250,
    gatewayConfigId: method.gatewayConfigId,
  })
  await admin.payment.approveDeposit(deposit.depositId)

  const reconciliation = await player.client.wallet.reconciliation()

  expect(reconciliation.balanced).toBe(true)
  expect(reconciliation.ledgerTotal).toBe(reconciliation.balance)
})

test('a deposit belonging to another tenant cannot be approved @negative @security @payment', async ({
  player,
}) => {
  const method = await player.client.payment.methods('BANK_TRANSFER')
  const deposit = await player.client.payment.submitDeposit({
    amount: 100,
    gatewayConfigId: method.gatewayConfigId,
  })

  // A player is not an administrator, whatever tenant they belong to.
  const status = await player.client.status(
    'PATCH',
    `/payment/admin/deposits/${deposit.depositId}`,
    { body: { status: 'APPROVED' } },
  )

  expect(status).toBe(403)
})
