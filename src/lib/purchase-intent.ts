export type CreditPack = 'Pro' | 'Business';

export function purchaseIntent(search: string): CreditPack | null {
  const pack = new URLSearchParams(search).get('purchase');
  return pack === 'Pro' || pack === 'Business' ? pack : null;
}

export function intendedDashboard(pack: CreditPack | null): string {
  return pack ? `/dashboard?purchase=${pack}` : '/dashboard';
}
