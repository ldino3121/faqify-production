import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, createApi, main, planCatalog, runCatalog } from './setup-paddle.mjs';
function fixture() {
  const products = ['Pro', 'Business'].map((tier, i) => ({ id: `pro_${i}`, name: `FAQify ${tier}`,
    description: `AI FAQ generation, ${i ? 500 : 100} FAQ pairs per billing/access period.`,
    tax_category: 'saas', type: 'standard', status: 'active', custom_data: null }));
  const prices = products.flatMap((p, i) => [true, false].map(recurring => ({ id: `pri_${i}_${recurring}`,
    product_id: p.id, type: 'standard', status: 'active', description: recurring ? 'Monthly' : 'FAQify one-time USD — 30-day access',
    unit_price: { amount: i ? '2900' : '900', currency_code: 'USD' }, tax_mode: 'external',
    billing_cycle: recurring ? { interval: 'month', frequency: 1 } : null,
    trial_period: null, unit_price_overrides: [], quantity: { minimum: 1, maximum: 100 } })));
  return { products, prices };
}
function mockApi(catalog, calls = []) {
  return async (path, body) => {
    calls.push({ path, body });
    assert.equal(body, undefined, 'No mutation is allowed in inspection/conflict tests');
    const resource = path.startsWith('/products') ? 'products' : 'prices';
    return { data: catalog[resource], meta: { pagination: { has_more: false } } };
  };
}
test('reuses all four existing prices without custom metadata or writes', async () => {
  const calls = []; const result = await runCatalog(mockApi(fixture(), calls), { apply: true });
  assert.equal(Object.keys(result.ids).length, 4); assert.deepEqual(result.missing, []);
  assert.equal(calls.length, 2);
});
test('inspection reports missing entries without provisioning', async () => {
  const result = await runCatalog(mockApi({ products: [], prices: [] }));
  assert.equal(result.missing.length, 6); assert.deepEqual(result.ids, {});
});
for (const [label, modify] of [
  ['duplicate products', c => c.products.push({ ...c.products[0], id: 'duplicate' })],
  ['archived product', c => c.products[0].status = 'archived'],
  ['case-only conflicting name', c => c.products[0].name = 'faqify pro'],
  ['wrong allowance', c => c.products[0].description = 'Wrong allowance'],
  ['conflicting tax category', c => c.products[0].tax_category = 'standard'],
  ['conflicting metadata', c => c.products[0].custom_data = { app: 'other' }],
  ['duplicate prices', c => c.prices.push({ ...c.prices[0], id: 'duplicate' })],
  ['missing billing cycle', c => delete c.prices[0].billing_cycle],
  ['missing currency', c => delete c.prices[0].unit_price.currency_code],
  ['wrong amount', c => c.prices[0].unit_price.amount = '100'],
  ['tax included', c => c.prices[0].tax_mode = 'internal'],
  ['trial', c => c.prices[0].trial_period = { interval: 'day', frequency: 7 }],
  ['wrong cycle', c => c.prices[0].billing_cycle.frequency = 2],
  ['archived price', c => c.prices[0].status = 'archived'],
  ['regional overrides', c => c.prices[0].unit_price_overrides = [{}]],
  ['minimum quantity', c => c.prices[0].quantity.minimum = 2],
  ['one-time access description', c => c.prices[1].description = 'Lifetime'],
]) test(`rejects ${label}`, () => { const c = fixture(); modify(c); assert.throws(() => planCatalog(c.products, c.prices)); });
test('preflights Business conflicts before creating missing Pro entries', async () => {
  const c = fixture(); c.products.shift(); c.products[0].status = 'archived';
  const calls = []; await assert.rejects(runCatalog(mockApi(c, calls), { apply: true }));
  assert.ok(calls.every(call => call.body === undefined));
});
test('refuses live environment before making any request', async () => {
  await assert.rejects(main({ PADDLE_ENVIRONMENT: 'live' }), /refuses live/);
  assert.throws(() => createApi('pdl_live_placeholder'), /sandbox API key/);
});
test('refuses credential-forwarding redirects and foreign paths', async () => {
  let called = false;
  const api = createApi('pdl_sdbx_test_only', async () => { called = true; });
  await assert.rejects(api('https://example.com/products')); assert.equal(called, false);
});
test('uses only sandbox catalog URLs and rejects HTTP failures without body disclosure', async () => {
  const api = createApi('pdl_sdbx_test_only', async (url, options) => {
    assert.ok(url.startsWith(BASE)); assert.equal(options.redirect, 'error');
    return { ok: false, status: 403, json: async () => ({ error: 'private provider diagnostic' }) };
  });
  await assert.rejects(api('/products'), /^Error: Paddle catalog request failed \(HTTP 403\)$/);
});
test('rejects external pagination before calling the foreign host', async () => {
  let calls = 0;
  await assert.rejects(runCatalog(async () => {
    calls++; return { data: [], meta: { pagination: { has_more: true, next: 'https://example.com/products' } } };
  }), /pagination/);
  assert.equal(calls, 1);
});
test('creates only missing catalog entries after complete preflight, then verifies them', async () => {
  const c = fixture(); c.prices.splice(1, 1); let created; const calls = [];
  const api = async (path, body) => {
    calls.push({ path, body });
    if (body) { assert.equal(path, '/prices'); created = { ...body, id: 'pri_created', status: 'active', type: 'standard' }; return { data: created }; }
    if (path === '/prices/pri_created') return { data: created };
    return mockApi(c)(path);
  };
  const result = await runCatalog(api, { apply: true });
  assert.equal(result.ids.PADDLE_PRO_ONETIME_PRICE_ID, 'pri_created');
  assert.deepEqual(calls.slice(0, 2).map(c => !!c.body), [false, false]);
  assert.equal(calls.filter(c => c.body).length, 1);
});

test('invalid provider JSON never exposes its response text', async () => {
  const api = createApi('pdl_sdbx_test_only', async () => ({
    ok: false, status: 502, json: async () => { throw new SyntaxError('private provider body'); },
  }));
  await assert.rejects(api('/products'), /^Error: Invalid Paddle catalog response$/);
});
