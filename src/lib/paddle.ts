import { requireRolloutOpen } from '@/lib/rollout';
import { initializePaddle, type Paddle } from '@paddle/paddle-js';
import { supabase } from '@/integrations/supabase/client';

export const BILLING_PROVIDER = import.meta.env.VITE_BILLING_PROVIDER === 'razorpay' ? 'razorpay' : 'paddle';
export const PADDLE_READY = !!import.meta.env.VITE_PADDLE_CLIENT_TOKEN?.trim();
let sdk: Promise<Paddle | undefined> | undefined;
export async function paddle() {
  await requireRolloutOpen();
  if (import.meta.env.VITE_PADDLE_ENVIRONMENT !== 'sandbox') throw new Error('Paddle sandbox is not configured.');
  if (!PADDLE_READY) throw new Error('Payments are being set up. Please contact support.');
  sdk ??= initializePaddle({
    token: import.meta.env.VITE_PADDLE_CLIENT_TOKEN,
    environment: 'sandbox',
    checkout: { settings: { displayMode: 'overlay', successUrl: `${window.location.origin}/dashboard?billing=processing` } },
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
  const { data, error } = await supabase.functions.invoke('create-paddle-checkout', { body: { pack } });
  if (error) {
    // FunctionsHttpError exposes the response; surface actionable server messages.
    const detail = await error.context?.json?.().catch(() => null);
    throw new Error(detail?.error || 'Unable to open checkout. Please retry or contact support.');
  }
  if (!data?.transactionId) throw new Error(data?.error || 'Checkout could not be created.');
  await requireRolloutOpen();
  instance.Checkout.open({ transactionId: data.transactionId, customer: { email }, settings: { successUrl: `${window.location.origin}/dashboard?billing=processing&transaction_id=${encodeURIComponent(data.transactionId)}` } });
}
export async function openPaddlePortal() {
  const { data, error } = await supabase.functions.invoke('paddle-customer-portal', { body: {} });
  if (error || !data?.url) throw new Error(data?.error || 'Unable to open billing. Please retry.');
  // Never persist or cache this short-lived authenticated link.
  window.location.assign(data.url);
}

export async function closePendingPaddleCheckout() {
  const { data, error } = await supabase.functions.invoke('create-paddle-checkout', { body: { action: 'cancel_pending' } });
  if (error) {
    const detail = await error.context?.json?.().catch(() => null);
    throw new Error(detail?.error || 'Unable to close pending checkout. Please retry.');
  }
  if (!data?.success) throw new Error('Unable to close pending checkout.');
}
