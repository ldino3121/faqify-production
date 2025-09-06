import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

interface SubscriptionManagementData {
  auto_renewal: boolean;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  payment_type: string;
  next_billing_date: string | null;
  billing_cycle: string;
  subscription_source: string;
  razorpay_subscription_id: string | null;
  razorpay_plan_id: string | null;
  plan_tier: string;
  status: string;
}

export const useSubscriptionManagement = () => {
  const [loading, setLoading] = useState(false);
  const [managementData, setManagementData] = useState<SubscriptionManagementData | null>(null);
  const [isAvailable, setIsAvailable] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  // Auto-fetch data when user changes
  useEffect(() => {
    if (user) {
      fetchManagementData();
    }
  }, [user]);

  // Fetch subscription management data
  const fetchManagementData = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);

      // First try to fetch with new columns
      const { data, error } = await supabase
        .from('user_subscriptions')
        .select(`
          auto_renewal,
          cancelled_at,
          cancellation_reason,
          payment_type,
          next_billing_date,
          billing_cycle,
          subscription_source,
          razorpay_subscription_id,
          razorpay_plan_id,
          plan_tier,
          status
        `)
        .eq('user_id', user.id)
        .single();

      if (error) {
        console.error('Error fetching subscription management data:', error);

        // If columns don't exist, try fallback query
        if (error.code === '42703' || error.message.includes('column') || error.message.includes('does not exist')) {
          console.log('New subscription columns not found, trying fallback...');

          // Try to get basic subscription data
          const { data: basicData, error: basicError } = await supabase
            .from('user_subscriptions')
            .select('plan_tier, status')
            .eq('user_id', user.id)
            .single();

          if (!basicError && basicData) {
            // Provide defaults based on plan tier
            setManagementData({
              auto_renewal: basicData.plan_tier === 'Free' ? false : true,
              cancelled_at: null,
              cancellation_reason: null,
              payment_type: basicData.plan_tier === 'Free' ? 'one_time' : 'recurring',
              next_billing_date: null,
              billing_cycle: 'monthly',
              subscription_source: 'manual',
              razorpay_subscription_id: null,
              razorpay_plan_id: null,
              plan_tier: basicData.plan_tier,
              status: basicData.status,
            });
            setIsAvailable(false); // Features not fully available
          }
        }
        return;
      }

      setManagementData(data);
      setIsAvailable(true); // Features fully available
    } catch (error) {
      console.error('Error in fetchManagementData:', error);
      // Provide fallback data for Free users
      setManagementData({
        auto_renewal: false,
        cancelled_at: null,
        cancellation_reason: null,
        payment_type: 'one_time',
        next_billing_date: null,
        billing_cycle: 'monthly',
        subscription_source: 'manual',
        razorpay_subscription_id: null,
        razorpay_plan_id: null,
        plan_tier: 'Free',
        status: 'active',
      });
      setIsAvailable(false);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Toggle auto-renewal
  const toggleAutoRenewal = useCallback(async (enabled: boolean) => {
    if (!user) return false;

    try {
      setLoading(true);
      const { error } = await supabase
        .from('user_subscriptions')
        .update({
          auto_renewal: enabled,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id);

      if (error) {
        // If column doesn't exist, show a different message
        if (error.code === '42703' || error.message.includes('column') || error.message.includes('auto_renewal')) {
          toast({
            title: "Feature Not Available",
            description: "Auto-renewal management is being set up. Please check back later.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Error",
            description: "Failed to update auto-renewal setting.",
            variant: "destructive",
          });
        }
        return false;
      }

      // Update local state
      setManagementData(prev => prev ? { ...prev, auto_renewal: enabled } : null);

      toast({
        title: "Success",
        description: `Auto-renewal ${enabled ? 'enabled' : 'disabled'} successfully.`,
      });

      return true;
    } catch (error) {
      console.error('Error toggling auto-renewal:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred.",
        variant: "destructive",
      });
      return false;
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  // Cancel subscription
  const cancelSubscription = useCallback(async (reason?: string, immediate = false) => {
    if (!user) return false;

    try {
      setLoading(true);
      
      // Call the database function
      const { data, error } = await supabase.rpc('cancel_subscription', {
        p_user_id: user.id,
        p_reason: reason || null,
        p_immediate: immediate
      });

      if (error) {
        toast({
          title: "Error",
          description: "Failed to cancel subscription.",
          variant: "destructive",
        });
        return false;
      }

      if (data?.success) {
        toast({
          title: "Subscription Cancelled",
          description: data.message,
        });

        // Refresh management data
        await fetchManagementData();
        return true;
      } else {
        toast({
          title: "Error",
          description: data?.error || "Failed to cancel subscription.",
          variant: "destructive",
        });
        return false;
      }
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred.",
        variant: "destructive",
      });
      return false;
    } finally {
      setLoading(false);
    }
  }, [user, toast, fetchManagementData]);

  // Reactivate subscription
  const reactivateSubscription = useCallback(async () => {
    if (!user) return false;

    try {
      setLoading(true);
      
      // Call the database function
      const { data, error } = await supabase.rpc('reactivate_subscription', {
        p_user_id: user.id
      });

      if (error) {
        toast({
          title: "Error",
          description: "Failed to reactivate subscription.",
          variant: "destructive",
        });
        return false;
      }

      if (data?.success) {
        toast({
          title: "Subscription Reactivated",
          description: data.message,
        });

        // Refresh management data
        await fetchManagementData();
        return true;
      } else {
        toast({
          title: "Error",
          description: data?.error || "Failed to reactivate subscription.",
          variant: "destructive",
        });
        return false;
      }
    } catch (error) {
      console.error('Error reactivating subscription:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred.",
        variant: "destructive",
      });
      return false;
    } finally {
      setLoading(false);
    }
  }, [user, toast, fetchManagementData]);

  return {
    managementData,
    loading,
    isAvailable,
    fetchManagementData,
    toggleAutoRenewal,
    cancelSubscription,
    reactivateSubscription,
  };
};
