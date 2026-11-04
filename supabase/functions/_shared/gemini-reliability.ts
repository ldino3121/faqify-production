import { parseGeneratedFaqs } from './faq-count.ts';

export type GeminiCategory = 'transient_overload' | 'rate_limited' | 'quota_exhausted' |
  'model_unavailable' | 'not_found' | 'authentication' | 'safety_block' | 'invalid_output' |
  'timeout' | 'network' | 'invalid_request' | 'unknown';
export class GeminiFailure extends Error {
  constructor(public category: GeminiCategory, public status = 0) { super(category); }
}
export const APPROVED_GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'] as const;
export function configuredGeminiModels(get: (name: string) => string | undefined) {
  const primary = get('GEMINI_PRIMARY_MODEL')?.trim() || 'gemini-2.5-flash';
  const fallback = get('GEMINI_FALLBACK_MODEL')?.trim() || 'gemini-2.5-flash-lite';
  if (!APPROVED_GEMINI_MODELS.includes(primary as typeof APPROVED_GEMINI_MODELS[number]) ||
      !APPROVED_GEMINI_MODELS.includes(fallback as typeof APPROVED_GEMINI_MODELS[number]) || primary === fallback)
    throw new GeminiFailure('invalid_request');
  return { primary, fallback };
}

type GoogleError = { error?: { status?: string; message?: string; details?: Array<Record<string, unknown>> } };
type GeminiSuccess = { promptFeedback?: { blockReason?: string }; candidates?: Array<{
  finishReason?: string; content?: { parts?: Array<{ text?: unknown }> };
}>; modelVersion?: string; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } };
function retryHintMs(response: Response, body: GoogleError | null, now: () => number) {
  const header = response.headers.get('retry-after');
  let hint = header ? Number(header) * 1000 : NaN;
  if (header && !Number.isFinite(hint)) hint = Date.parse(header) - now();
  for (const detail of Array.isArray(body?.error?.details) ? body.error.details : []) {
    if (typeof detail.retryDelay === 'string' && /RetryInfo/i.test(String(detail['@type'] ?? ''))) {
      const seconds = /^([0-9]+(?:\.[0-9]+)?)s$/.exec(detail.retryDelay);
      if (seconds) hint = Math.max(Number.isFinite(hint) ? hint : 0, Number(seconds[1]) * 1000);
    }
  }
  return Number.isFinite(hint) && hint > 0 ? hint : 0;
}
export function classifyGeminiError(status: number, body: GoogleError | null): GeminiCategory {
  const code = String(body?.error?.status ?? '').toLowerCase();
  const message = String(body?.error?.message ?? '');
  const dailyQuota = (Array.isArray(body?.error?.details) ? body.error.details : []).some(detail =>
    /QuotaFailure/i.test(String(detail['@type'] ?? '')) &&
    Array.isArray(detail.violations) && detail.violations.some((violation: unknown) => {
      const fields = violation && typeof violation === 'object' ? violation as Record<string, unknown> : {};
      return /per.?day|daily/i.test(String(fields.quotaId ?? '') + ' ' + String(fields.quotaMetric ?? '') + ' ' + String(fields.description ?? ''));
    }));
  if (status === 401 || status === 403 || code === 'authentication' || code === 'permission_denied') return 'authentication';
  if (status === 402 || code === 'payment_required' || code === 'quota_exceeded' || dailyQuota ||
      (status === 429 && /per.?day|daily|quota.*exhausted/i.test(message))) return 'quota_exhausted';
  if (status === 429) return 'rate_limited';
  if (status === 404 && (code === 'model_not_found' || /models\/[\w.-]+ is not found/i.test(message))) return 'model_unavailable';
  if (status === 404) return 'not_found';
  if (status === 408 || status === 504 || code === 'deadline_exceeded') return 'timeout';
  if (status === 500 || status === 502 || status === 503 || status >= 500) return 'transient_overload';
  if (code.includes('safety') || code.includes('blocked')) return 'safety_block';
  if (status >= 400 && status < 500) return 'invalid_request';
  return 'unknown';
}
const retryable = (category: GeminiCategory) => ['rate_limited', 'transient_overload', 'timeout', 'network'].includes(category);
export const fallbackAllowed = (category: GeminiCategory) => retryable(category) || category === 'model_unavailable';
const blockedReasons = new Set(['SAFETY', 'RECITATION', 'PROHIBITED_CONTENT', 'SPII', 'BLOCKLIST']);
export type GeminiMetric = { model: string; attempt: number; latency_ms: number; category: GeminiCategory | 'success'; status: number; fallback: boolean;
  returned_model?: string; input_tokens?: number; output_tokens?: number };
