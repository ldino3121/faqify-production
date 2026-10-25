import { useEffect, useState } from 'react';
import { useSubscription } from '@/hooks/useSubscription';
import { useCredits } from '@/hooks/useCredits';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
export function BillingSyncNotice() {
  const params = new URLSearchParams(window.location.search);
  const expected = params.get('transaction_id');
  const waiting = params.get('billing') === 'processing';
  const { subscription, refetch } = useSubscription();
  const { refetch: refetchCredits } = useCredits();
  const [timedOut, setTimedOut] = useState(false);
  const { data: creditPurchaseData, refetch: refetchPurchase } = useQuery({ queryKey: ['credit-purchase', expected], enabled: !!expected,
    queryFn: async () => {
      const { data, error } = await supabase.from('faq_credit_grants').select('credits').eq('transaction_id', expected!).maybeSingle();
      if (error) throw error;
      return data;
    }, refetchInterval: waiting ? 3000 : false });
  const confirmed = !!expected && (creditPurchaseData?.credits != null || subscription?.paddle_last_transaction_id === expected);
  useEffect(() => {
    if (!waiting || confirmed) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      if (++attempts >= 20) { window.clearInterval(timer); setTimedOut(true); }
      void refetch(); void refetchCredits(); void refetchPurchase();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [waiting, confirmed, refetch, refetchCredits, refetchPurchase]);
  if (!waiting) return null;
  return <div role="status" className="mb-5 rounded-lg border p-4 text-sm space-y-2">
    <p>{confirmed ? creditPurchaseData?.credits != null ? `${creditPurchaseData.credits} credits added to your balance.` : 'Legacy payment confirmed.' : timedOut
      ? 'Payment confirmation is taking longer than usual. Refresh your balance or contact support. A checkout success screen does not grant credits.'
      : 'Payment is pending. Credits appear after Paddle confirms the completed transaction.'}</p>
    {!confirmed && <Button size="sm" variant="outline" onClick={() => { void refetch(); void refetchCredits(); void refetchPurchase(); }}>Refresh balance</Button>}
  </div>;
}
