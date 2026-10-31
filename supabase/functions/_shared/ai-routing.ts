import { eligibleFaqs } from './faq-count.ts';
import { fallbackAllowed, GeminiFailure, generateWithGemini, type GeminiCategory, type GeminiMetric } from './gemini-reliability.ts';

export type AILayer = { provider: 'gemini' | 'deepseek'; model_id: string; enabled: boolean };
export type AIResult = { faqs: ReturnType<typeof eligibleFaqs>; provider: AILayer['provider']; model: string;
  returnedModel?: string; inputTokens?: number; outputTokens?: number; fallbackUsed: boolean; attempts: number };
export type AIEvent = GeminiMetric & { provider: AILayer['provider'] };

function deepSeekCategory(status: number): GeminiCategory {
  if (status === 401 || status === 403) return 'authentication';
  if (status === 402) return 'quota_exhausted';
  if (status === 404) return 'not_found';
  if (status === 408 || status === 504) return 'timeout';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'transient_overload';
  return 'invalid_request';
}
function retryAfterMs(response: Response) {
  const value = response.headers.get('retry-after');
  if (!value) return 0;
  const seconds = Number(value);
  return Math.max(0, Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - Date.now()) || 0;
}
export async function generateWithDeepSeek(options: {
  apiKey: string; model: string; prompt: string; count: number; requestStartedAt: number;
  fetcher?: typeof fetch; now?: () => number; sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  record?: (metric: GeminiMetric) => void;
}) {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const random = options.random ?? Math.random;
  const deadline = options.requestStartedAt + 120_000;
  let last = new GeminiFailure('unknown');
  for (let attempt = 1; attempt <= 2; attempt++) {
    const remaining = deadline - now();
    if (remaining < 1000) throw new GeminiFailure('timeout');
    const started = now();
    let response: Response;
    try {
      response = await fetcher('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: options.model, thinking: { type: 'disabled' }, stream: false,
          response_format: { type: 'json_object' }, max_tokens: 4096,
          messages: [{ role: 'system', content: 'Return a JSON object with a faqs array of question and answer objects. Use only facts in the supplied source; return fewer pairs when needed.' },
            { role: 'user', content: options.prompt.replace('Return ONLY a JSON array of objects with string keys "question" and "answer".',
              'Return a JSON object with a "faqs" array of objects with string keys "question" and "answer".') }] }),
        signal: AbortSignal.timeout(Math.min(18_000, remaining)),
      });
    } catch (error) {
      const category: GeminiCategory = error instanceof Error && /abort|timeout/i.test(error.name) ? 'timeout' : 'network';
      last = new GeminiFailure(category);
      options.record?.({ model: options.model, attempt, latency_ms: now() - started, category, status: 0, fallback: false });
      const delay=750*(1+random()*.3);
      if (attempt === 1 && deadline - now() > delay+1000) { await sleep(delay); continue; }
      break;
    }
    if (!response.ok) {
      const category = deepSeekCategory(response.status);
      last = new GeminiFailure(category, response.status);
      options.record?.({ model: options.model, attempt, latency_ms: now() - started, category, status: response.status, fallback: false });
      const delay = Math.max(750*(1+random()*.3), retryAfterMs(response));
      if (attempt === 1 && fallbackAllowed(category) && deadline - now() > delay + 1000) { await sleep(delay); continue; }
      break;
    }
    const fail = (category: GeminiCategory): never => {
      options.record?.({ model: options.model, attempt, latency_ms: now() - started, category, status: response.status, fallback: false });
      throw new GeminiFailure(category, response.status);
    };
    const data = await response.json().catch(() => fail('invalid_output')) as {
      model?: string; choices?: Array<{ finish_reason?: string; message?: { content?: string; refusal?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number } };
    const choice = data.choices?.[0];
    if (choice?.message?.refusal || choice?.finish_reason === 'content_filter') fail('safety_block');
    if (choice?.finish_reason !== 'stop') fail('invalid_output');
    const faqs = (() => {
      try {
        const parsed = JSON.parse(choice?.message?.content ?? '');
        return eligibleFaqs(parsed?.faqs, options.count);
      } catch { return fail('invalid_output'); }
    })();
    const inputTokens = typeof data.usage?.prompt_tokens === 'number' ? data.usage.prompt_tokens : undefined;
    const outputTokens = typeof data.usage?.completion_tokens === 'number' ? data.usage.completion_tokens : undefined;
    options.record?.({ model: options.model, attempt, latency_ms: now() - started, category: 'success', status: response.status, fallback: false,
      returned_model: data.model, input_tokens: inputTokens, output_tokens: outputTokens });
    return { faqs, model: options.model, returnedModel: data.model, inputTokens, outputTokens, attempts: attempt };
  }
  throw last;
}

export async function generateWithRouting(options: {
  layers: AILayer[]; geminiKey: string; deepSeekKey?: string; geminiPayload: unknown; prompt: string; count: number;
  requestStartedAt: number; fetcher?: typeof fetch; now?: () => number;
  circuitOpen?: (layer: AILayer) => Promise<boolean>; record?: (event: AIEvent) => Promise<void>;
}) : Promise<AIResult> {
  const enabled = options.layers.filter(layer => layer.enabled);
  if (!enabled.length) throw new GeminiFailure('invalid_request');
  let last = new GeminiFailure('unknown');
  let attempts = 0;
  let brokenProvider: string | null = null;
  for (const [index, layer] of enabled.entries()) {
    if (options.requestStartedAt + 120_000 - (options.now?.() ?? Date.now()) < 1000) throw new GeminiFailure('timeout');
    if (brokenProvider === layer.provider) continue;
    if (await options.circuitOpen?.(layer)) { last = new GeminiFailure('transient_overload'); continue; }
    if (layer.provider === 'deepseek' && !options.deepSeekKey) { last = new GeminiFailure('authentication'); continue; }
    const recorded: AIEvent[] = [];
    try {
      const result = layer.provider === 'gemini'
        ? await generateWithGemini({ apiKey: options.geminiKey, models: { primary: layer.model_id },
          payload: options.geminiPayload, count: options.count, requestStartedAt: options.requestStartedAt,
          fetcher: options.fetcher, now: options.now, record: metric => recorded.push({ ...metric, provider: 'gemini', fallback: index > 0 }) })
        : await generateWithDeepSeek({ apiKey: options.deepSeekKey!, model: layer.model_id, prompt: options.prompt,
          count: options.count, requestStartedAt: options.requestStartedAt, fetcher: options.fetcher, now: options.now,
          record: metric => recorded.push({ ...metric, provider: 'deepseek', fallback: index > 0 }) });
      attempts += recorded.length;
      for (const event of recorded) await options.record?.(event);
      return { faqs: result.faqs, provider: layer.provider, model: layer.model_id,
        returnedModel: result.returnedModel, inputTokens: result.inputTokens, outputTokens: result.outputTokens,
        fallbackUsed: index > 0, attempts };
    } catch (error) {
      attempts += recorded.length;
      for (const event of recorded) await options.record?.(event);
      last = error instanceof GeminiFailure ? error : new GeminiFailure('unknown');
      if (last.category === 'authentication' || last.category === 'quota_exhausted') brokenProvider = layer.provider;
      if (!fallbackAllowed(last.category) && last.category !== 'quota_exhausted' && last.category !== 'authentication') break;
    }
  }
  throw last;
}
