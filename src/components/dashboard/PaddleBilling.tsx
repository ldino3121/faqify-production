import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useBillingRecords, fetchLedgerPage, type HistoryPage, type LedgerEntry } from '@/hooks/useBillingRecords';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { openPaddlePortal } from '@/lib/paddle';
import { paymentCategory, type PaymentCategory } from '@/lib/billing';
import { ActivityRecord, PaymentRecord } from './BillingRecordCards';

const categories: Array<[PaymentCategory, string]> = [
  ['pending', 'Pending payments'], ['completed', 'Completed payments'],
  ['failed', 'Failed or canceled payments'], ['refunded', 'Refunded payments'],
  ['disputed', 'Disputed payments'], ['review', 'Payments under review'],
];

export function PaddleBilling() {
  const { user } = useAuth();
  const accountId = user?.id;
  const { toast } = useToast();
  const { payments, activity, completed, hasCustomer } = useBillingRecords();
  const [opening, setOpening] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const selected = new URLSearchParams(location.search).get('history');
  const mode = selected === 'payments' || selected === 'activity' ? selected : null;
  const setMode = (next: 'payments' | 'activity' | null) => {
    const params = new URLSearchParams(location.search);
    if (next) params.set('history', next); else params.delete('history');
    navigate({ pathname: '/dashboard', search: params.toString() ? `?${params}` : '', hash: '#upgrade' });
  };
  const history = useInfiniteQuery({ queryKey: ['paddle-history', accountId], enabled: !!accountId && mode === 'payments',
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<HistoryPage> => {
      const { data, error } = await supabase.functions.invoke('paddle-customer-portal',
        { body: { action: 'history', ...(pageParam ? { after: pageParam } : {}) } });
      if (error || !data || !Array.isArray(data.transactions)) throw error ?? new Error(data?.error || 'Payment history unavailable');
      return data as HistoryPage;
    }, getNextPageParam: last => last.next ?? undefined, staleTime: 30000 });
  const allActivity = useInfiniteQuery({ queryKey: ['credit-activity', accountId], enabled: !!accountId && mode === 'activity',
    initialPageParam: 0,
    queryFn: ({ pageParam }): Promise<LedgerEntry[]> => fetchLedgerPage(accountId!, pageParam * 20, 20),
    getNextPageParam: (last, pages) => last.length === 20 ? pages.length : undefined, staleTime: 30000 });
  const transactions = history.data?.pages.flatMap(page => page.transactions) ?? [];
  const entries = allActivity.data?.pages.flat() ?? [];
  async function portal() {
    setOpening(true);
    try { await openPaddlePortal('portal'); }
    catch (error) { toast({ title: 'Billing unavailable',
      description: error instanceof Error ? error.message : 'Please retry.', variant: 'destructive' }); }
    finally { setOpening(false); }
  }
  const portalButton = (hasCustomer || history.data?.pages[0]?.hasCustomer) &&
    <Button disabled={opening} onClick={() => void portal()}>{opening ? 'Opening…' : 'Open billing portal'}</Button>;
  if (mode === 'payments') return <section className="space-y-4" aria-label="All payments">
    <Button variant="ghost" onClick={() => setMode(null)}>← Back to Buy Credits</Button>
    <Card><CardHeader><CardTitle>All payments and invoices</CardTitle></CardHeader><CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">Paddle test-mode payments. Credits appear only after verified fulfillment. The portal provides available invoices.</p>
      {portalButton}
      {history.isPending && <p>Loading payments…</p>}
      {history.isError && <div role="alert"><p>Unable to load payments.</p><Button variant="outline" onClick={() => void history.refetch()}>Retry</Button></div>}
      {history.isSuccess && transactions.length === 0 && <p>No payments yet.</p>}
      {history.isSuccess && categories.map(([category, heading]) => {
        const rows = transactions.filter(transaction => paymentCategory(transaction) === category);
        return rows.length ? <section key={category} className="space-y-2"><h3 className="font-semibold">{heading}</h3>
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{rows.map(transaction => <PaymentRecord key={transaction.id} payment={transaction} />)}</ul>
        </section> : null;
      })}
      {history.hasNextPage && <Button variant="outline" disabled={history.isFetchingNextPage} onClick={() => void history.fetchNextPage()}>
        {history.isFetchingNextPage ? 'Loading…' : 'More payments'}</Button>}
      {history.isSuccess && transactions.some(transaction => paymentCategory(transaction) === 'pending') &&
        <Button variant="outline" disabled={history.isFetching} onClick={() => void history.refetch()}>Check payment status</Button>}
    </CardContent></Card>
  </section>;
  if (mode === 'activity') return <section className="space-y-4" aria-label="All credit activity">
    <Button variant="ghost" onClick={() => setMode(null)}>← Back to Buy Credits</Button>
    <Card><CardHeader><CardTitle>All credit activity</CardTitle></CardHeader><CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">Purchase grants and usage are ledger entries, not additional payments. Dates use your local time.</p>
      {allActivity.isPending && <p>Loading credit activity…</p>}
      {allActivity.isError && <div role="alert"><p>Unable to load credit activity.</p><Button variant="outline" onClick={() => void allActivity.refetch()}>Retry</Button></div>}
      {allActivity.isSuccess && entries.length === 0 && <p>No credit activity yet.</p>}
      {allActivity.isSuccess && <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{entries.map(entry => <ActivityRecord key={entry.id} entry={entry} />)}</ul>}
      {allActivity.hasNextPage && <Button variant="outline" disabled={allActivity.isFetchingNextPage} onClick={() => void allActivity.fetchNextPage()}>
        {allActivity.isFetchingNextPage ? 'Loading…' : 'More activity'}</Button>}
    </CardContent></Card>
  </section>;
  return <div className="grid gap-4 lg:grid-cols-2" aria-label="Recent billing records">
    <Card><CardHeader><CardTitle>Completed payments</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
      {payments.isPending && <p>Loading payments…</p>}
      {payments.isError && <div role="alert"><p>Unable to load payments.</p><Button variant="outline" onClick={() => void payments.refetch()}>Retry</Button></div>}
      {payments.isSuccess && completed.length === 0 && <p>No completed purchases yet.</p>}
      {payments.isSuccess && <ul className="space-y-2">{completed.map(payment => <PaymentRecord key={payment.id} payment={payment} />)}</ul>}
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setMode('payments')}>View all payments</Button>{portalButton}</div>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Credit activity</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
      {activity.isPending && <p>Loading credit activity…</p>}
      {activity.isError && <div role="alert"><p>Unable to load credit activity.</p><Button variant="outline" onClick={() => void activity.refetch()}>Retry</Button></div>}
      {activity.isSuccess && activity.data.length === 0 && <p>No credit activity yet.</p>}
      {activity.isSuccess && <ul className="space-y-2">{activity.data.map(entry => <ActivityRecord key={entry.id} entry={entry} />)}</ul>}
      <Button variant="outline" onClick={() => setMode('activity')}>View all credit activity</Button>
    </CardContent></Card>
  </div>;
}
