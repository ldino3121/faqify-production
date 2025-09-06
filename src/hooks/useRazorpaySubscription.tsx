import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

// Add subscription-specific interfaces
interface SubscriptionResult {
  success: boolean;
  subscription_id?: string;
  short_url?: string;
  error?: string;
}

interface RazorpaySubscriptionOptions {
  key: string;
  subscription_id: string;
  name: string;
  description: string;
  handler: (response: any) => void;
  prefill: {
    name: string;
    email: string;
  };
  theme: {
    color: string;
  };
}

declare global {
  interface Window {
    Razorpay: any;
  }
}

interface SubscriptionData {
  id: string;
  plan_tier: string;
  status: string;
  faq_usage_current: number;
  faq_usage_limit: number;
  plan_expires_at: string | null;
  payment_gateway: string;
  currency: string;
  razorpay_payment_id?: string;
  razorpay_order_id?: string;
}

interface PaymentTransaction {
  id: string;
  payment_gateway: string;
  status: string;
  amount: number;
  currency: string;
  plan_tier: string;
  razorpay_payment_id?: string;
  razorpay_order_id?: string;
  completed_at?: string;
  failed_at?: string;
}

export const useRazorpaySubscription = () => {
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  // Fetch subscription data
  const fetchSubscription = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('user_subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      setSubscription(data);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching subscription:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Fetch payment transactions
  const fetchTransactions = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('payment_transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      setTransactions(data || []);
    } catch (err: any) {
      console.error('Error fetching transactions:', err);
    }
  };

  // Set up real-time subscription
  useEffect(() => {
    if (!user) return;

    fetchSubscription();
    fetchTransactions();

    // Subscribe to subscription changes
    const subscriptionChannel = supabase
      .channel('user_subscription_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_subscriptions',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('Subscription updated:', payload);
          
          if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
            setSubscription(payload.new as SubscriptionData);
            
            // Show toast notification for plan changes
            if (payload.eventType === 'UPDATE' && payload.old && payload.new) {
              const oldPlan = (payload.old as SubscriptionData).plan_tier;
              const newPlan = (payload.new as SubscriptionData).plan_tier;
              
              if (oldPlan !== newPlan) {
                toast({
                  title: "Plan Updated!",
                  description: `Your plan has been upgraded to ${newPlan}`,
                });
              }
            }
          }
        }
      )
      .subscribe();

    // Subscribe to transaction changes
    const transactionChannel = supabase
      .channel('payment_transaction_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payment_transactions',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('Transaction updated:', payload);
          
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const transaction = payload.new as PaymentTransaction;
            
            setTransactions(prev => {
              const filtered = prev.filter(t => t.id !== transaction.id);
              return [transaction, ...filtered].slice(0, 10);
            });

            // Show toast for payment status changes
            if (payload.eventType === 'UPDATE' && payload.old && payload.new) {
              const oldStatus = (payload.old as PaymentTransaction).status;
              const newStatus = (payload.new as PaymentTransaction).status;
              
              if (oldStatus !== newStatus) {
                if (newStatus === 'completed') {
                  toast({
                    title: "Payment Successful!",
                    description: "Your payment has been processed successfully.",
                  });
                } else if (newStatus === 'failed') {
                  toast({
                    title: "Payment Failed",
                    description: "Your payment could not be processed. Please try again.",
                    variant: "destructive",
                  });
                }
              }
            }
          }
        }
      )
      .subscribe();

    // Cleanup subscriptions
    return () => {
      subscriptionChannel.unsubscribe();
      transactionChannel.unsubscribe();
    };
  }, [user, toast]);

  // Helper functions
  const isSubscriptionActive = () => {
    if (!subscription) return false;
    
    if (subscription.plan_tier === 'Free') return true;
    
    if (subscription.status !== 'active') return false;
    
    if (subscription.plan_expires_at) {
      return new Date(subscription.plan_expires_at) > new Date();
    }
    
    return true;
  };

  const getRemainingFAQs = () => {
    if (!subscription) return 0;
    return Math.max(0, subscription.faq_usage_limit - subscription.faq_usage_current);
  };

  const getUsagePercentage = () => {
    if (!subscription || subscription.faq_usage_limit === 0) return 0;
    return Math.round((subscription.faq_usage_current / subscription.faq_usage_limit) * 100);
  };

  const getDaysUntilExpiry = () => {
    if (!subscription?.plan_expires_at) return null;
    
    const expiryDate = new Date(subscription.plan_expires_at);
    const today = new Date();
    const diffTime = expiryDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
  };

  const getLatestTransaction = () => {
    return transactions.length > 0 ? transactions[0] : null;
  };

  const getPendingTransactions = () => {
    return transactions.filter(t => t.status === 'pending');
  };

  const getCompletedTransactions = () => {
    return transactions.filter(t => t.status === 'completed');
  };

  // Refresh data manually
  const refresh = async () => {
    setLoading(true);
    await Promise.all([fetchSubscription(), fetchTransactions()]);
    setLoading(false);
  };

  return {
    // Data
    subscription,
    transactions,
    loading,
    error,
    
    // Status helpers
    isSubscriptionActive: isSubscriptionActive(),
    remainingFAQs: getRemainingFAQs(),
    usagePercentage: getUsagePercentage(),
    daysUntilExpiry: getDaysUntilExpiry(),
    
    // Transaction helpers
    latestTransaction: getLatestTransaction(),
    pendingTransactions: getPendingTransactions(),
    completedTransactions: getCompletedTransactions(),
    
    // Actions
    refresh,

    // Subscription methods
    createSubscription: async (planId: 'Pro' | 'Business'): Promise<SubscriptionResult> => {
      if (!user) {
        return { success: false, error: 'User not authenticated' };
      }

      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke('create-razorpay-subscription', {
          body: {
            planId,
            userEmail: user.email || '',
            userName: user.user_metadata?.full_name || user.email || 'User'
          }
        });

        if (error) throw error;

        if (!data.success) {
          throw new Error(data.error || 'Failed to create subscription');
        }

        toast({
          title: "Subscription Created",
          description: `${planId} plan subscription created successfully!`,
        });

        return {
          success: true,
          subscription_id: data.subscription_id,
          short_url: data.short_url
        };

      } catch (error) {
        console.error('Error creating subscription:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to create subscription';

        toast({
          title: "Subscription Failed",
          description: errorMessage,
          variant: "destructive",
        });

        return { success: false, error: errorMessage };
      } finally {
        setLoading(false);
      }
    },

    openRazorpaySubscriptionCheckout: (subscriptionId: string, planId: 'Pro' | 'Business') => {
      if (!window.Razorpay) {
        toast({
          title: "Error",
          description: "Razorpay SDK not loaded. Please refresh the page.",
          variant: "destructive",
        });
        return;
      }

      const options: RazorpaySubscriptionOptions = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_your_key_id',
        subscription_id: subscriptionId,
        name: 'FAQify',
        description: `${planId} Plan Subscription`,
        handler: async (response: any) => {
          console.log('Razorpay subscription response:', response);

          toast({
            title: "Subscription Activated!",
            description: `Your ${planId} plan is now active. Redirecting to dashboard...`,
          });

          setTimeout(() => {
            window.location.reload();
          }, 2000);
        },
        prefill: {
          name: user?.user_metadata?.full_name || user?.email || 'User',
          email: user?.email || ''
        },
        theme: {
          color: '#3b82f6'
        }
      };

      const rzp = new window.Razorpay(options);

      rzp.on('payment.failed', (response: any) => {
        console.error('Razorpay payment failed:', response);
        toast({
          title: "Payment Failed",
          description: response.error?.description || "Payment failed. Please try again.",
          variant: "destructive",
        });
      });

      rzp.open();
    },

    createAndOpenSubscription: async (planId: 'Pro' | 'Business') => {
      const createSubscription = async (): Promise<SubscriptionResult> => {
        if (!user) {
          return { success: false, error: 'User not authenticated' };
        }

        setLoading(true);
        try {
          const { data, error } = await supabase.functions.invoke('create-razorpay-subscription', {
            body: {
              planId,
              userEmail: user.email || '',
              userName: user.user_metadata?.full_name || user.email || 'User'
            }
          });

          if (error) throw error;
          if (!data.success) throw new Error(data.error || 'Failed to create subscription');

          return {
            success: true,
            subscription_id: data.subscription_id,
            short_url: data.short_url
          };

        } catch (error) {
          console.error('Error creating subscription:', error);
          return { success: false, error: error instanceof Error ? error.message : 'Failed to create subscription' };
        } finally {
          setLoading(false);
        }
      };

      const result = await createSubscription();

      if (result.success && result.subscription_id) {
        setTimeout(() => {
          // Use the openRazorpaySubscriptionCheckout method defined above
          if (!window.Razorpay) {
            toast({
              title: "Error",
              description: "Razorpay SDK not loaded. Please refresh the page.",
              variant: "destructive",
            });
            return;
          }

          const options: RazorpaySubscriptionOptions = {
            key: import.meta.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_your_key_id',
            subscription_id: result.subscription_id!,
            name: 'FAQify',
            description: `${planId} Plan Subscription`,
            handler: async (response: any) => {
              console.log('Razorpay subscription response:', response);

              toast({
                title: "Subscription Activated!",
                description: `Your ${planId} plan is now active. Redirecting to dashboard...`,
              });

              setTimeout(() => {
                window.location.reload();
              }, 2000);
            },
            prefill: {
              name: user?.user_metadata?.full_name || user?.email || 'User',
              email: user?.email || ''
            },
            theme: {
              color: '#3b82f6'
            }
          };

          const rzp = new window.Razorpay(options);
          rzp.open();
        }, 1000);
      }

      return result;
    },
  };
};