export async function generateWithGemini(options: {
  apiKey: string; models: { primary: string; fallback?: string }; payload: unknown; count: number;
  requestStartedAt: number; fetcher?: typeof fetch; now?: () => number; random?: () => number;
  sleep?: (ms: number) => Promise<void>; record?: (metric: GeminiMetric) => void;
}) {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now;
  const random = options.random ?? Math.random;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
  // Supabase's request idle limit is 150s. URL extraction can precede Gemini;
  // reserve time for persistence and reservation cleanup.
  const deadline = Math.min(now() + 75_000, options.requestStartedAt + 120_000);
  let lastFailure = new GeminiFailure('unknown');
  for (const [index, model] of [options.models.primary, options.models.fallback].filter((value): value is string => !!value).entries()) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const remaining = deadline - now();
      if (remaining < 1_000) throw new GeminiFailure('timeout');
      const start = now();
      let response: Response;
      try {
        response = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': options.apiKey },
          body: JSON.stringify(options.payload),
          signal: AbortSignal.timeout(Math.min(18_000, remaining)),
        });
      } catch (error) {
        const category: GeminiCategory = error instanceof Error && /abort|timeout/i.test(error.name) ? 'timeout' : 'network';
        lastFailure = new GeminiFailure(category);
        options.record?.({ model, attempt, latency_ms: now() - start, category, status: 0, fallback: index > 0 });
        if (attempt < 2 && deadline - now() > 2_000) {
          await sleep(Math.min(750 * 2 ** (attempt - 1) * (1 + random() * .3), Math.max(0, deadline - now() - 1_000)));
          continue;
        }
        break;
      }
      if (response.ok) {
        let data: GeminiSuccess;
        try { data = await response.json(); }
        catch {
          options.record?.({ model, attempt, latency_ms: now() - start, category: 'invalid_output', status: response.status, fallback: index > 0 });
          throw new GeminiFailure('invalid_output', response.status);
        }
        const finishReason = String(data?.candidates?.[0]?.finishReason ?? '').toUpperCase();
        if (data?.promptFeedback?.blockReason || blockedReasons.has(finishReason)) {
          options.record?.({ model, attempt, latency_ms: now() - start, category: 'safety_block', status: response.status, fallback: index > 0 });
          throw new GeminiFailure('safety_block', response.status);
        }
        if (finishReason && finishReason !== 'STOP') {
          options.record?.({ model, attempt, latency_ms: now() - start, category: 'invalid_output', status: response.status, fallback: index > 0 });
          throw new GeminiFailure('invalid_output', response.status);
        }
        let faqs: ReturnType<typeof parseGeneratedFaqs>;
        try {
          const text = data?.candidates?.[0]?.content?.parts?.map(part => typeof part.text === 'string' ? part.text : '').join('');
          faqs = parseGeneratedFaqs(text, options.count);
        }
        catch {
          options.record?.({ model, attempt, latency_ms: now() - start, category: 'invalid_output', status: response.status, fallback: index > 0 });
          throw new GeminiFailure('invalid_output', response.status);
        }
        const returnedModel = typeof data.modelVersion === 'string' ? data.modelVersion : undefined;
        const inputTokens = typeof data.usageMetadata?.promptTokenCount === 'number' && Number.isSafeInteger(data.usageMetadata.promptTokenCount)
          ? data.usageMetadata.promptTokenCount : undefined;
        const outputTokens = typeof data.usageMetadata?.candidatesTokenCount === 'number' && Number.isSafeInteger(data.usageMetadata.candidatesTokenCount)
          ? data.usageMetadata.candidatesTokenCount : undefined;
        options.record?.({ model, attempt, latency_ms: now() - start, category: 'success', status: response.status, fallback: index > 0,
          returned_model: returnedModel, input_tokens: inputTokens, output_tokens: outputTokens });
        return { faqs, model, returnedModel, inputTokens, outputTokens, attempts: attempt, fallbackUsed: index > 0, latencyMs: now() - start };
      }
      let body: GoogleError = {};
      try { body = await response.json(); } catch { /* Never surface raw provider bodies. */ }
      const category = classifyGeminiError(response.status, body);
      lastFailure = new GeminiFailure(category, response.status);
      options.record?.({ model, attempt, latency_ms: now() - start, category, status: response.status, fallback: index > 0 });
      if (retryable(category) && attempt < 2) {
        const hint = retryHintMs(response, body, now);
        const delay = Math.max(hint, 750 * 2 ** (attempt - 1) * (1 + random() * .3));
        if (deadline - now() > delay + 1_000) { await sleep(delay); continue; }
      }
      break;
    }
    if (!fallbackAllowed(lastFailure.category)) break;
  }
  throw lastFailure;
}

export function publicGeminiMessage(category: GeminiCategory) {
  switch (category) {
    case 'rate_limited': return 'AI generation is busy. Please retry shortly.';
    case 'transient_overload': case 'network': return 'AI generation is temporarily unavailable. Please retry.';
    case 'timeout': return 'AI generation timed out. Your credits were not charged; please retry.';
    case 'quota_exhausted': return 'AI generation quota is currently exhausted. Please try again later.';
    case 'model_unavailable': case 'not_found': case 'authentication': case 'invalid_request':
      return 'AI service configuration needs attention. Please contact support.';
    case 'safety_block': return 'The AI could not generate FAQs from this content. Try a different source.';
    case 'invalid_output': return 'The AI returned incomplete FAQs. Your credits were not charged; please retry.';
    default: return 'AI generation failed. Your credits were not charged; please retry.';
  }
}
