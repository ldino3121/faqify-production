import { describe, expect, it } from 'vitest';
import { escapeHtml, csvCell } from './export';
describe('exports',()=>{
  it('makes untrusted FAQ text inert in HTML documents',()=>expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'));
  it('escapes CSV delimiters and prevents spreadsheet formula execution',()=>{
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell(' =HYPERLINK("https://example.com")')).toBe('"\' =HYPERLINK(""https://example.com"")"');
  });
});
