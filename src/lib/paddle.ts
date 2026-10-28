import { requireRolloutOpen } from '@/lib/rollout';
import { initializePaddle, type Paddle } from '@paddle/paddle-js';
import { supabase } from '@/integrations/supabase/client';

export const BILLING_PROVIDER = import.meta.env.VITE_BILLING_PROVIDER === 'razorpay' ? 'razorpay' : 'paddle';
export const PADDLE_READY = !!import.meta.env.VITE_PADDLE_CLIENT_TOKEN?.trim();
export type PendingCheckout = { pack: 'Pro' | 'Business'; status: string; transactionId?: string; canResume?: boolean; canCancel?: boolean };
async function checkoutRequest(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('create-paddle-checkout', { body });
  if (error) {
    const detail = await error.context?.json?.().catch(() => null);
    throw new Error(detail?.error || 'Unable to verify checkout. Please retry.');
  }
  return data;
}
export async function pendingPaddleCheckout(): Promise<PendingCheckout | null> {
  return (await checkoutRequest({ action: 'pending' })).pending ?? null;
}
let sdk: Promise<Paddle | undefined> | undefined;
export async function paddle() {
  await requireRolloutOpen();
  if (import.meta.env.VITE_PADDLE_ENVIRONMENT !== 'sandbox') throw new Error('Paddle sandbox is not configured.');
  if (!PADDLE_READY) throw new Error('Payments are being set up. Please contact support.');
  sdk ??= initializePaddle({
    token: import.meta.env.VITE_PADDLE_CLIENT_TOKEN,
    environment: 'sandbox',
    checkout: { settings: { displayMode: 'overlay', theme: 'dark', successUrl: `${window.location.origin}/dashboard?billing=processing` } },
    eventCallback: event => {
      if (event.name === 'checkout.completed') window.dispatchEvent(new Event('faqify-billing-updated'));
    },
  }).catch(error => { sdk = undefined; throw error; });
  const instance = await sdk;
  if (!instance) { sdk = undefined; throw new Error('Unable to load checkout. Please refresh and retry.'); }
  return instance;
}
export async function openPaddleCheckout(pack: 'Pro' | 'Business', email: string) {
  const instance = await paddle();
  const data = await checkoutRequest({ pack });
  if (!data?.transactionId) throw new Error(data?.error || 'Checkout could not be created.');
  await showPaddleCheckout(instance, data.transactionId, email);
}
async function showPaddleCheckout(instance: Paddle, transactionId: string, email: string) {
  await requireRolloutOpen();
  instance.Checkout.open({ transactionId, customer: { email }, settings: { theme: 'dark', successUrl: `${window.location.origin}/dashboard?billing=processing&transaction_id=${encodeURIComponent(transactionId)}` } });
}
export async function resumePaddleCheckout(transactionId: string, email: string) {
  const instance = await paddle();
  const data = await checkoutRequest({ action: 'resume', transactionId });
  if (!data?.transactionId) throw new Error(data?.error || 'Checkout is no longer resumable.');
  await showPaddleCheckout(instance, data.transactionId, email);
}
export async function openPaddlePortal(action: 'portal' | 'subscription' = 'portal') {
  const { data, error } = await supabase.functions.invoke('paddle-customer-portal', { body: { action } });
  if (error || !data?.url) throw new Error(data?.error || 'Unable to open billing. Please retry.');
  // Never persist or cache this short-lived authenticated link.
  window.location.assign(data.url);
}

export async function closePendingPaddleCheckout(transactionId: string) {
  const data = await checkoutRequest({ action: 'cancel_pending', transactionId });
  if (data?.result !== 'canceled') throw new Error('Payment status changed. Refresh checkout status before trying again.');
  window.dispatchEvent(new Event('faqify-billing-updated'));
}
