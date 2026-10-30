import { describe, expect, it } from 'vitest';
import { searchCollections } from '../src/lib/faq-search';

const collections = Array.from({ length: 16 }, (_, index) => ({
  id: String(index), title: index === 14 ? 'Returns & refunds' : `Collection ${index}`,
  faqs: [{ question: index === 15 ? 'Where is my receipt?' : `Question ${index}`,
    answer: index === 13 ? 'Email help@example.com for support.' : `Answer ${index}` }],
}));

describe('full account FAQ search', () => {
  it('finds title, question and answer matches beyond the first visible page', () => {
    expect(searchCollections(collections, 'returns & refunds').map(item => item.id)).toEqual(['14']);
    expect(searchCollections(collections, 'receipt?').map(item => item.id)).toEqual(['15']);
    expect(searchCollections(collections, 'help@example.com').map(item => item.id)).toEqual(['13']);
  });
  it('treats punctuation literally, clears whitespace and returns each collection once', () => {
    expect(searchCollections(collections, '  ').length).toBe(16);
    expect(searchCollections(collections, 'Question 13').map(item => item.id)).toEqual(['13']);
    expect(searchCollections(collections, '%%%%')).toEqual([]);
    expect(searchCollections(collections, 'RETURNS & REFUNDS').map(item => item.id)).toEqual(['14']);
  });
});
