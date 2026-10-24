import { requireRolloutOpen } from '@/lib/rollout';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { paddle } from '@/lib/paddle';
import { supabase } from '@/integrations/supabase/client';
export default function Checkout() {
  const [error, setError] = useState('');
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('_ptxn');
    if (!id || !/^txn_[a-z0-9]{26}$/.test(id)) { setError('Open checkout from a pricing plan or your Paddle payment link.'); return; }
    let mounted = true;
    (async () => {
      await requireRolloutOpen();
      const { data, error } = await supabase.functions.invoke('create-paddle-checkout', { body: { action: 'resume', transactionId: id } });
      if (error || data?.transactionId !== id) throw new Error('Sign in with the approved account that opened this checkout, then reopen the link.');
      const instance = await paddle();
      await requireRolloutOpen();
      if (mounted) instance.Checkout.open({ transactionId: id });
    })().catch(e => { if (mounted) setError(e.message); });
    return () => { mounted = false; };
  }, []);
  return <main className="min-h-screen flex flex-col items-center justify-center gap-5 p-6"><h1 className="text-2xl font-bold">FAQify checkout</h1><p>{error || 'Your secure checkout is opening…'}</p><Link to="/dashboard">Return to dashboard</Link></main>;
}
