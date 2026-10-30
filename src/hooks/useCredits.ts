import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

export interface CreditBalance {
  free: number;
  paid: number;
  legacy: number;
  reserved: number;
  available: number;
  introState: string;
  everPurchased: boolean;
  hold: boolean;
}

export function useCredits() {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id;
  const client = useQueryClient();
  const queryKey = ['faq-credits', userId] as const;
  const query = useQuery({ queryKey, enabled: !!userId && !authLoading,
    queryFn: async (): Promise<CreditBalance> => {
      const { data, error } = await supabase.rpc('can_generate_faqs', { user_uuid: userId!, faq_count: 1 });
      if (error || !data || typeof data !== 'object' || Array.isArray(data)) throw error ?? new Error('Credit balance unavailable');
      const result = data as Record<string, unknown>;
      for (const key of ['free_credits', 'paid_credits', 'legacy_credits', 'reserved_credits', 'remaining_faqs']) {
        const value = result[key];
        if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Credit balance response is incomplete');
      }
      return {
        free: Number(result.free_credits ?? 0), paid: Number(result.paid_credits ?? 0),
        legacy: Number(result.legacy_credits ?? 0), reserved: Number(result.reserved_credits ?? 0),
        available: Number(result.remaining_faqs ?? 0), introState: String(result.intro_state ?? 'review'),
        everPurchased: result.ever_purchased === true, hold: String(result.reason ?? '').includes('billing review'),
      };
    }, staleTime: 10000, refetchInterval: userId ? 30000 : false,
  });
  useEffect(() => {
    if (!userId) return;
    const refresh = () => { void client.invalidateQueries({ queryKey: ['faq-credits', userId] }); };
    const channel = supabase.channel(`faq-credits-${userId}`).on('postgres_changes', {
      event: '*', schema: 'public', table: 'faq_credit_wallets', filter: `user_id=eq.${userId}`,
    }, refresh).subscribe();
    window.addEventListener('faqify-billing-updated', refresh);
    return () => { void supabase.removeChannel(channel); window.removeEventListener('faqify-billing-updated', refresh); };
  }, [userId, client]);
  return { balance: userId ? query.data ?? null : null,
    loading: authLoading || (!!userId && query.isPending), error: userId ? query.error : null,
    refetch: query.refetch };
}
