import React from 'react';
import { Bell, X, Clock, AlertTriangle, CheckCircle, Info, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { formatDistanceToNow } from 'date-fns';

interface NotificationIconProps {
  type: string;
  className?: string;
}

const NotificationIcon: React.FC<NotificationIconProps> = ({ type, className = "h-4 w-4" }) => {
  switch (type) {
    case 'usage_warning':
      return <AlertTriangle className={`${className} text-yellow-500`} />;
    case 'expiration_warning':
      return <Clock className={`${className} text-orange-500`} />;
    case 'plan_expired':
      return <AlertTriangle className={`${className} text-red-500`} />;
    case 'plan_upgraded':
      return <TrendingUp className={`${className} text-green-500`} />;
    case 'usage_reset':
      return <CheckCircle className={`${className} text-blue-500`} />;
    default:
      return <Info className={`${className} text-gray-500`} />;
  }
};

const getNotificationColor = (type: string) => {
  switch (type) {
    case 'usage_warning':
      return 'bg-yellow-50 border-yellow-200 text-yellow-800';
    case 'expiration_warning':
      return 'bg-orange-50 border-orange-200 text-orange-800';
    case 'plan_expired':
      return 'bg-red-50 border-red-200 text-red-800';
    case 'plan_upgraded':
      return 'bg-green-50 border-green-200 text-green-800';
    case 'usage_reset':
      return 'bg-blue-50 border-blue-200 text-blue-800';
    default:
      return 'bg-gray-50 border-gray-200 text-gray-800';
  }
};

const getNotificationBadgeColor = (type: string) => {
  switch (type) {
    case 'usage_warning':
      return 'bg-yellow-100 text-yellow-800';
    case 'expiration_warning':
      return 'bg-orange-100 text-orange-800';
    case 'plan_expired':
      return 'bg-red-100 text-red-800';
    case 'plan_upgraded':
      return 'bg-green-100 text-green-800';
    case 'usage_reset':
      return 'bg-blue-100 text-blue-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

export const SubscriptionNotifications: React.FC = () => {
  const { 
    notifications, 
    markNotificationRead, 
    dismissNotification,
    subscriptionStatus 
  } = useRealtimeSubscription();

  const unreadCount = notifications.filter(n => !n.is_read).length;

  if (notifications.length === 0) {
    return (
      <Card className="bg-gray-900/50 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notifications
            {unreadCount > 0 && (
              <Badge className="bg-blue-600 text-white">
                {unreadCount}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-400">
            <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No notifications</p>
            <p className="text-sm">You're all caught up!</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gray-900/50 border-gray-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Notifications
          {unreadCount > 0 && (
            <Badge className="bg-blue-600 text-white">
              {unreadCount}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {notifications.map((notification) => (
          <div
            key={notification.id}
            className={`p-4 rounded-lg border ${getNotificationColor(notification.notification_type)} ${
              !notification.is_read ? 'ring-2 ring-blue-500/20' : ''
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 flex-1">
                <NotificationIcon type={notification.notification_type} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium text-sm">{notification.title}</h4>
                    <Badge 
                      variant="secondary" 
                      className={`text-xs ${getNotificationBadgeColor(notification.notification_type)}`}
                    >
                      {notification.notification_type.replace('_', ' ')}
                    </Badge>
                    {!notification.is_read && (
                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    )}
                  </div>
                  <p className="text-sm opacity-90 mb-2">{notification.message}</p>
                  <div className="flex items-center gap-4 text-xs opacity-75">
                    <span>
                      {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                    </span>
                    {notification.expires_at && (
                      <span>
                        Expires {formatDistanceToNow(new Date(notification.expires_at), { addSuffix: true })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-1">
                {notification.action_url && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    onClick={() => {
                      window.location.href = notification.action_url!;
                      if (!notification.is_read) {
                        markNotificationRead(notification.id);
                      }
                    }}
                  >
                    View
                  </Button>
                )}
                
                {!notification.is_read && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs"
                    onClick={() => markNotificationRead(notification.id)}
                  >
                    Mark Read
                  </Button>
                )}
                
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs p-1"
                  onClick={() => dismissNotification(notification.id)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        ))}
        
        {notifications.length > 5 && (
          <div className="text-center pt-4">
            <Button variant="outline" size="sm" className="text-gray-400">
              View All Notifications
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export const SubscriptionStatusCard: React.FC = () => {
  const { subscriptionStatus, loading } = useRealtimeSubscription();

  if (loading) {
    return (
      <Card className="bg-gray-900/50 border-gray-800">
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-700 rounded w-1/3"></div>
            <div className="h-8 bg-gray-700 rounded w-2/3"></div>
            <div className="h-4 bg-gray-700 rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!subscriptionStatus) {
    return (
      <Card className="bg-gray-900/50 border-gray-800">
        <CardContent className="p-6">
          <div className="text-center text-gray-400">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
            <p>Unable to load subscription status</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { usage, dates, plan_tier, is_active } = subscriptionStatus;
  const usagePercentage = (usage.current / usage.limit) * 100;
  const isNearLimit = usagePercentage >= 80;
  const isExpiringSoon = plan_tier !== 'Free' && dates.days_remaining <= 7;

  return (
    <Card className="bg-gray-900/50 border-gray-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center justify-between">
          <span>{plan_tier} Plan</span>
          <Badge 
            className={`${is_active ? 'bg-green-600' : 'bg-red-600'} text-white`}
          >
            {is_active ? 'Active' : 'Inactive'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Usage Progress */}
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-300">FAQ Usage</span>
            <span className={`${isNearLimit ? 'text-yellow-400' : 'text-gray-300'}`}>
              {usage.current}/{usage.limit}
            </span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div 
              className={`h-2 rounded-full transition-all duration-300 ${
                isNearLimit ? 'bg-yellow-500' : 'bg-blue-500'
              }`}
              style={{ width: `${Math.min(usagePercentage, 100)}%` }}
            ></div>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {usage.remaining} FAQs remaining this month
          </p>
        </div>

        {/* Expiration Info */}
        {plan_tier !== 'Free' && (
          <div className={`p-3 rounded-lg ${isExpiringSoon ? 'bg-orange-900/30 border border-orange-500/30' : 'bg-gray-800/50'}`}>
            <div className="flex items-center gap-2 text-sm">
              <Clock className={`h-4 w-4 ${isExpiringSoon ? 'text-orange-400' : 'text-gray-400'}`} />
              <span className={isExpiringSoon ? 'text-orange-300' : 'text-gray-300'}>
                {dates.days_remaining > 0 
                  ? `${dates.days_remaining} days remaining`
                  : 'Expired'
                }
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Expires on {new Date(dates.expires_at).toLocaleDateString()}
            </p>
          </div>
        )}

        {/* Warnings */}
        {isNearLimit && (
          <div className="p-3 bg-yellow-900/30 border border-yellow-500/30 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-yellow-300">
              <AlertTriangle className="h-4 w-4" />
              <span>Approaching usage limit</span>
            </div>
            <p className="text-xs text-yellow-400 mt-1">
              Consider upgrading your plan to avoid interruptions
            </p>
          </div>
        )}

        {isExpiringSoon && (
          <div className="p-3 bg-orange-900/30 border border-orange-500/30 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-orange-300">
              <Clock className="h-4 w-4" />
              <span>Subscription expiring soon</span>
            </div>
            <p className="text-xs text-orange-400 mt-1">
              Renew now to continue using premium features
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
