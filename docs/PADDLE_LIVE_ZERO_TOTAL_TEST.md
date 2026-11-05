# Controlled live zero-total Pro checkout

The temporary live Pro discount is a controlled fulfillment test, not a paid sale. Public live checkout remains closed. The existing live cohort contains only the approved account. Do not disclose the discount code publicly or use a checkout showing a nonzero total.

## Change and deployment

Apply forward migration `20261106000000_paddle_live_discount_accounting.sql` during a short frozen window. It retains the catalog price and separately records Paddle's signed `grand_total` and discount ID. Admin reporting uses the verified total due for new live grants, so a 100%-off grant contributes zero to collected totals. Old sandbox grant amounts remain catalog-price estimates. Deploy `create-paddle-checkout` and `paddle-live-webhook` together; the latter includes the shared webhook handler. Keep its existing signature verification and the live cohort gate.

Set temporary server-side secrets `PADDLE_LIVE_TEST_ACCOUNT_ID` and `PADDLE_LIVE_TEST_DISCOUNT_ID` to the approved account UUID and verified one-use live discount ID. Only a live Pro transaction for that authenticated account receives the discount; the client cannot provide a discount ID. The discount must be 100%, restricted to the live Pro price, non-recurring, one redemption, and short lived. Keep customer code entry disabled in Paddle; the server applies the discount to the account-owned transaction. Verify the transaction's `discount_id` and checkout total before the customer completes it.

After a verified `transaction.completed` webhook, confirm one live grant of 100 credits, one ledger entry, a 100-credit wallet increase, a zero collected total, no duplicate on retry, and an archived discount. Remove the two temporary server secrets after the test. Do not delete transaction, event, grant, or audit evidence. If Paddle refuses checkout because onboarding or payout setup is incomplete, record the provider error and stop; do not bypass it.

## Recovery

If the migration or function deployment fails, keep the public gate closed and recover forward with the prior compatible live functions or a corrected migration. Keep the live webhook able to process already completed transactions. Do not restore a pre-purchase database snapshot after any completion. If the discount is attached but the checkout has not completed, archive the discount to prevent further use and reconcile the transaction's actual status before releasing its intent. Existing sandbox grants and subscriptions remain untouched.
