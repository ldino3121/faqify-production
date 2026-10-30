type SearchableCollection = { title: string; faqs: Array<{ question: string; answer: string }> };

// The account's bounded collection dataset is loaded once under RLS. Search
// precedes pagination so matches outside the visible page are included.
export function searchCollections<T extends SearchableCollection>(collections: T[], rawQuery: string): T[] {
  const query = rawQuery.trim().normalize('NFKC').toLocaleLowerCase();
  if (!query) return collections;
  return collections.filter(collection => {
    if (collection.title.normalize('NFKC').toLocaleLowerCase().includes(query)) return true;
    return collection.faqs.some(faq =>
      faq.question.normalize('NFKC').toLocaleLowerCase().includes(query) ||
      faq.answer.normalize('NFKC').toLocaleLowerCase().includes(query));
  });
}
