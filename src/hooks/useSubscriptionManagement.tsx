import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

interface CancellationResult {
  success: boolean;
  effective_date?: string;
  immediate?: boolean;
  message?: string;
  error?: string;
}

interface SubscriptionManagement {
  auto_renewal: boolean;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  payment_type: 'one_time' | 'recurring';
  next_billing_date: string | null;
  billing_cycle: 'monthly' | 'yearly';
  subscription_source: 'manual' | 'stripe' | 'razorpay';
}

export const useSubscriptionManagement = () => {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const cancelSubscription = async (reason?: string, immediate = false): Promise<CancellationResult> => {
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('cancel_subscription', {
        p_user_id: user.id,
        p_reason: reason || 'User requested cancellation',
        p_immediate: immediate
      });

      if (error) throw error;

      const result = data as CancellationResult;
      
      if (result.success) {
        toast({
          title: "Subscription Cancelled",
          description: result.message || "Your subscription has been cancelled successfully.",
        });
      } else {
        toast({
          title: "Cancellation Failed",
          description: result.error || "Failed to cancel subscription.",
          variant: "destructive",
        });
      }

      return result;
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to cancel subscription';
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });

      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  const reactivateSubscription = async (): Promise<CancellationResult> => {
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('reactivate_subscription', {
        p_user_id: user.id
      });

      if (error) throw error;

      const result = data as CancellationResult;
      
      if (result.success) {
        toast({
          title: "Subscription Reactivated",
          description: result.message || "Your subscription has been reactivated successfully.",
        });
      } else {
        toast({
          title: "Reactivation Failed",
          description: result.error || "Failed to reactivate subscription.",
          variant: "destructive",
        });
      }

      return result;
    } catch (error) {
      console.error('Error reactivating subscription:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to reactivate subscription';
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });

      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  const updateAutoRenewal = async (autoRenewal: boolean): Promise<boolean> => {
    if (!user) {
      toast({
        title: "Error",
        description: "User not authenticated",
        variant: "destructive",
      });
      return false;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('user_subscriptions')
        .update({ 
          auto_renewal: autoRenewal,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id);

      if (error) throw error;

      toast({
        title: "Auto-Renewal Updated",
        description: `Auto-renewal has been ${autoRenewal ? 'enabled' : 'disabled'}.`,
      });

      return true;
    } catch (error) {
      console.error('Error updating auto-renewal:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to update auto-renewal';
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });

      return false;
    } finally {
      setLoading(false);
    }
  };

  const getSubscriptionManagement = async (): Promise<SubscriptionManagement | null> => {
    if (!user) return null;

    try {
      const { data, error } = await supabase
        .from('user_subscriptions')
        .select(`
          auto_renewal,
          cancelled_at,
          cancellation_reason,
          payment_type,
          next_billing_date,
          billing_cycle,
          subscription_source
        `)
        .eq('user_id', user.id)
        .single();

      if (error) throw error;

      return data as SubscriptionManagement;
    } catch (error) {
      console.error('Error fetching subscription management:', error);
      return null;
    }
  };

  const getCancellationHistory = async () => {
    if (!user) return [];

    try {
      const { data, error } = await supabase
        .from('subscription_cancellations')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error fetching cancellation history:', error);
      return [];
    }
  };

  const getRenewalHistory = async () => {
    if (!user) return [];

    try {
      const { data, error } = await supabase
        .from('subscription_renewals')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error fetching renewal history:', error);
      return [];
    }
  };

  return {
    loading,
    cancelSubscription,
    reactivateSubscription,
    updateAutoRenewal,
    getSubscriptionManagement,
    getCancellationHistory,
    getRenewalHistory,
  };
};
