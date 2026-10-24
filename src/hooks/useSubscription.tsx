import { createContext, useCallback, useContext, useEffect, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { normalizeSubscription } from '@/lib/subscription';

function useSubscriptionState() {
  const { user } = useAuth();
  const userId = user?.id;
  const client = useQueryClient();
  const queryKey = ['subscription', userId];
  const query = useQuery({ queryKey, enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from('user_subscriptions').select('*').eq('user_id', userId!).single();
      if (error) throw error;
      return data;
    }, staleTime: 15000, refetchInterval: userId ? 30000 : false,
  });
  useEffect(() => {
    if (!userId) return;
    const invalidate = () => { void client.invalidateQueries({ queryKey: ['subscription', userId] }); };
    const channel = supabase.channel(`account-subscription-${userId}`).on('postgres_changes', {
      event: '*', schema: 'public', table: 'user_subscriptions', filter: `user_id=eq.${userId}`,
    }, invalidate).subscribe();
    window.addEventListener('faqify-billing-updated', invalidate);
    return () => { void supabase.removeChannel(channel); window.removeEventListener('faqify-billing-updated', invalidate); };
  }, [userId, client]);
  const subscription = userId && query.data ? normalizeSubscription(query.data) : null;
  const canCreateFAQ = useCallback(async (faqCount = 1) => {
    if (!userId) return { canGenerate: false, reason: 'Please sign in.' };
    const { data, error } = await supabase.rpc('can_generate_faqs', { user_uuid: userId, faq_count: faqCount });
    if (error || !data) return { canGenerate: false, reason: 'Unable to check your quota. Please retry.' };
    const eligibility = data as Record<string, any>;
    return { canGenerate: !!eligibility.can_generate, reason: eligibility.reason ?? 'Unable to generate.',
      currentUsage: eligibility.current_usage, usageLimit: eligibility.usage_limit, remainingFaqs: eligibility.remaining_faqs,
      planTier: eligibility.plan_tier, planExpiresAt: eligibility.plan_expires_at, isExpired: !!eligibility.is_expired };
  }, [userId]);
  return {
    subscription, loading: !!user && query.isPending, error: query.error,
    refetch: query.refetch, canCreateFAQ,
    getRemainingFAQs: () => subscription ? Math.max(0, subscription.faq_usage_limit - subscription.faq_usage_current) : 0,
    // Usage and plans are changed by authenticated database transactions only.
    incrementUsage: async (_count = 1) => ({ success: false, reason: 'Usage is recorded when generated FAQs are saved.' }),
    changePlan: async (_tier: string, _upgrade = true) => ({ success: false, reason: 'Use checkout to change your plan.' }),
    getSubscriptionStatus: () => subscription && ({ planTier: subscription.plan_tier, status: subscription.status,
      currentUsage: subscription.faq_usage_current, usageLimit: subscription.faq_usage_limit,
      remainingFaqs: Math.max(0, subscription.faq_usage_limit - subscription.faq_usage_current),
      planActivatedAt: subscription.plan_activated_at, planExpiresAt: subscription.plan_expires_at,
      daysRemaining: subscription.days_remaining, isActive: !subscription.is_expired && ['active', 'cancelled', 'canceled'].includes(subscription.status),
      isExpired: subscription.is_expired, lastResetDate: subscription.last_reset_date }),
  };
}
const SubscriptionContext = createContext<ReturnType<typeof useSubscriptionState> | null>(null);
export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const value = useSubscriptionState();
  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}
export function useSubscription() {
  const value = useContext(SubscriptionContext);
  if (!value) throw new Error('useSubscription requires SubscriptionProvider');
  return value;
}
