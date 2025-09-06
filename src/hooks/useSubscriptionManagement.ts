import { useState, useCallback } from 'react';
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
}

export const useSubscriptionManagement = () => {
  const [loading, setLoading] = useState(false);
  const [managementData, setManagementData] = useState<SubscriptionManagementData | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  // Fetch subscription management data
  const fetchManagementData = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
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
          razorpay_plan_id
        `)
        .eq('user_id', user.id)
        .single();

      if (error) {
        console.error('Error fetching subscription management data:', error);
        return;
      }

      setManagementData(data);
    } catch (error) {
      console.error('Error in fetchManagementData:', error);
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
        toast({
          title: "Error",
          description: "Failed to update auto-renewal setting.",
          variant: "destructive",
        });
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
    fetchManagementData,
    toggleAutoRenewal,
    cancelSubscription,
    reactivateSubscription,
  };
};
