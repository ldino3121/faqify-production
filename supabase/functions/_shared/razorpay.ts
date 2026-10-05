// Cancels a superseded Razorpay subscription when a customer switches plans.
//
// Plan switches create a NEW Razorpay subscription while the old one would
// otherwise keep renewing on its own schedule — silent double-billing. Callers
// invoke this AFTER they have already repointed user_subscriptions at the new
// subscription id, so any `subscription.cancelled` event for the old id can no
// longer match a row. Failures are logged, never thrown: activation must not be
// blocked because a best-effort cancel failed.
export async function cancelSupersededSubscription(
  oldSubscriptionId: string | null | undefined,
  newSubscriptionId: string,
): Promise<void> {
  if (!oldSubscriptionId || oldSubscriptionId === newSubscriptionId) return;

  const keyId = Deno.env.get("RAZORPAY_KEY_ID");
  const keySecret = Deno.env.get("RAZORPAY_SECRET_KEY") ?? Deno.env.get("RAZORPAY_KEY_SECRET");
  if (!keyId || !keySecret) {
    console.error("cancelSuperseded: missing Razorpay credentials, cannot cancel", oldSubscriptionId);
    return;
  }

  try {
    const res = await fetch(`https://api.razorpay.com/v1/subscriptions/${oldSubscriptionId}/cancel`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${keyId}:${keySecret}`),
        "Content-Type": "application/json",
      },
      // cancel_at_cycle_end: keep time the customer already paid for, but stop
      // every future renewal so only the new subscription bills going forward.
      body: JSON.stringify({ cancel_at_cycle_end: 1 }),
    });
    console.log(`cancelSuperseded ${oldSubscriptionId} -> HTTP ${res.status}: ${await res.text()}`);
  } catch (e) {
    console.error("cancelSuperseded failed:", e);
  }
}
