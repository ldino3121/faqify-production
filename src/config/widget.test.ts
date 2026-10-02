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
