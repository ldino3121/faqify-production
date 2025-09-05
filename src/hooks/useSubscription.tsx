
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
      // First check and handle expired subscriptions
      await supabase.rpc('check_and_handle_expired_subscriptions');

      // Then check and reset monthly usage if needed
      await supabase.rpc('check_and_reset_user_usage', {
        user_uuid: user.id
      });

      // Get subscription with expiry information
      const { data: subscriptionData, error: subscriptionError } = await supabase
        .rpc('get_subscription_with_expiry', {
          user_uuid: user.id
        });

      if (subscriptionError) {
        console.error('Error fetching subscription with expiry:', subscriptionError);
        // Fallback to regular subscription fetch
        const { data, error } = await supabase
          .from('user_subscriptions')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (error && error.code !== 'PGRST116') {
          console.error('Error fetching subscription:', error);
          return;
        }

        // Calculate expiry info manually if function fails
        const now = new Date();
        const expiryDate = data?.plan_expires_at ? new Date(data.plan_expires_at) : null;
        const daysRemaining = expiryDate ? Math.max(0, Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))) : 0;

        setSubscription({
          ...data,
          days_remaining: daysRemaining,
          is_expired: expiryDate ? now > expiryDate : false,
          expires_soon: daysRemaining <= 7 && daysRemaining > 0,
          // Add default values for new fields if not present (backward compatibility)
          auto_renewal: data?.auto_renewal ?? (data?.plan_tier !== 'Free'),
          cancelled_at: data?.cancelled_at ?? null,
          cancellation_reason: data?.cancellation_reason ?? null,
          payment_type: data?.payment_type ?? (data?.plan_tier === 'Free' ? 'one_time' : 'recurring'),
          next_billing_date: data?.next_billing_date ?? null,
          billing_cycle: data?.billing_cycle ?? 'monthly',
          subscription_source: data?.subscription_source ?? 'manual',
          is_cancelled: !!(data?.cancelled_at),
          continues_until: (data?.cancelled_at && data?.plan_expires_at) ? data.plan_expires_at : null
        });
      } else {
        setSubscription(subscriptionData);
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
      // First check plan expiry for paid plans
      if (subscription.plan_tier !== 'Free' && subscription.plan_expires_at) {
        const now = new Date();
        const expiryDate = new Date(subscription.plan_expires_at);

        if (now > expiryDate) {
          return {
            canGenerate: false,
            reason: `Your Monthly Pass expired on ${expiryDate.toLocaleDateString()}. Please renew to continue generating FAQs.`,
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
      }

      const { data, error } = await supabase.rpc('can_generate_faqs', {
        user_uuid: user.id,
        faq_count: faqCount
      });

      if (error) {
        console.error('Error checking FAQ eligibility:', error);
        return { canGenerate: false, reason: 'Error checking eligibility' };
      }

      return {
        canGenerate: data.can_generate,
        reason: data.reason,
        currentUsage: data.current_usage,
        usageLimit: data.usage_limit,
        remainingFaqs: data.remaining_faqs,
        planTier: data.plan_tier,
        planExpiresAt: data.plan_expires_at,
        daysRemaining: data.days_remaining,
        isWithinPeriod: data.is_within_period,
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
    if (!user) return { success: false, reason: 'User not authenticated' };

    try {
      const { data, error } = await supabase.rpc('change_subscription_plan', {
        user_uuid: user.id,
        new_plan_tier: newPlanTier,
        is_upgrade: isUpgrade
      });

      if (error) {
        console.error('Error changing plan:', error);
        return { success: false, reason: error.message };
      }

      // Refresh subscription data
      await fetchSubscription();
      return data;
    } catch (error) {
      console.error('Error changing plan:', error);
      return { success: false, reason: 'Error changing plan' };
    }
  };

  const getSubscriptionStatus = () => {
    if (!subscription) return null;

    const now = new Date();
    const expiresAt = new Date(subscription.plan_expires_at);
    const daysRemaining = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    return {
      planTier: subscription.plan_tier,
      status: subscription.status,
      currentUsage: subscription.faq_usage_current,
      usageLimit: subscription.faq_usage_limit,
      remainingFaqs: subscription.faq_usage_limit - subscription.faq_usage_current,
      planActivatedAt: subscription.plan_activated_at,
      planExpiresAt: subscription.plan_expires_at,
      daysRemaining: subscription.plan_tier === 'Free' ? Infinity : Math.max(0, daysRemaining),
      isActive: subscription.status === 'active' && (subscription.plan_tier === 'Free' || expiresAt > now),
      isExpired: subscription.plan_tier !== 'Free' && expiresAt <= now,
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
