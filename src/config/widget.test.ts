import { describe, it, expect } from 'vitest';
import { WIDGET_CONFIG } from './widget';

describe('WIDGET_CONFIG.generateEmbedCode', () => {
  it('throws when collectionId is missing', () => {
    expect(() => WIDGET_CONFIG.generateEmbedCode('')).toThrow();
  });

  it('produces a self-contained snippet containing the collection id', () => {
    const code = WIDGET_CONFIG.generateEmbedCode('abc12345-6789', 'dark');
    expect(code).toContain('abc12345');
    expect(code).toContain('get-faq-widget');
    expect(code).toContain('theme-dark');
  });

  it('supports search and layout options', () => {
    const code = WIDGET_CONFIG.generateEmbedCode('abc12345-6789', 'light', {
      search: true,
      layout: 'list',
    });
    expect(code).toContain('search: true');
    expect(code).toContain("layout: 'list'");
  });

  it('defaults to accordion layout without search', () => {
    const code = WIDGET_CONFIG.generateEmbedCode('abc12345-6789');
    expect(code).toContain("layout: 'accordion'");
    expect(code).toContain('search: false');
  });
});

it('renders untrusted FAQ content as text and filters search results', async () => {
  const code = WIDGET_CONFIG.generateEmbedCode('abc12345-6789', 'light', { search: true });
  const markup = code.slice(0, code.indexOf('<script>'));
  document.body.innerHTML = markup;
  const script = code.slice(code.indexOf('<script>') + 8, code.lastIndexOf('</script>'));
  const fakeFetch = async () => ({ ok: true, json: async () => ({ brandingRequired: true, faqs: [
    { question: '<img src=x onerror="alert(1)">Shipping?', answer: 'Delivery & returns' },
    { question: 'Pricing?', answer: 'Monthly plans' },
  ] }) });
  new Function('document', 'fetch', script)(document, fakeFetch);
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(document.querySelector('img')).toBeNull();
  expect(document.querySelector('.faqify-question-text')?.textContent).toContain('<img');
  const input = document.querySelector('input')!;
  input.value = 'pricing'; input.dispatchEvent(new Event('input'));
  const items = document.querySelectorAll<HTMLElement>('.faqify-item');
  expect(items[0].style.display).toBe('none'); expect(items[1].style.display).toBe('');
  expect(document.querySelector('.faqify-powered-by')).not.toBeNull();
});
