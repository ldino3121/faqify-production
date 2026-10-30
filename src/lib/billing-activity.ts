import type { LedgerEntry } from '@/hooks/useBillingRecords';

export function activityLabel(entry: LedgerEntry) {
  const amount = Math.abs(entry.delta);
  if (entry.entry_type === 'purchase_grant') {
    const pack = entry.grantCredits === 100 ? 'Pro'
      : entry.grantCredits === 500 ? 'Business' : 'Credit';
    return `${pack} pack purchased · +${amount} credits`;
  }
  if (entry.entry_type === 'intro_grant') return `Free introductory credits · +${amount}`;
  if (entry.entry_type === 'usage') {
    const source = entry.bucket === 'legacy' ? 'temporary allowance' : entry.bucket === 'free' ? 'introductory credits' : 'purchased credits';
    return `Saved ${amount} generated FAQ${amount === 1 ? '' : 's'} · −${amount} ${source}`;
  }
  if (entry.entry_type === 'refund_reversal') return `Purchase adjustment · −${amount} purchased credits`;
  return `Account credit correction · ${entry.delta > 0 ? '+' : ''}${entry.delta} ${entry.bucket} credits`;
}
