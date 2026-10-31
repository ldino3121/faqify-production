import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';

const widgetSource = readFileSync(`${process.cwd()}/public/widget.js`, 'utf8')
  .replace('  // Generate session ID', '  window.__resolveApiUrl = getApiUrl; window.__fetchFAQData = fetchFAQData;\n  // Generate session ID');

function loadWidget(scriptOrigin: string, configuredApiUrl?: string) {
  const dom = new JSDOM('', { url: 'https://customer.example/', runScripts: 'outside-only' });
  const script = { src: `${scriptOrigin}/widget.js`, dataset: configuredApiUrl ? { apiUrl: configuredApiUrl } : {} };
  Object.defineProperty(dom.window.document, 'currentScript', { configurable: true, value: script });
  dom.window.eval(widgetSource);
  return dom.window as typeof dom.window & {
    __resolveApiUrl: () => string | null;
    __fetchFAQData: (collectionId: string, config: { apiUrl: string }) => Promise<unknown>;
  };
}

describe('widget backend isolation', () => {
  it('does not point a preview script at production when no API is configured', () => {
    expect(loadWidget('https://faqify-preview.vercel.app').__resolveApiUrl()).toBeNull();
  });

  it('uses a staging script setting and never falls back to production after failed fetches', async () => {
    const stagingUrl = 'https://oltufhuxeaqgyyjbvgqo.supabase.co';
    const window = loadWidget('https://faqify-preview.vercel.app', stagingUrl);
    expect(window.__resolveApiUrl()).toBe(stagingUrl);
    const fetch = vi.fn().mockRejectedValue(new Error('controlled staging failure'));
    window.fetch = fetch;
    window.setTimeout = ((callback: () => void) => { callback(); return 0; }) as typeof window.setTimeout;
    await expect(window.__fetchFAQData('synthetic-collection', { apiUrl: stagingUrl })).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(3);
    for (const [url] of fetch.mock.calls) expect(url).toMatch(/^https:\/\/oltufhuxeaqgyyjbvgqo\.supabase\.co\//);
  });

  it('preserves the production default for a script served from the production domain', () => {
    expect(loadWidget('https://www.faqify.app').__resolveApiUrl())
      .toBe('https://dlzshcshqjdghmtzlbma.supabase.co');
  });
});
