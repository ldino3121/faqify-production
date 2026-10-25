import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

type Status = { status: string; fulfilledCredits: number | null };

export function BillingSyncNotice({ onOpenBilling }: { onOpenBilling: () => void }) {
  const params = new URLSearchParams(window.location.search);
  const expected = params.get('transaction_id');
  const waiting = params.get('billing') === 'processing';
  const valid = !!expected && /^txn_[a-z0-9]{26}$/.test(expected);
  const { user } = useAuth();
  const client = useQueryClient();
  const [timedOut, setTimedOut] = useState(false);
  const status = useQuery({ queryKey: ['paddle-transaction-status', user?.id, expected],
    enabled: waiting && valid && !!user,
    queryFn: async (): Promise<Status> => {
      const { data, error } = await supabase.functions.invoke('paddle-customer-portal',
        { body: { action: 'transaction_status', transactionId: expected } });
      if (error || !data || typeof data.status !== 'string') throw error ?? new Error(data?.error || 'Payment status unavailable');
      return data as Status;
    }, refetchInterval: query => !timedOut && query.state.data?.fulfilledCredits == null
      && !['canceled', 'past_due'].includes(query.state.data?.status ?? '') ? 3000 : false,
    retry: 2 });
  useEffect(() => {
    if (!waiting || !valid || status.data?.fulfilledCredits != null || ['canceled', 'past_due'].includes(status.data?.status ?? '')) return;
    const timer = window.setTimeout(() => setTimedOut(true), 60000);
    return () => window.clearTimeout(timer);
  }, [waiting, valid, status.data?.fulfilledCredits, status.data?.status]);
  useEffect(() => {
    if (!user || status.data?.fulfilledCredits == null) return;
    window.dispatchEvent(new Event('faqify-billing-updated'));
    void client.invalidateQueries({ queryKey: ['paddle-history', user.id] });
    void client.invalidateQueries({ queryKey: ['credit-activity', user.id] });
  }, [client, user, status.data?.fulfilledCredits]);
  if (!waiting) return null;
  const result = status.data;
  const message = !valid ? 'We cannot identify this checkout. Open Purchases and invoices to check your account.'
    : result?.fulfilledCredits != null ? `${result.fulfilledCredits} credits were added after verified payment confirmation.`
    : result?.status === 'completed' || result?.status === 'paid' ? 'Payment received; credits are being confirmed. Your existing balance is unchanged until fulfillment finishes.'
    : result?.status === 'canceled' || result?.status === 'past_due' ? 'This payment did not complete. Your existing credits are unchanged.'
    : status.isError ? 'Payment status is unavailable right now. Do not retry the purchase until you check its status.'
    : timedOut ? 'Confirmation is taking longer than usual. Check Purchases and invoices or contact support with the payment reference.'
    : 'Checking your Paddle payment. Credits are added only after verified completion.';
  return <div role="status" className="mb-5 rounded-lg border border-border p-4 text-sm space-y-2">
    <p>{message}</p>
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={onOpenBilling}>View purchases and invoices</Button>
      {valid && result?.fulfilledCredits == null && <Button size="sm" variant="outline" onClick={() => {
        setTimedOut(false); void status.refetch();
      }}>Check again</Button>}
    </div>
  </div>;
}
