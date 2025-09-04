import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from '@/hooks/use-toast';

interface SubscriptionStatus {
  subscription_id: string;
  user_id: string;
  plan_tier: 'Free' | 'Pro' | 'Business';
  plan_name: string;
  status: string;
  is_active: boolean;
  usage: {
    current: number;
    limit: number;
    remaining: number;
    percentage: number;
  };
  dates: {
    activated_at: string;
    expires_at: string;
    last_reset: string;
    changed_at: string;
    days_remaining: number;
  };
  plan_details: {
    price_monthly: number;
    price_yearly: number;
    features: string[];
    is_annual: boolean;
  };
  activity: {
    recent_actions: number;
    last_activity: string | null;
  };
  notifications: {
    unread_count: number;
  };
  previous_plan: string | null;
  auto_renewal: boolean;
  cancellation_date: string | null;
  grace_period_end: string | null;
}

interface Notification {
  id: string;
  notification_type: string;
  title: string;
  message: string;
  is_read: boolean;
  is_dismissed: boolean;
  action_url: string | null;
  expires_at: string | null;
  created_at: string;
}

interface UsageLog {
  id: string;
  action_type: string;
  faq_count: number;
  usage_before: number;
  usage_after: number;
  limit_at_time: number;
  plan_tier_at_time: string;
  created_at: string;
  collection_id: string | null;
}

export const useRealtimeSubscription = () => {
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [usageLogs, setUsageLogs] = useState<UsageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  // Fetch comprehensive subscription status
  const fetchSubscriptionStatus = useCallback(async () => {
    if (!user) {
      setSubscriptionStatus(null);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.rpc('get_subscription_status', {
        user_uuid: user.id
      });

      if (error) {
        console.error('Error fetching subscription status:', error);
        setError(error.message);
        return;
      }

      if (data?.error) {
        setError(data.error);
        return;
      }

      setSubscriptionStatus(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching subscription status:', err);
      setError('Failed to fetch subscription status');
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('subscription_notifications')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_dismissed', false)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        console.error('Error fetching notifications:', error);
        return;
      }

      setNotifications(data || []);
    } catch (err) {
      console.error('Error fetching notifications:', err);
    }
  }, [user]);

  // Fetch recent usage logs
  const fetchUsageLogs = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('subscription_usage_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        console.error('Error fetching usage logs:', error);
        return;
      }

      setUsageLogs(data || []);
    } catch (err) {
      console.error('Error fetching usage logs:', err);
    }
  }, [user]);

  // Enhanced FAQ generation with real-time updates
  const generateFAQs = useCallback(async (faqCount: number, collectionId?: string) => {
    if (!user) return { success: false, reason: 'User not authenticated' };

    try {
      const { data, error } = await supabase.rpc('increment_faq_usage_with_logging', {
        user_uuid: user.id,
        faq_count: faqCount,
        collection_uuid: collectionId
      });

      if (error) {
        console.error('Error generating FAQs:', error);
        return { success: false, reason: error.message };
      }

      if (!data.success) {
        return data;
      }

      // Update local state immediately for better UX
      setSubscriptionStatus(prev => prev ? {
        ...prev,
        usage: {
          ...prev.usage,
          current: prev.usage.current + faqCount,
          remaining: prev.usage.remaining - faqCount,
          percentage: ((prev.usage.current + faqCount) / prev.usage.limit) * 100
        }
      } : null);

      // Show success toast
      toast({
        title: "FAQs Generated Successfully!",
        description: `Generated ${faqCount} FAQs. ${data.usage?.remaining || 0} remaining this month.`,
      });

      return data;
    } catch (err) {
      console.error('Error generating FAQs:', err);
      return { success: false, reason: 'Error generating FAQs' };
    }
  }, [user]);

  // Change subscription plan
  const changePlan = useCallback(async (newPlanTier: 'Free' | 'Pro' | 'Business', isUpgrade: boolean = true, reason?: string) => {
    if (!user) return { success: false, reason: 'User not authenticated' };

    try {
      const { data, error } = await supabase.rpc('change_subscription_plan_with_tracking', {
        user_uuid: user.id,
        new_plan_tier: newPlanTier,
        is_upgrade: isUpgrade,
        change_reason: reason
      });

      if (error) {
        console.error('Error changing plan:', error);
        return { success: false, reason: error.message };
      }

      // Show success toast
      toast({
        title: "Plan Changed Successfully!",
        description: `Your plan has been changed to ${newPlanTier}.`,
      });

      return data;
    } catch (err) {
      console.error('Error changing plan:', err);
      return { success: false, reason: 'Error changing plan' };
    }
  }, [user]);

  // Mark notification as read
  const markNotificationRead = useCallback(async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('subscription_notifications')
        .update({ 
          is_read: true, 
          read_at: new Date().toISOString() 
        })
        .eq('id', notificationId);

      if (error) {
        console.error('Error marking notification as read:', error);
        return;
      }

      // Update local state
      setNotifications(prev => 
        prev.map(notif => 
          notif.id === notificationId 
            ? { ...notif, is_read: true }
            : notif
        )
      );
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  }, []);

  // Dismiss notification
  const dismissNotification = useCallback(async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('subscription_notifications')
        .update({ 
          is_dismissed: true, 
          dismissed_at: new Date().toISOString() 
        })
        .eq('id', notificationId);

      if (error) {
        console.error('Error dismissing notification:', error);
        return;
      }

      // Update local state
      setNotifications(prev => 
        prev.filter(notif => notif.id !== notificationId)
      );
    } catch (err) {
      console.error('Error dismissing notification:', err);
    }
  }, []);

  // Set up real-time subscriptions
  useEffect(() => {
    if (!user) {
      setSubscriptionStatus(null);
      setNotifications([]);
      setUsageLogs([]);
      setLoading(false);
      return;
    }

    // Initial data fetch
    fetchSubscriptionStatus();
    fetchNotifications();
    fetchUsageLogs();

    // Set up real-time subscription for user_subscriptions changes
    const subscriptionChannel = supabase
      .channel('subscription-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'user_subscriptions',
        filter: `user_id=eq.${user.id}`,
      }, () => {
        console.log('Subscription changed, refetching...');
        fetchSubscriptionStatus();
      })
      .subscribe();

    // Set up real-time subscription for notifications
    const notificationsChannel = supabase
      .channel('notifications-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'subscription_notifications',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        console.log('Notification change:', payload);
        fetchNotifications();
        
        // Show toast for new notifications
        if (payload.eventType === 'INSERT' && payload.new) {
          const notification = payload.new as Notification;
          toast({
            title: notification.title,
            description: notification.message,
            action: notification.action_url ? {
              label: "View",
              onClick: () => window.location.href = notification.action_url!
            } : undefined
          });
        }
      })
      .subscribe();

    // Set up real-time subscription for usage logs
    const usageLogsChannel = supabase
      .channel('usage-logs-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'subscription_usage_logs',
        filter: `user_id=eq.${user.id}`,
      }, () => {
        console.log('Usage log added, refetching...');
        fetchUsageLogs();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscriptionChannel);
      supabase.removeChannel(notificationsChannel);
      supabase.removeChannel(usageLogsChannel);
    };
  }, [user, fetchSubscriptionStatus, fetchNotifications, fetchUsageLogs]);

  return {
    subscriptionStatus,
    notifications,
    usageLogs,
    loading,
    error,
    generateFAQs,
    changePlan,
    markNotificationRead,
    dismissNotification,
    refetch: fetchSubscriptionStatus,
  };
};
