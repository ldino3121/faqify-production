import { useEffect, useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useCredits } from '@/hooks/useCredits';
import { useSubscription } from '@/hooks/useSubscription';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { openPaddlePortal } from '@/lib/paddle';
import { formatPaymentAmount, legacyAllowance, legacyAllowanceMessage, localDate, manageablePreviousSubscription,
  paymentCategory, paymentStatusText, type PaymentCategory, type PaymentSummary } from '@/lib/billing';

type LedgerEntry = { id: number; bucket: string; entry_type: string; delta: number;
  created_at: string; source_transaction_id: string | null; source_adjustment_id: string | null };
type HistoryPage = { transactions: PaymentSummary[]; next: string | null; hasCustomer: boolean };
const categories: Array<[PaymentCategory, string]> = [
  ['pending', 'Pending payments'], ['completed', 'Completed payments'],
  ['failed', 'Failed or canceled payments'], ['refunded', 'Refunded payments'],
  ['disputed', 'Disputed payments'], ['review', 'Payments under review'],
];

function activityLabel(entry: LedgerEntry, purchases: Map<string, PaymentSummary>) {
  const amount = Math.abs(entry.delta);
  if (entry.entry_type === 'purchase_grant') {
    const purchase = entry.source_transaction_id ? purchases.get(entry.source_transaction_id) : null;
    return `${purchase?.pack ?? 'Credit'} pack purchased · +${amount} credits`;
  }
  if (entry.entry_type === 'intro_grant') return `Free introductory credits · +${amount}`;
  if (entry.entry_type === 'usage') {
    const source = entry.bucket === 'legacy' ? 'temporary allowance' : entry.bucket === 'free' ? 'introductory credits' : 'purchased credits';
    return `Saved ${amount} generated FAQ${amount === 1 ? '' : 's'} · −${amount} ${source}`;
  }
  if (entry.entry_type === 'refund_reversal') return `Purchase adjustment · −${amount} purchased credits`;
  return `Account credit correction · ${entry.delta > 0 ? '+' : ''}${entry.delta} ${entry.bucket} credits`;
}

