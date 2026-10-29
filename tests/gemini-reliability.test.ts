// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { classifyGeminiError, configuredGeminiModels, generateWithGemini, GeminiFailure, type GeminiMetric } from '../supabase/functions/_shared/gemini-reliability';

const pair = [{ question: 'What does FAQify save?', answer: 'A generated question and answer pair.' }];
const success = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(pair) }] } }] }), { status: 200 });
const failure = (status: number, code: string, details?: unknown[], message = '') =>
  new Response(JSON.stringify({ error: { status: code, message, details } }), { status });
const models = { primary: 'gemini-2.5-flash', fallback: 'gemini-2.5-flash-lite' };
function run(responses: Array<Response | Error>, extra: Record<string, unknown> = {}) {
  const calls: Array<{ url: string; keyInHeader: boolean; keyInUrl: boolean }> = [];
  const metrics: GeminiMetric[] = [];
  const waits: number[] = [];
  const fetcher = vi.fn(async (url: string, options: RequestInit) => {
    calls.push({ url, keyInHeader: (options.headers as Record<string, string>)['x-goog-api-key'] === 'private-test-key', keyInUrl: url.includes('private-test-key') });
    const next = responses.shift();
    if (!next) throw new Error('unexpected call');
    if (next instanceof Error) throw next;
    return next;
  });
  const result = generateWithGemini({ apiKey: 'private-test-key', models, payload: { contents: [] }, count: 1,
    requestStartedAt: Date.now(), fetcher: fetcher as unknown as typeof fetch,
    sleep: async ms => { waits.push(ms); }, random: () => 0, record: metric => metrics.push(metric),
    ...extra });
  return { result, calls, metrics, waits, fetcher };
}
function category(promise: Promise<unknown>, expected: string) {
  return expect(promise).rejects.toMatchObject({ category: expected });
}
describe('approved Gemini model selection', () => {
  it('keeps the deployed pair by default and refuses unreviewed model IDs', () => {
    expect(configuredGeminiModels(() => undefined)).toEqual(models);
    expect(() => configuredGeminiModels(name => name === 'GEMINI_PRIMARY_MODEL' ? 'gemini-latest' : undefined)).toThrow(GeminiFailure);
    expect(() => configuredGeminiModels(name => name === 'GEMINI_FALLBACK_MODEL' ? models.primary : undefined)).toThrow(GeminiFailure);
  });
});
describe('bounded Gemini generation', () => {
  it('uses the primary model once and never puts the key in a URL', async () => {
    const x = run([success()]);
    await expect(x.result).resolves.toMatchObject({ faqs: pair, model: models.primary, fallbackUsed: false });
    expect(x.calls).toHaveLength(1);
    expect(x.calls[0]).toMatchObject({ keyInHeader: true, keyInUrl: false });
    expect(x.metrics[0].category).toBe('success');
  });
  it('retries a transient overload with exponential delay and respects RetryInfo', async () => {
    const x = run([failure(503, 'UNAVAILABLE', [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '2s' }]), success()]);
    await expect(x.result).resolves.toMatchObject({ model: models.primary, fallbackUsed: false });
    expect(x.waits).toEqual([2000]);
    expect(x.metrics.map(m => m.category)).toEqual(['transient_overload', 'success']);
  });
  it('uses the approved fallback after primary transient attempts fail', async () => {
    const x = run([failure(503, 'UNAVAILABLE'), failure(503, 'UNAVAILABLE'), success()]);
    await expect(x.result).resolves.toMatchObject({ model: models.fallback, fallbackUsed: true });
    expect(x.calls.map(c => c.url.split('/').at(-1))).toEqual([
      `${models.primary}:generateContent`, `${models.primary}:generateContent`, `${models.fallback}:generateContent`]);
  });
  it('uses fallback for explicit model_not_found but not a generic 404', async () => {
    const x = run([failure(404, 'model_not_found'), success()]);
    await expect(x.result).resolves.toMatchObject({ fallbackUsed: true });
    const y = run([failure(404, 'not_found')]);
    await category(y.result, 'not_found');
    expect(y.calls).toHaveLength(1);
  });
  it('does not retry exhausted daily quota or authentication failures', async () => {
    const quota = run([failure(429, 'RESOURCE_EXHAUSTED', [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerDay' }] }])]);
    await category(quota.result, 'quota_exhausted');
    expect(quota.calls).toHaveLength(1);
    const auth = run([failure(403, 'PERMISSION_DENIED')]);
    await category(auth.result, 'authentication');
    expect(auth.calls).toHaveLength(1);
  });
  it('distinguishes temporary rate limits and refuses hints beyond the deadline', async () => {
    expect(classifyGeminiError(429, { error: { status: 'RESOURCE_EXHAUSTED' } })).toBe('rate_limited');
    const x = run([failure(429, 'RESOURCE_EXHAUSTED', [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '180s' }]), success()]);
    await expect(x.result).resolves.toMatchObject({ fallbackUsed: true });
    expect(x.waits).toHaveLength(0);
  });
  it('fails safely on timeout, blocked or malformed output without retrying permanent output', async () => {
    const timeout = run([new DOMException('timeout', 'TimeoutError'), new DOMException('timeout', 'TimeoutError'),
      new DOMException('timeout', 'TimeoutError'), new DOMException('timeout', 'TimeoutError')]);
    await category(timeout.result, 'timeout');
    const blocked = run([new Response(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } }), { status: 200 })]);
    await category(blocked.result, 'safety_block');
    expect(blocked.calls).toHaveLength(1);
    const malformed = run([new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] }), { status: 200 })]);
    await category(malformed.result, 'invalid_output');
    expect(malformed.calls).toHaveLength(1);
    const empty = run([new Response('null', { status: 200 })]);
    await category(empty.result, 'invalid_output');
    const invalidJson = run([new Response('{broken', { status: 200 })]);
    await category(invalidJson.result, 'invalid_output');
  });
  it('stops after both models fail and enforces the overall deadline', async () => {
    const x = run([failure(503, 'UNAVAILABLE'), failure(503, 'UNAVAILABLE'), failure(503, 'UNAVAILABLE'), failure(503, 'UNAVAILABLE')]);
    await category(x.result, 'transient_overload');
    expect(x.calls).toHaveLength(4);
    const late = run([], { requestStartedAt: 0, now: () => 121_000 });
    await category(late.result, 'timeout');
    expect(late.calls).toHaveLength(0);
  });
});
