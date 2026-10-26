import { describe, expect, it } from 'vitest';
import { eligibleFaqs, parseGeneratedFaqs, requestedFaqCount } from '../supabase/functions/_shared/faq-count';

describe('FAQ count contract across text and extracted PDF/DOCX content', () => {
  it('accepts each selectable count and rejects silent clamping or malformed counts', () => {
    for (const input of ['text', 'pdf', 'docx']) {
      for (let count = 1; count <= 10; count++) {
        expect(requestedFaqCount(count), input).toBe(count);
        expect(requestedFaqCount(String(count)), input).toBe(count);
      }
    }
    for (const invalid of [0, -1, 11, 1.5, '5oops', '0', '', {}, []])
      expect(() => requestedFaqCount(invalid)).toThrow('Choose a FAQ count');
  });
  it('keeps only distinct valid pairs and reports an honest shortfall', () => {
    const answer = 'A documented answer with enough detail.';
    const pairs = eligibleFaqs([
      { question: 'What is the first rule?', answer },
      { question: ' what is the FIRST rule? ', answer },
      { question: 'What is the second rule?', answer },
      { question: 'Unsupported?', answer: '' },
    ], 10);
    expect(pairs).toHaveLength(2);
    expect(10 - pairs.length).toBe(8);
  });
  it('rejects malformed and empty AI output without a billable pair', () => {
    expect(() => eligibleFaqs('bad', 10)).toThrow('did not contain FAQ pairs');
    expect(() => eligibleFaqs([{ question: 'Hi', answer: '' }], 3)).toThrow('no eligible FAQs');
    expect(() => parseGeneratedFaqs('Question: a vague answer', 10)).toThrow('incomplete or malformed');
    expect(() => parseGeneratedFaqs('```json\n[{"question":"What is this?","answer":"A test."}]\n```', 10))
      .not.toThrow();
  });
});
