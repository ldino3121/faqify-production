/** Pure billing rules, shared by Edge Functions and local regression tests. */
export type PaidTier = 'Pro' | 'Business';
export type PaymentKind = 'recurring' | 'one_time' | 'credit_pack';
export interface PricePlan { priceId: string; tier: PaidTier; kind: PaymentKind; limit: number }
export function configuredPrices(env: (name: string) => string | undefined): PricePlan[] {
  const plans: PricePlan[] = [];
  for (const [tier, limit] of [['Pro', 100], ['Business', 500]] as const) {
    for (const kind of ['recurring', 'one_time'] as const) {
      const priceId = env(`PADDLE_${tier.toUpperCase()}_${kind === 'recurring' ? 'MONTHLY' : 'ONETIME'}_PRICE_ID`)?.trim();
      if (priceId) {
        if (!/^pri_[a-z0-9]{26}$/.test(priceId)) throw new Error('Invalid Paddle price configuration');
        plans.push({ priceId, tier, kind, limit });
      }
    }
  }
  if (new Set(plans.map(p => p.priceId)).size !== plans.length) throw new Error('Paddle prices must be distinct');
  return plans;
}
export function configuredCreditPackPrices(env: (name: string) => string | undefined): PricePlan[] {
  const legacy = configuredPrices(env);
  const plans = ([['Pro', 100], ['Business', 500]] as const).map(([tier, limit]) => {
    const priceId = env(`PADDLE_${tier.toUpperCase()}_CREDIT_PACK_PRICE_ID`)?.trim();
    if (!priceId || !/^pri_[a-z0-9]{26}$/.test(priceId)) throw new Error('Credit pack price is missing or invalid');
    return { priceId, tier, kind: 'credit_pack' as const, limit };
  });
  if (new Set([...legacy, ...plans].map(p => p.priceId)).size !== legacy.length + plans.length)
    throw new Error('Credit pack and legacy prices must be distinct');
  return plans;
}
export function resolvePrice(items: Array<{ price?: { id?: string }; price_id?: string; quantity?: number }>, plans: PricePlan[]): PricePlan {
  if (!Array.isArray(items) || items.length !== 1 || items[0].quantity !== 1) throw new Error('Expected exactly one FAQify plan');
  const plan = plans.find(p => p.priceId === (items[0].price?.id ?? items[0].price_id));
  if (!plan) throw new Error('Unrecognized Paddle price');
  return plan;
}
export async function verifyPaddleSignature(raw: string, header: string, secret: string, now = Date.now()): Promise<boolean> {
  const parts = header.split(';').map(s => s.trim().split('='));
  const timestamp = parts.find(([key]) => key === 'ts')?.[1];
  if (!timestamp || !/^\d+$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  const signatures = parts.filter(([key]) => key === 'h1').map(([, value]) => value);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  for (const signature of signatures) {
    if (!/^[a-f0-9]{64}$/i.test(signature ?? '')) continue;
    const bytes = Uint8Array.from(signature.match(/../g)!, x => parseInt(x, 16));
    if (await crypto.subtle.verify('HMAC', key, bytes, encoder.encode(`${timestamp}:${raw}`))) return true;
  }
  return false;
}
