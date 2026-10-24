/** Restrict URL analysis to public HTTP(S) hosts, including every redirect. */
export function isPublicAddress(ip: string): boolean {
  const value = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (value.includes(':')) {
    // Only global-unicast IPv6; mapped IPv4, loopback, local, multicast and transition ranges are excluded.
    return /^[23][0-9a-f]{0,3}:/.test(value) && !value.startsWith('2001:db8:') && !value.startsWith('2002:') && !value.startsWith('2001:0:');
  }
  const parts = value.split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0)) ||
    (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)));
}
export async function publicUrl(input: string): Promise<URL> {
  const url = new URL(input);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || (url.port && !['80', '443'].includes(url.port))) throw new Error('Use a public HTTP(S) website URL.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!host.includes('.') && !host.includes(':')) throw new Error('Local hosts are not allowed.');
  if (/^[\d.]+$/.test(host) || host.includes(':')) {
    if (!isPublicAddress(host)) throw new Error('Private network addresses are not allowed.');
  } else {
    if (/\.(localhost|local|internal|test|invalid)$/i.test(host)) throw new Error('Private hosts are not allowed.');
    const results = await Promise.allSettled([Deno.resolveDns(host, 'A'), Deno.resolveDns(host, 'AAAA')]);
    const addresses = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
    if (!addresses.length || addresses.some(address => !isPublicAddress(address))) throw new Error('Website must resolve to public addresses only.');
  }
  return url;
}
export async function safeFetch(input: string, options: RequestInit = {}): Promise<Response> {
  let next = input;
  for (let redirects = 0; redirects <= 5; redirects++) {
    const url = await publicUrl(next);
    const response = await fetch(url, { ...options, redirect: 'manual', signal: AbortSignal.timeout(15000) });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get('location');
    await response.body?.cancel();
    if (!location) throw new Error('Invalid website redirect.');
    next = new URL(location, url).href;
  }
  throw new Error('Too many website redirects.');
}
export async function readPublicText(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType && !/text\/|application\/xhtml/i.test(contentType)) throw new Error('Website did not return readable web content.');
  const reader = response.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let size = 0, text = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2 * 1024 * 1024) throw new Error('Webpage is too large. Paste the relevant text instead.');
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally { await reader.cancel(); }
}
