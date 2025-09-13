
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface Subscription {
  id: string;
  plan_tier: 'Free' | 'Pro' | 'Business';
  status: 'active' | 'expired' | 'cancelled' | 'past_due' | 'incomplete' | 'trialing';
  faq_usage_current: number;
  faq_usage_limit: number;
  is_annual: boolean;
  current_period_end: string | null;
  plan_activated_at: string;
  plan_expires_at: string;
  last_reset_date: string;
  previous_plan_tier: 'Free' | 'Pro' | 'Business' | null;
  plan_changed_at: string;
  days_remaining: number;
  is_expired: boolean;
  expires_soon: boolean;
  // New subscription management fields
  auto_renewal: boolean;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  payment_type: 'one_time' | 'recurring';
  next_billing_date: string | null;
  billing_cycle: 'monthly' | 'yearly';
  subscription_source: 'manual' | 'stripe' | 'razorpay';
  is_cancelled: boolean;
  continues_until: string | null;
}

export const useSubscription = () => {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      setSubscription(null);
      setLoading(false);
      return;
    }

    fetchSubscription();

    // Listen for real-time updates on user subscriptions
    const userSubChannel = supabase
      .channel('subscription-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'user_subscriptions',
        filter: `user_id=eq.${user.id}`,
      }, () => {
        console.log('User subscription changed, refetching...');
        fetchSubscription();
      })
      .subscribe();

    // Also listen for changes to subscription plans (for pricing updates)
    const plansChannel = supabase
      .channel('plans-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'subscription_plans',
      }, () => {
        console.log('Subscription plans updated, refetching user subscription...');
        fetchSubscription();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(userSubChannel);
      supabase.removeChannel(plansChannel);
    };
  }, [user]);

  const fetchSubscription = async () => {
    if (!user) return;

    try {
      setLoading(true);

      // Get subscription data directly from table
      const { data, error } = await supabase
        .from('user_subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching subscription:', error);
        return;
      }

      if (data) {
        // Normalize field names across historical schemas
        const normalizedPlanTier = (data as any).plan_tier ?? (data as any).plan_id;
        const normalizedActivatedAt = (data as any).plan_activated_at ?? (data as any).activated_at ?? (data as any).created_at ?? null;
        const normalizedExpiresAt = (data as any).plan_expires_at ?? (data as any).expires_at ?? (data as any).current_period_end ?? null;

        // Calculate expiry info manually
        const now = new Date();
        const expiryDate = normalizedExpiresAt ? new Date(normalizedExpiresAt) : null;
        const daysRemaining = expiryDate ? Math.max(0, Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))) : 0;

        setSubscription({
          ...data,
          // Ensure consistent properties expected by the UI
          plan_tier: normalizedPlanTier,
          plan_activated_at: normalizedActivatedAt,
          plan_expires_at: normalizedExpiresAt,
          current_period_end: (data as any).current_period_end ?? normalizedExpiresAt,
          days_remaining: daysRemaining,
          is_expired: expiryDate ? now > expiryDate : false,
          expires_soon: daysRemaining <= 7 && daysRemaining > 0,
          // Defaults / compatibility
          auto_renewal: (data as any).auto_renewal ?? (normalizedPlanTier !== 'Free'),
          cancelled_at: (data as any).cancelled_at ?? null,
          cancellation_reason: (data as any).cancellation_reason ?? null,
          payment_type: (data as any).payment_type ?? (normalizedPlanTier === 'Free' ? 'one_time' : 'recurring'),
          next_billing_date: (data as any).next_billing_date ?? null,
          billing_cycle: (data as any).billing_cycle ?? 'monthly',
          subscription_source: (data as any).subscription_source ?? 'manual',
          is_cancelled: !!((data as any).cancelled_at),
          continues_until: ((data as any).cancelled_at && normalizedExpiresAt) ? normalizedExpiresAt : null
        });
      }
    } catch (error) {
      console.error('Error fetching subscription:', error);
    } finally {
      setLoading(false);
    }
  };

  const canCreateFAQ = async (faqCount: number = 1) => {
    if (!subscription || !user) return { canGenerate: false, reason: 'No subscription found' };

    try {
      const now = new Date();
      const expiryDate = subscription.plan_expires_at ? new Date(subscription.plan_expires_at) : null;

      // Block if expired (paid plans only). Expiry at or before "now" is considered expired.
      if (subscription.plan_tier !== 'Free' && expiryDate && now >= expiryDate) {
        return {
          canGenerate: false,
          reason: `Your plan expired on ${expiryDate.toLocaleDateString()}. Please renew to continue generating FAQs.`,
          currentUsage: subscription.faq_usage_current,
          usageLimit: subscription.faq_usage_limit,
          remainingFaqs: 0,
          planTier: subscription.plan_tier,
          planExpiresAt: subscription.plan_expires_at,
          daysRemaining: 0,
          isWithinPeriod: false,
          isExpired: true
        };
      }

      // Block if quota exceeded
      const remainingFaqs = Math.max(0, subscription.faq_usage_limit - subscription.faq_usage_current);
      if (faqCount > remainingFaqs) {
        return {
          canGenerate: false,
          reason: `You have ${remainingFaqs} FAQs remaining in your quota. You're trying to generate ${faqCount} FAQs.`,
          currentUsage: subscription.faq_usage_current,
          usageLimit: subscription.faq_usage_limit,
          remainingFaqs,
          planTier: subscription.plan_tier,
          planExpiresAt: subscription.plan_expires_at,
          daysRemaining: subscription.days_remaining,
          isWithinPeriod: true,
          isExpired: false
        };
      }

      // Optionally defer to backend rule if available; ignore if function missing
      try {
        const { data, error } = await supabase.rpc('can_generate_faqs', {
          user_uuid: user.id,
          faq_count: faqCount
        });
        if (!error && data && data.can_generate !== undefined) {
          return {
            canGenerate: !!data.can_generate,
            reason: data.reason ?? 'OK',
            currentUsage: data.current_usage ?? subscription.faq_usage_current,
            usageLimit: data.usage_limit ?? subscription.faq_usage_limit,
            remainingFaqs: data.remaining_faqs ?? remainingFaqs,
            planTier: data.plan_tier ?? subscription.plan_tier,
            planExpiresAt: data.plan_expires_at ?? subscription.plan_expires_at,
            daysRemaining: data.days_remaining ?? subscription.days_remaining,
            isWithinPeriod: data.is_within_period ?? true,
            isExpired: !!data.is_expired
          };
        }
      } catch (_) {
        // ignore RPC errors and fall back to local check
      }

      return {
        canGenerate: true,
        reason: 'OK',
        currentUsage: subscription.faq_usage_current,
        usageLimit: subscription.faq_usage_limit,
        remainingFaqs,
        planTier: subscription.plan_tier,
        planExpiresAt: subscription.plan_expires_at,
        daysRemaining: subscription.days_remaining,
        isWithinPeriod: true,
        isExpired: false
      };
    } catch (error) {
      console.error('Error checking FAQ eligibility:', error);
      return { canGenerate: false, reason: 'Error checking eligibility' };
    }
  };

  const getRemainingFAQs = () => {
    if (!subscription) return 0;
    return subscription.faq_usage_limit - subscription.faq_usage_current;
  };

  const incrementUsage = async (faqCount: number = 1) => {
    if (!user) return { success: false, reason: 'User not authenticated' };

    try {
      const { data, error } = await supabase.rpc('increment_faq_usage_by_count', {
        user_uuid: user.id,
        faq_count: faqCount
      });

      if (error) {
        console.error('Error incrementing usage:', error);
        return { success: false, reason: error.message };
      }

      // Refresh subscription data
      await fetchSubscription();
      return data;
    } catch (error) {
      console.error('Error incrementing usage:', error);
      return { success: false, reason: 'Error incrementing usage' };
    }
  };

  const changePlan = async (newPlanTier: 'Free' | 'Pro' | 'Business', isUpgrade: boolean = true) => {
    // SECURITY: Plan changes must go through payment verification
    // This function is disabled to prevent unauthorized plan assignments
    console.warn('Direct plan changes are disabled. Use payment flow instead.');
    return {
      success: false,
      reason: 'Direct plan changes are disabled. Please use the payment system to upgrade your plan.'
    };
  };

  const getSubscriptionStatus = () => {
    if (!subscription) return null;

    const now = new Date();
    const expiresAt = subscription.plan_expires_at ? new Date(subscription.plan_expires_at) : null;
    const daysRemaining = expiresAt ? Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : 0;

    return {
      planTier: subscription.plan_tier,
      status: subscription.status,
      currentUsage: subscription.faq_usage_current,
      usageLimit: subscription.faq_usage_limit,
      remainingFaqs: subscription.faq_usage_limit - subscription.faq_usage_current,
      planActivatedAt: subscription.plan_activated_at,
      planExpiresAt: subscription.plan_expires_at,
      daysRemaining: subscription.plan_tier === 'Free' ? Infinity : Math.max(0, daysRemaining),
      isActive: subscription.status === 'active' && (subscription.plan_tier === 'Free' || (expiresAt ? expiresAt > now : true)),
      isExpired: subscription.plan_tier !== 'Free' && (!!expiresAt ? expiresAt <= now : false),
      lastResetDate: subscription.last_reset_date
    };
  };

  return {
    subscription,
    loading,
    canCreateFAQ,
    getRemainingFAQs,
    incrementUsage,
    changePlan,
    getSubscriptionStatus,
    refetch: fetchSubscription,
  };
};
