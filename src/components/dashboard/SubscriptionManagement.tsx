import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Calendar, CreditCard, RefreshCw, X, Play, Pause } from 'lucide-react';
import { useSubscription } from '@/hooks/useSubscription';
import { useRazorpaySubscription } from '@/hooks/useRazorpaySubscription';
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

interface SubscriptionManagementProps {
  onNavigateToUpgrade?: () => void;
}

export const SubscriptionManagement: React.FC<SubscriptionManagementProps> = ({ onNavigateToUpgrade }) => {
  const { subscription, loading: subscriptionLoading } = useSubscription();
  const [hasError, setHasError] = useState(false);
  const [subscriptionDetails, setSubscriptionDetails] = useState<any>(null);

  // Initialize Razorpay subscription management
  const {
    loading: razorpayLoading,
    pauseSubscription,
    resumeSubscription,
    cancelSubscription: cancelRazorpaySubscription,
    getSubscriptionDetails,
  } = useRazorpaySubscription();

  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');
  const [immediateCancel, setImmediateCancel] = useState(false);

  // Load subscription details on mount
  useEffect(() => {
    if (subscription && subscription.subscription_source === 'razorpay') {
      loadSubscriptionDetails();
    }
  }, [subscription]);

  const loadSubscriptionDetails = async () => {
    try {
      const details = await getSubscriptionDetails();
      if (details.success) {
        setSubscriptionDetails(details.subscription);
      }
    } catch (error) {
      console.error('Error loading subscription details:', error);
    }
  };

  const handlePauseSubscription = async () => {
    const result = await pauseSubscription(false);
    if (result.success) {
      await loadSubscriptionDetails();
    }
  };

  const handleResumeSubscription = async () => {
    const result = await resumeSubscription();
    if (result.success) {
      await loadSubscriptionDetails();
    }
  };

  const handleCancelSubscription = async () => {
    const result = await cancelRazorpaySubscription(cancellationReason, immediateCancel);
    if (result.success) {
      setShowCancelDialog(false);
      setCancellationReason('');
      setImmediateCancel(false);
      await loadSubscriptionDetails();
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

  // Show basic info for Free plan
  if (subscription.plan_tier === 'Free') {
    return (
      <Card className="bg-gray-900/50 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Subscription Management
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center py-6">
            <Badge className="bg-green-600/20 text-green-400 border-green-600/30 mb-4">
              Free Plan
            </Badge>
            <p className="text-gray-400 mb-4">
              You're currently on the Free plan with {subscription.faq_usage_limit} FAQs per month.
            </p>
            <Button
              onClick={() => onNavigateToUpgrade?.()}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Upgrade to Pro
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show fallback UI if not a Razorpay subscription
  if (subscription.subscription_source !== 'razorpay') {
    return (
      <Card className="bg-gray-900/50 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Subscription Management
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="bg-blue-900/20 border-blue-800">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-blue-200">
              Subscription management features are being set up. Please check back later or contact support if you need immediate assistance.
            </AlertDescription>
          </Alert>

          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-white font-medium">Current Plan</h3>
              <p className="text-gray-400 text-sm">{subscription?.plan_tier || 'Free'} Plan</p>
            </div>
            <Badge className="bg-green-600 text-white">
              Active
            </Badge>
          </div>

          <div className="text-sm text-gray-400">
            <p>• Plan management features will be available soon</p>
            <p>• Your current subscription remains active</p>
            <p>• Contact support for immediate assistance</p>
          </div>
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

  const getSubscriptionStatusBadge = () => {
    if (!subscriptionDetails) {
      return <Badge className="bg-gray-600 text-white">Loading...</Badge>;
    }

    switch (subscriptionDetails.status) {
      case 'active':
        return <Badge className="bg-green-600 text-white">Active</Badge>;
      case 'paused':
        return <Badge className="bg-yellow-600 text-white">Paused</Badge>;
      case 'cancelled':
        return <Badge className="bg-red-600 text-white">Cancelled</Badge>;
      case 'completed':
        return <Badge className="bg-blue-600 text-white">Completed</Badge>;
      default:
        return <Badge className="bg-gray-600 text-white">{subscriptionDetails.status}</Badge>;
    }
  };

  // Main Razorpay subscription management UI
  return (
    <div className="space-y-6">
      {/* Subscription Status Card */}
      <Card className="bg-gray-900/50 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Razorpay Subscription Management
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current Plan Status */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-white font-medium">Current Plan</h3>
              <p className="text-gray-400 text-sm">{subscription.plan_tier} Plan</p>
            </div>
            {getSubscriptionStatusBadge()}
          </div>

          {/* Subscription Details */}
          {subscriptionDetails && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-700">
              <div>
                <Label className="text-gray-400 text-sm">Plan ID</Label>
                <p className="text-white">{subscriptionDetails.plan_id}</p>
              </div>
              <div>
                <Label className="text-gray-400 text-sm">Status</Label>
                <p className="text-white capitalize">{subscriptionDetails.status}</p>
              </div>
              <div>
                <Label className="text-gray-400 text-sm">Current Period</Label>
                <p className="text-white">
                  {formatDate(new Date(subscriptionDetails.current_start * 1000).toISOString())} - {formatDate(new Date(subscriptionDetails.current_end * 1000).toISOString())}
                </p>
              </div>
              <div>
                <Label className="text-gray-400 text-sm">Next Billing</Label>
                <p className="text-white">
                  {subscriptionDetails.status === 'active'
                    ? formatDate(new Date(subscriptionDetails.current_end * 1000).toISOString())
                    : 'N/A'
                  }
                </p>
              </div>
            </div>
          )}

          {/* Subscription Controls */}
          {subscriptionDetails && (
            <div className="pt-4 border-t border-gray-700">
              <h4 className="text-white font-medium mb-4">Subscription Controls</h4>
              <div className="flex flex-wrap gap-3">
                {subscriptionDetails.status === 'active' && (
                  <>
                    <Button
                      onClick={handlePauseSubscription}
                      disabled={razorpayLoading}
                      variant="outline"
                      className="border-yellow-600 text-yellow-400 hover:bg-yellow-600/10"
                    >
                      <Pause className="h-4 w-4 mr-2" />
                      Pause Subscription
                    </Button>
                    <Button
                      onClick={() => setShowCancelDialog(true)}
                      disabled={razorpayLoading}
                      variant="outline"
                      className="border-red-600 text-red-400 hover:bg-red-600/10"
                    >
                      <X className="h-4 w-4 mr-2" />
                      Cancel Subscription
                    </Button>
                  </>
                )}

                {subscriptionDetails.status === 'paused' && (
                  <Button
                    onClick={handleResumeSubscription}
                    disabled={razorpayLoading}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Resume Subscription
                  </Button>
                )}

                <Button
                  onClick={loadSubscriptionDetails}
                  disabled={razorpayLoading}
                  variant="outline"
                  className="border-gray-600 text-gray-400 hover:bg-gray-600/10"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh Details
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cancellation Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent className="bg-gray-900 border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-white">Cancel Subscription</DialogTitle>
            <DialogDescription className="text-gray-400">
              Are you sure you want to cancel your subscription? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-white">Reason for cancellation (optional)</Label>
              <Textarea
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                placeholder="Help us improve by telling us why you're cancelling..."
                className="bg-gray-800 border-gray-700 text-white mt-2"
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="immediate-cancel"
                checked={immediateCancel}
                onCheckedChange={setImmediateCancel}
              />
              <Label htmlFor="immediate-cancel" className="text-white">
                Cancel immediately (otherwise cancels at end of billing period)
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCancelDialog(false)}
              className="border-gray-600 text-gray-400"
            >
              Keep Subscription
            </Button>
            <Button
              onClick={handleCancelSubscription}
              disabled={razorpayLoading}
              className="bg-red-600 hover:bg-red-700"
            >
              {razorpayLoading ? 'Cancelling...' : 'Cancel Subscription'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

};
