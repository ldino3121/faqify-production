import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Calendar, CreditCard, RefreshCw, X } from 'lucide-react';
import { useSubscription } from '@/hooks/useSubscription';
import { useSubscriptionManagement } from '@/hooks/useSubscriptionManagement';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

export const SubscriptionManagement: React.FC = () => {
  const { subscription, loading: subscriptionLoading } = useSubscription();

  // Safely initialize subscription management hook
  let managementHook;
  try {
    managementHook = useSubscriptionManagement();
  } catch (error) {
    console.error('Error initializing subscription management:', error);
    managementHook = {
      loading: false,
      cancelSubscription: async () => ({ success: false, error: 'Feature not available' }),
      reactivateSubscription: async () => ({ success: false, error: 'Feature not available' }),
      updateAutoRenewal: async () => false,
      getSubscriptionManagement: async () => null
    };
  }

  const {
    loading: managementLoading,
    cancelSubscription,
    reactivateSubscription,
    updateAutoRenewal,
    getSubscriptionManagement
  } = managementHook;

  const [managementData, setManagementData] = useState<any>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');
  const [immediateCancel, setImmediateCancel] = useState(false);

  useEffect(() => {
    if (subscription) {
      loadManagementData();
    }
  }, [subscription]);

  const loadManagementData = async () => {
    const data = await getSubscriptionManagement();
    setManagementData(data);
  };

  const handleCancelSubscription = async () => {
    const result = await cancelSubscription(cancellationReason, immediateCancel);
    if (result.success) {
      setShowCancelDialog(false);
      setCancellationReason('');
      setImmediateCancel(false);
      loadManagementData();
    }
  };

  const handleReactivateSubscription = async () => {
    const result = await reactivateSubscription();
    if (result.success) {
      loadManagementData();
    }
  };

  const handleAutoRenewalToggle = async (enabled: boolean) => {
    const success = await updateAutoRenewal(enabled);
    if (success) {
      loadManagementData();
    }
  };

  if (subscriptionLoading || !subscription) {
    return (
      <Card className="bg-gray-900/50 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white">Subscription Management</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-gray-400">Loading subscription details...</div>
        </CardContent>
      </Card>
    );
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getPaymentStatusBadge = () => {
    if (subscription.plan_tier === 'Free') {
      return <Badge variant="secondary">Free Plan</Badge>;
    }

    if (subscription.is_cancelled) {
      return <Badge variant="destructive">Cancelled</Badge>;
    }

    if (subscription.payment_type === 'recurring' && subscription.auto_renewal) {
      return <Badge className="bg-green-600">Auto-Renewal Active</Badge>;
    }

    return <Badge variant="outline">One-Time Payment</Badge>;
  };

  const showCancellationMessage = subscription.is_cancelled && subscription.continues_until;

  return (
    <div className="space-y-6">
      {/* Subscription Status Card */}
      <Card className="bg-gray-900/50 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Subscription Management
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current Plan Status */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-white font-medium">Current Plan</h3>
              <p className="text-gray-400 text-sm">{subscription.plan_tier} Plan</p>
            </div>
            {getPaymentStatusBadge()}
          </div>

          {/* Payment Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-300">Payment Type</Label>
              <p className="text-white capitalize">{subscription.payment_type.replace('_', ' ')}</p>
            </div>
            <div>
              <Label className="text-gray-300">Billing Cycle</Label>
              <p className="text-white capitalize">{subscription.billing_cycle}</p>
            </div>
            <div>
              <Label className="text-gray-300">Plan Activated</Label>
              <p className="text-white">{formatDate(subscription.plan_activated_at)}</p>
            </div>
            <div>
              <Label className="text-gray-300">
                {subscription.plan_tier === 'Free' ? 'Plan Status' : 'Expires On'}
              </Label>
              <p className="text-white">
                {subscription.plan_tier === 'Free' ? 'Active' : formatDate(subscription.plan_expires_at)}
              </p>
            </div>
          </div>

          {/* Next Billing Date */}
          {subscription.next_billing_date && subscription.auto_renewal && !subscription.is_cancelled && (
            <div className="flex items-center gap-2 p-3 bg-blue-600/20 border border-blue-500/30 rounded-lg">
              <Calendar className="h-4 w-4 text-blue-400" />
              <div>
                <p className="text-blue-300 text-sm font-medium">Next Billing Date</p>
                <p className="text-white">{formatDate(subscription.next_billing_date)}</p>
              </div>
            </div>
          )}

          {/* Cancellation Message */}
          {showCancellationMessage && (
            <Alert className="border-orange-500/30 bg-orange-600/20">
              <AlertTriangle className="h-4 w-4 text-orange-400" />
              <AlertDescription className="text-orange-300">
                Your subscription has been cancelled and will continue until{' '}
                <strong>{formatDate(subscription.continues_until)}</strong>.
                You can reactivate it anytime before this date.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Auto-Renewal Settings */}
      {subscription.plan_tier !== 'Free' && (
        <Card className="bg-gray-900/50 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Auto-Renewal Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-white">Auto-Renewal</Label>
                <p className="text-gray-400 text-sm">
                  Automatically renew your subscription when it expires
                </p>
              </div>
              <Switch
                checked={subscription.auto_renewal && !subscription.is_cancelled}
                onCheckedChange={handleAutoRenewalToggle}
                disabled={managementLoading || subscription.is_cancelled}
              />
            </div>

            {!subscription.auto_renewal && !subscription.is_cancelled && (
              <Alert className="border-yellow-500/30 bg-yellow-600/20">
                <AlertTriangle className="h-4 w-4 text-yellow-400" />
                <AlertDescription className="text-yellow-300">
                  Auto-renewal is disabled. Your subscription will expire on{' '}
                  {formatDate(subscription.plan_expires_at)} and you'll be downgraded to the Free plan.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Subscription Actions */}
      {subscription.plan_tier !== 'Free' && (
        <Card className="bg-gray-900/50 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Subscription Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {subscription.is_cancelled ? (
              <Button
                onClick={handleReactivateSubscription}
                disabled={managementLoading}
                className="w-full bg-green-600 hover:bg-green-700"
              >
                {managementLoading ? 'Processing...' : 'Reactivate Subscription'}
              </Button>
            ) : (
              <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
                <DialogTrigger asChild>
                  <Button
                    variant="destructive"
                    className="w-full"
                    disabled={managementLoading}
                  >
                    Cancel Subscription
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-gray-900 border-gray-800">
                  <DialogHeader>
                    <DialogTitle className="text-white">Cancel Subscription</DialogTitle>
                    <DialogDescription className="text-gray-400">
                      We're sorry to see you go. Please let us know why you're cancelling.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label className="text-gray-300">Reason for cancellation (optional)</Label>
                      <Textarea
                        value={cancellationReason}
                        onChange={(e) => setCancellationReason(e.target.value)}
                        placeholder="Help us improve by sharing your feedback..."
                        className="bg-gray-800 border-gray-700 text-white"
                      />
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="immediate-cancel"
                        checked={immediateCancel}
                        onCheckedChange={setImmediateCancel}
                      />
                      <Label htmlFor="immediate-cancel" className="text-gray-300">
                        Cancel immediately (otherwise continues until {formatDate(subscription.plan_expires_at)})
                      </Label>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setShowCancelDialog(false)}
                      className="border-gray-600 text-gray-300"
                    >
                      Keep Subscription
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={handleCancelSubscription}
                      disabled={managementLoading}
                    >
                      {managementLoading ? 'Processing...' : 'Cancel Subscription'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
