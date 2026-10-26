export function requestedFaqCount(value: unknown): number {
  if (value === undefined || value === null) return 5;
  const count = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > 10)
    throw new Error('Choose a FAQ count from 1 to 10.');
  return count;
}

export type GeneratedPair = { question: string; answer: string };
export function parseGeneratedFaqs(raw: unknown, requested: number): GeneratedPair[] {
  if (typeof raw !== 'string') throw new Error('The AI response was incomplete or malformed. No credits were charged; please retry.');
  const content = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  let parsed: unknown;
  try { parsed = JSON.parse(content); }
  catch { throw new Error('The AI response was incomplete or malformed. No credits were charged; please retry.'); }
  return eligibleFaqs(parsed, requested);
}
export function eligibleFaqs(value: unknown, requested: number): GeneratedPair[] {
  if (!Array.isArray(value)) throw new Error('The AI response did not contain FAQ pairs. No credits were charged.');
  const seen = new Set<string>();
  const pairs: GeneratedPair[] = [];
  for (const item of value) {
    if (typeof item?.question !== 'string' || typeof item?.answer !== 'string') continue;
    const question = item.question.trim();
    const answer = item.answer.trim();
    if (question.length < 3 || question.length > 500 || answer.length < 3 || answer.length > 4000) continue;
    const key = question.toLocaleLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ question, answer });
    if (pairs.length === requested) break;
  }
  if (!pairs.length) throw new Error('The AI returned no eligible FAQs. No credits were charged.');
  return pairs;
}
