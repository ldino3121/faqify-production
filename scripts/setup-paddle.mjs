/** Sandbox catalog setup. Defaults to inspection; writes require --apply. */
import { pathToFileURL } from 'node:url';
export const BASE = 'https://sandbox-api.paddle.com';
const specs = [['Pro', '900', 100], ['Business', '2900', 500]];
const normalized = value => String(value ?? '').trim().toLowerCase();
function requireValid(condition, message) { if (!condition) throw new Error(message); }
function productBody(tier, limit) {
  return { name: `FAQify ${tier}`, description: `AI FAQ generation, ${limit} FAQ pairs per billing/access period.`, tax_category: 'saas' };
}
function priceBody(tier, amount, recurring, productId) {
  return { product_id: productId, name: recurring ? 'Monthly' : '30-day access',
    description: recurring ? `FAQify ${tier} monthly USD` : `FAQify ${tier} one-time USD — 30-day access`,
    unit_price: { amount, currency_code: 'USD' }, tax_mode: 'external',
    billing_cycle: recurring ? { interval: 'month', frequency: 1 } : null,
    trial_period: null, quantity: { minimum: 1, maximum: 1 } };
}
function validateProduct(product, tier, limit) {
  const expected = productBody(tier, limit);
  requireValid(product.status === 'active' && product.type === 'standard' &&
    Object.entries(expected).every(([key, value]) => product[key] === value), `Conflicting FAQify ${tier} product configuration`);
  const metadata = product.custom_data;
  requireValid(!metadata || ((!metadata.app || metadata.app === 'faqify') &&
    (!metadata.faqify_tier || metadata.faqify_tier === tier)), `Conflicting FAQify ${tier} metadata`);
}
function validatePrice(price, tier, amount, recurring, productId) {
  const expected = priceBody(tier, amount, recurring, productId);
  requireValid(price.status === 'active' && price.type === 'standard' && price.product_id === productId &&
    price.unit_price?.amount === amount && price.unit_price?.currency_code === 'USD' &&
    price.tax_mode === 'external' && price.trial_period === null &&
    (!price.unit_price_overrides || price.unit_price_overrides.length === 0) &&
    (recurring ? price.billing_cycle?.interval === 'month' && price.billing_cycle.frequency === 1 : price.billing_cycle === null) &&
    price.quantity?.minimum === 1 && Number.isInteger(price.quantity?.maximum) && price.quantity.maximum >= 1 &&
    (recurring || /30[\s-]*day\s+access/i.test(price.description ?? '')),
    `Conflicting FAQify ${tier} ${recurring ? 'monthly' : 'one-time'} price configuration`);
  return expected;
}
/** Pure preflight across BOTH tiers before any creation. Archived/name/metadata conflicts fail closed. */
export function planCatalog(products, prices) {
  return specs.map(([tier, amount, limit]) => {
    const matches = products.filter(p => normalized(p.name) === normalized(`FAQify ${tier}`) ||
      (p.custom_data?.app === 'faqify' && p.custom_data?.faqify_tier === tier));
    requireValid(matches.length <= 1, `Ambiguous FAQify ${tier} products`);
    const product = matches[0];
    if (product) {
      validateProduct(product, tier, limit);
      requireValid(prices.filter(p => p.product_id === product.id).every(p =>
        typeof p.unit_price?.currency_code === 'string' && Object.hasOwn(p, 'billing_cycle')),
        `Incomplete FAQify ${tier} price configuration`);
    }
    const slots = [true, false].map(recurring => {
      // Any USD price in this billing slot is a potential conflict, even at the wrong amount.
      const matches = product ? prices.filter(p => p.product_id === product.id && p.unit_price?.currency_code === 'USD' &&
        (recurring ? p.billing_cycle?.interval === 'month' : p.billing_cycle === null)) : [];
      requireValid(matches.length <= 1, `Ambiguous FAQify ${tier} ${recurring ? 'monthly' : 'one-time'} prices`);
      const price = matches[0];
      if (price) validatePrice(price, tier, amount, recurring, product.id);
      return { recurring, price };
    });
    return { tier, amount, limit, product, slots };
  });
}
export function createApi(key, fetchImpl = fetch) {
  requireValid(key?.startsWith('pdl_sdbx_'), 'A sandbox API key is required; live credentials are refused.');
  return async (path, body) => {
    const url = new URL(path, BASE);
    requireValid(url.origin === BASE && /^\/(products|prices)(\/[^/]*)?$/.test(url.pathname), 'Unexpected catalog URL');
    const response = await fetchImpl(url.href, { method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Paddle-Version': '1' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000), redirect: 'error' });
    let result;
    try { result = await response.json(); } catch { throw new Error('Invalid Paddle catalog response'); }
    requireValid(response.ok, `Paddle catalog request failed (HTTP ${response.status})`);
    return result;
  };
}
async function list(api, resource) {
  const items = []; let next = `/${resource}?per_page=200&status=active,archived`;
  const seen = new Set();
  while (next) {
    const url = new URL(next, BASE);
    requireValid(url.origin === BASE && url.pathname === `/${resource}` && !seen.has(url.href), 'Unexpected catalog pagination');
    requireValid(seen.size < 100, 'Catalog too large; configure IDs manually.'); seen.add(url.href);
    const result = await api(url.pathname + url.search);
    requireValid(Array.isArray(result.data), 'Invalid catalog response'); items.push(...result.data);
    const pagination = result.meta?.pagination;
    requireValid(pagination && typeof pagination.has_more === 'boolean', 'Missing catalog pagination');
    requireValid(!pagination.has_more || pagination.next, 'Incomplete catalog pagination');
    next = pagination.has_more ? pagination.next : null;
  }
  return items;
}
export async function runCatalog(api, { apply = false } = {}) {
  const products = await list(api, 'products'); const prices = await list(api, 'prices');
  const plan = planCatalog(products, prices); const ids = {}; const missing = [];
  for (const entry of plan) {
    let { product } = entry;
    if (!product && apply) {
      const created = (await api('/products', productBody(entry.tier, entry.limit))).data;
      product = (await api(`/products/${created.id}`)).data;
      validateProduct(product, entry.tier, entry.limit);
    }
    if (!product) missing.push(`FAQify ${entry.tier} product`);
    for (const { recurring, price: existing } of entry.slots) {
      let price = existing;
      if (!price && apply) {
        const created = (await api('/prices', priceBody(entry.tier, entry.amount, recurring, product.id))).data;
        price = (await api(`/prices/${created.id}`)).data;
      }
      const label = `PADDLE_${entry.tier.toUpperCase()}_${recurring ? 'MONTHLY' : 'ONETIME'}_PRICE_ID`;
      if (price) { validatePrice(price, entry.tier, entry.amount, recurring, product.id); ids[label] = price.id; }
      else missing.push(label);
    }
  }
  return { ids, missing };
}
export async function main(env = process.env, args = process.argv.slice(2)) {
  requireValid(env.PADDLE_ENVIRONMENT === 'sandbox', 'Set PADDLE_ENVIRONMENT=sandbox. This script refuses live.');
  requireValid(args.every(arg => arg === '--apply') && args.length <= 1, 'Usage: node scripts/setup-paddle.mjs [--apply]');
  const api = createApi(env.PADDLE_SANDBOX_API_KEY || env.PADDLE_API_KEY);
  const result = await runCatalog(api, { apply: args.includes('--apply') });
  for (const [name, id] of Object.entries(result.ids)) console.log(`${name}=${id}`);
  if (result.missing.length) console.log(`Missing catalog entries: ${result.missing.join(', ')}. Inspection makes no changes; --apply creates missing entries.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