export function PaddleBilling() {
  const { user } = useAuth();
  const { balance, loading: creditsLoading, error: creditsError } = useCredits();
  const { subscription } = useSubscription();
  const { toast } = useToast();
  const client = useQueryClient();
  const [opening, setOpening] = useState<'payments' | 'subscription' | null>(null);
  const accountId = user?.id;
  const history = useInfiniteQuery({ queryKey: ['paddle-history', accountId], enabled: !!accountId,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<HistoryPage> => {
      const { data, error } = await supabase.functions.invoke('paddle-customer-portal',
        { body: { action: 'history', ...(pageParam ? { after: pageParam } : {}) } });
      if (error || !data || !Array.isArray(data.transactions)) throw error ?? new Error(data?.error || 'Payment history unavailable');
      return data as HistoryPage;
    }, getNextPageParam: last => last.next ?? undefined, staleTime: 15000 });
  const activity = useInfiniteQuery({ queryKey: ['credit-activity', accountId], enabled: !!accountId,
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<LedgerEntry[]> => {
      const { data, error } = await supabase.from('faq_credit_ledger')
        .select('id,bucket,entry_type,delta,created_at,source_transaction_id,source_adjustment_id')
        .eq('user_id', accountId!).order('created_at', { ascending: false }).order('id', { ascending: false })
        .range(pageParam * 20, pageParam * 20 + 19);
      if (error) throw error;
      return data ?? [];
    }, getNextPageParam: (last, pages) => last.length === 20 ? pages.length : undefined, staleTime: 15000 });
  useEffect(() => {
    if (!accountId) return;
    const refresh = () => {
      void client.invalidateQueries({ queryKey: ['paddle-history', accountId] });
      void client.invalidateQueries({ queryKey: ['credit-activity', accountId] });
    };
    window.addEventListener('faqify-billing-updated', refresh);
    return () => window.removeEventListener('faqify-billing-updated', refresh);
  }, [accountId, client]);
  const legacy = legacyAllowance(balance, subscription);
  const canManage = manageablePreviousSubscription(subscription);
  const transactions = history.data?.pages.flatMap(page => page.transactions) ?? [];
  const byTransaction = new Map(transactions.map(transaction => [transaction.id, transaction]));
  const entries = activity.data?.pages.flat() ?? [];
  const hasCustomer = history.data?.pages[0]?.hasCustomer ?? false;
  async function portal(kind: 'payments' | 'subscription') {
    setOpening(kind);
    try { await openPaddlePortal(kind === 'subscription' ? 'subscription' : 'portal'); }
    catch (error) { toast({ title: 'Billing unavailable',
      description: error instanceof Error ? error.message : 'Please retry.', variant: 'destructive' }); }
    finally { setOpening(null); }
  }
  return <div className="space-y-6" aria-label="Billing details">
    <Card><CardHeader><CardTitle>Credit balance</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
      {creditsLoading ? <p>Loading credit balance…</p> : creditsError ? <p role="alert">Unable to load your balance. Please retry.</p> : <>
        <p className="text-2xl font-bold">{balance?.available ?? 0} credits available to use</p>
        <p>{balance?.paid ?? 0} purchased credits remaining · Purchased credits do not expire.</p>
        {(balance?.free ?? 0) > 0 && <p>{balance!.free} free introductory credits remaining.</p>}
        {legacy && subscription && <p>{legacyAllowanceMessage(subscription, legacy.expiresAt)} {legacy.remaining} temporary credits remain.</p>}
        {(balance?.reserved ?? 0) > 0 && <p>{balance!.reserved} credits temporarily reserved for unfinished generation.</p>}
        <p className="text-muted-foreground">Saves use free introductory credits first, then temporary legacy allowance, then purchased credits. One saved generated Q&A pair costs one credit. Collections and saved FAQ totals are separate.</p>
        {balance?.hold && <p role="alert">A billing adjustment needs review. Existing FAQs and embeds remain available; contact support before generating more.</p>}
      </>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Purchases and invoices</CardTitle></CardHeader><CardContent className="space-y-4 text-sm">
      <p className="text-muted-foreground">Paddle sandbox payments. Amounts shown below are the actual transaction totals, including applicable checkout tax. A payment adds credits only after verified fulfillment.</p>
      <div className="flex flex-wrap gap-2">
        {hasCustomer && <Button variant="outline" disabled={!!opening} onClick={() => void portal('payments')}>{opening === 'payments' ? 'Opening…' : 'View payments and invoices'}</Button>}
        {canManage && hasCustomer && <Button variant="outline" disabled={!!opening} onClick={() => void portal('subscription')}>{opening === 'subscription' ? 'Opening…' : 'Manage previous subscription'}</Button>}
      </div>
      {history.isPending && <p>Loading payments…</p>}
      {history.isError && <div role="alert"><p>Unable to load Paddle payment status. No payment has been marked fulfilled here.</p><Button variant="outline" onClick={() => void history.refetch()}>Retry</Button></div>}
      {history.isSuccess && transactions.length === 0 && <p>No Paddle purchases yet. You can buy a credit pack whenever you need one.</p>}
      {history.isSuccess && categories.map(([category, heading]) => {
        const rows = transactions.filter(transaction => paymentCategory(transaction) === category);
        if (!rows.length) return null;
        return <section key={category} className="space-y-2"><h3 className="font-semibold">{heading}</h3>
          <ul className="space-y-2">{rows.map(transaction => <li key={transaction.id} className="rounded border border-border p-3 break-words">
            <p className="font-medium">{transaction.kind === 'credit_pack' ? `${transaction.pack} · ${transaction.credits} FAQ credits`
              : transaction.kind === 'recurring' ? `Previous ${transaction.pack} subscription payment` : `Previous ${transaction.pack} 30-day access payment`}</p>
            <p>{localDate(transaction.billedAt ?? transaction.createdAt)} · {formatPaymentAmount(transaction.amount, transaction.currency)}</p>
            <p>{paymentStatusText(transaction)}</p>
            <p className="text-xs text-muted-foreground">Payment reference: {transaction.id}</p>
          </li>)}</ul></section>;
      })}
      {history.isSuccess && transactions.some(transaction => paymentCategory(transaction) === 'pending') &&
        <Button variant="outline" disabled={history.isFetching} onClick={() => void history.refetch()}>Refresh payment status</Button>}
      {history.hasNextPage && <Button variant="outline" disabled={history.isFetchingNextPage} onClick={() => void history.fetchNextPage()}>{history.isFetchingNextPage ? 'Loading…' : 'More payments'}</Button>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Credit activity</CardTitle></CardHeader><CardContent className="space-y-4 text-sm">
      <p className="text-muted-foreground">These ledger entries explain credit changes; purchase grants here are the credits from the payments above, not additional purchases. Dates use your device’s local time.</p>
      {activity.isPending && <p>Loading credit activity…</p>}
      {activity.isError && <div role="alert"><p>Unable to load credit activity.</p><Button variant="outline" onClick={() => void activity.refetch()}>Retry</Button></div>}
      {activity.isSuccess && entries.length === 0 && <p>No credit activity yet.</p>}
      {activity.isSuccess && <ul className="space-y-2">{entries.map(entry => <li key={entry.id} className="rounded border border-border p-3">
        <p>{activityLabel(entry, byTransaction)}</p><p className="text-xs text-muted-foreground">{localDate(entry.created_at)}</p>
      </li>)}</ul>}
      {activity.hasNextPage && <Button variant="outline" disabled={activity.isFetchingNextPage} onClick={() => void activity.fetchNextPage()}>{activity.isFetchingNextPage ? 'Loading…' : 'More activity'}</Button>}
    </CardContent></Card>
  </div>;
}
