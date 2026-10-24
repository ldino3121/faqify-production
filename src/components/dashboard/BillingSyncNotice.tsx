import { useEffect, useState } from 'react';
import { useSubscription } from '@/hooks/useSubscription';
import { Button } from '@/components/ui/button';
export function BillingSyncNotice() {
  const params = new URLSearchParams(window.location.search);
  const expected = params.get('transaction_id');
  const waiting = params.get('billing') === 'processing';
  const { subscription, refetch } = useSubscription();
  const [timedOut, setTimedOut] = useState(false);
  const confirmed = !!expected && subscription?.paddle_last_transaction_id === expected;
  useEffect(() => {
    if (!waiting || confirmed) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      if (++attempts >= 20) { window.clearInterval(timer); setTimedOut(true); }
      void refetch();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [waiting, confirmed, refetch]);
  if (!waiting) return null;
  return <div role="status" className="mb-5 rounded-lg border p-4 text-sm space-y-2">
    <p>{confirmed ? 'Payment confirmed. Your plan and FAQ quota are updated.' : timedOut
      ? 'Your payment confirmation is taking longer than usual. Refresh your plan or contact support if it remains unchanged.'
      : 'Confirming your payment and updating your plan…'}</p>
    {!confirmed && <Button size="sm" variant="outline" onClick={() => void refetch()}>Refresh plan</Button>}
  </div>;
}
