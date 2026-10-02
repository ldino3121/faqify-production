import { describe, it, expect } from 'vitest';
import {
  validateUrl,
  validateText,
  validateFile,
  validateCollectionTitle,
  sanitizeText,
  RateLimiter,
} from './validation';

describe('validateUrl', () => {
  it('accepts http(s) URLs', () => {
    expect(validateUrl('https://example.com').isValid).toBe(true);
    expect(validateUrl('http://example.com/page').isValid).toBe(true);
  });
  it('rejects empty and bare domains', () => {
    expect(validateUrl('').isValid).toBe(false);
    expect(validateUrl('example.com').isValid).toBe(false);
  });
});

describe('validateText', () => {
  it('enforces the 50-char minimum', () => {
    expect(validateText('short').isValid).toBe(false);
    expect(validateText('x'.repeat(60)).isValid).toBe(true);
  });
  it('rejects over 10,000 chars', () => {
    expect(validateText('x'.repeat(10001)).isValid).toBe(false);
  });
});

describe('sanitizeText', () => {
  it('removes angle brackets and dangerous protocols', () => {
    const out = sanitizeText('<script>alert(1)</script> javascript:data:x');
    expect(out).not.toContain('<');
    expect(out.toLowerCase()).not.toContain('javascript:');
  });
});

describe('validateCollectionTitle', () => {
  it('rejects script markup', () => {
    expect(validateCollectionTitle('<script>').isValid).toBe(false);
  });
  it('accepts a normal title', () => {
    expect(validateCollectionTitle('My FAQ').isValid).toBe(true);
  });
});

describe('validateFile', () => {
  it('accepts a .txt file', () => {
    const f = new File(['hello world'], 'a.txt', { type: 'text/plain' });
    expect(validateFile(f).isValid).toBe(true);
  });
  it('rejects a .exe file', () => {
    const f = new File(['x'], 'virus.exe', { type: 'application/octet-stream' });
    expect(validateFile(f).isValid).toBe(false);
  });
});

describe('RateLimiter', () => {
  it('blocks requests beyond the limit', () => {
    const rl = new RateLimiter(2, 60000);
    expect(rl.isAllowed('u')).toBe(true);
    expect(rl.isAllowed('u')).toBe(true);
    expect(rl.isAllowed('u')).toBe(false);
  });
});
