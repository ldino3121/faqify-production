
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Sparkles,
  Users,
  TrendingUp,
  Clock,
  Globe,
  BarChart3,
  Zap,
  Calendar,
  User,
  Mail,
  CalendarDays
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { supabase } from "@/integrations/supabase/client";

interface DashboardStats {
  totalCollections: number;
  totalFAQs: number;
  recentActivity: Array<{
    id: string;
    title: string;
    created_at: string;
    faq_count: number;
  }>;
}

export const DashboardOverviewData = () => {
  const { user } = useAuth();
  const { subscription, loading: subscriptionLoading } = useSubscription();
  const [stats, setStats] = useState<DashboardStats>({
    totalCollections: 0,
    totalFAQs: 0,
    recentActivity: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardStats();
  }, [user]);

  const fetchDashboardStats = async () => {
    if (!user) return;

    try {
      // Fetch collections count and recent activity
      const { data: collections, error: collectionsError } = await supabase
        .from('faq_collections')
        .select(`
          id,
          title,
          created_at,
          faqs(count)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (collectionsError) throw collectionsError;

      // Fetch total FAQs count
      const { count: totalFAQs, error: faqsError } = await supabase
        .from('faqs')
        .select('*', { count: 'exact', head: true })
        .in('collection_id', collections?.map(c => c.id) || []);

      if (faqsError) throw faqsError;

      // Process recent activity
      const recentActivity = collections?.slice(0, 5).map(collection => ({
        id: collection.id,
        title: collection.title,
        created_at: collection.created_at,
        faq_count: Array.isArray(collection.faqs) ? collection.faqs.length : 0
      })) || [];

      setStats({
        totalCollections: collections?.length || 0,
        totalFAQs: totalFAQs || 0,
        recentActivity
      });
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const usagePercentage = subscription 
    ? Math.round((subscription.faq_usage_current / subscription.faq_usage_limit) * 100)
    : 0;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatFullDate = (dateString: string) => {
    if (!dateString) return 'Not available';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (error) {
      console.error('Error formatting date:', dateString, error);
      return 'Invalid date';
    }
  };

  // Debug subscription data
  useEffect(() => {
    if (subscription) {
      console.log('🔍 Subscription data in DashboardOverviewData:', {
        plan_tier: subscription.plan_tier,
        plan_activated_at: subscription.plan_activated_at,
        plan_expires_at: subscription.plan_expires_at,
        created_at: subscription.created_at,
        updated_at: subscription.updated_at
      });
    }
  }, [subscription]);

  if (loading || subscriptionLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="bg-gray-900/50 border-gray-800">
            <CardContent className="p-6">
              <div className="animate-pulse">
                <div className="h-4 bg-gray-700 rounded w-1/2 mb-2"></div>
                <div className="h-8 bg-gray-700 rounded w-3/4"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Dashboard Overview</h1>
        <p className="text-gray-400">Monitor your FAQ generation and usage statistics</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="bg-gray-900/50 border-gray-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-400">Total Collections</p>
                <p className="text-2xl font-bold text-white">{stats.totalCollections}</p>
              </div>
              <div className="h-12 w-12 bg-blue-600/10 rounded-lg flex items-center justify-center">
                <FileText className="h-6 w-6 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900/50 border-gray-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-400">Total FAQs</p>
                <p className="text-2xl font-bold text-white">{stats.totalFAQs}</p>
              </div>
              <div className="h-12 w-12 bg-green-600/10 rounded-lg flex items-center justify-center">
                <Sparkles className="h-6 w-6 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>



        <Card className="bg-gray-900/50 border-gray-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-400">Plan Status</p>
                <div className="flex items-center space-x-2">
                  <Badge className="bg-blue-600/20 text-blue-400 border-blue-600/30">
                    {subscription?.plan_tier || 'Free'}
                  </Badge>
                  <Badge className={`${
                    subscription?.status === 'active' ? 'bg-green-600/20 text-green-400 border-green-600/30' :
                    subscription?.status === 'expired' ? 'bg-red-600/20 text-red-400 border-red-600/30' :
                    subscription?.status === 'cancelled' ? 'bg-yellow-600/20 text-yellow-400 border-yellow-600/30' :
                    'bg-gray-600/20 text-gray-400 border-gray-600/30'
                  }`}>
                    {subscription?.status || 'active'}
                  </Badge>
                </div>
              </div>
              <div className="h-12 w-12 bg-yellow-600/10 rounded-lg flex items-center justify-center">
                <Zap className="h-6 w-6 text-yellow-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* User Profile Section */}
      <Card className="bg-gray-900/50 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center space-x-2">
            <User className="h-5 w-5 text-blue-500" />
            <span>Profile Information</span>
          </CardTitle>
          <CardDescription className="text-gray-400">
            Your account details and subscription information
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Name */}
            <div className="flex items-center space-x-3">
              <div className="h-10 w-10 bg-blue-600/10 rounded-lg flex items-center justify-center">
                <User className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Name</p>
                <p className="text-white font-medium">
                  {user?.user_metadata?.full_name || user?.user_metadata?.name || 'Not provided'}
                </p>
              </div>
            </div>

            {/* Email */}
            <div className="flex items-center space-x-3">
              <div className="h-10 w-10 bg-green-600/10 rounded-lg flex items-center justify-center">
                <Mail className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Email</p>
                <p className="text-white font-medium">{user?.email}</p>
              </div>
            </div>

            {/* Plan Activation Date */}
            <div className="flex items-center space-x-3">
              <div className="h-10 w-10 bg-purple-600/10 rounded-lg flex items-center justify-center">
                <CalendarDays className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Plan Activated</p>
                <p className="text-white font-medium">
                  {subscription?.plan_activated_at
                    ? formatFullDate(subscription.plan_activated_at)
                    : subscription?.created_at
                      ? formatFullDate(subscription.created_at)
                      : 'Not available'
                  }
                </p>
              </div>
            </div>

            {/* Plan End Date */}
            <div className="flex items-center space-x-3">
              <div className="h-10 w-10 bg-orange-600/10 rounded-lg flex items-center justify-center">
                <Calendar className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Plan Expires</p>
                <p className={`font-medium ${
                  subscription?.is_expired ? 'text-red-400' :
                  subscription?.expires_soon ? 'text-yellow-400' : 'text-white'
                }`}>
                  {subscription?.plan_expires_at
                    ? formatFullDate(subscription.plan_expires_at)
                    : subscription?.current_period_end
                      ? formatFullDate(subscription.current_period_end)
                      : 'Not available'
                  }
                  {subscription?.is_expired && ' (Expired)'}
                  {subscription?.expires_soon && !subscription?.is_expired && ' (Expires Soon)'}
                </p>
              </div>
            </div>


          </div>
        </CardContent>
      </Card>

      {/* Usage and Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Usage Overview */}
        <Card className="bg-gray-900/50 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center space-x-2">
              <TrendingUp className="h-5 w-5 text-blue-500" />
              <span>Monthly Usage</span>
            </CardTitle>
            <CardDescription className="text-gray-400">
              Track your FAQ generation limits
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">FAQs Generated</span>
              <span className="text-sm font-medium text-white">
                {subscription?.faq_usage_current || 0} / {subscription?.faq_usage_limit || 0}
              </span>
            </div>
            <Progress value={usagePercentage} className="w-full" />
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{usagePercentage}% used</span>
              <span>{subscription?.faq_usage_limit - (subscription?.faq_usage_current || 0) || 0} remaining</span>
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="bg-gray-900/50 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center space-x-2">
              <Clock className="h-5 w-5 text-green-500" />
              <span>Recent Activity</span>
            </CardTitle>
            <CardDescription className="text-gray-400">
              Your latest FAQ collections
            </CardDescription>
          </CardHeader>
          <CardContent>
            {stats.recentActivity.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="h-12 w-12 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400">No FAQ collections yet</p>
                <p className="text-sm text-gray-500">Create your first FAQ to get started</p>
              </div>
            ) : (
              <div className="space-y-3">
                {stats.recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-white truncate">{activity.title}</p>
                      <div className="flex items-center space-x-2 mt-1">
                        <Calendar className="h-3 w-3 text-gray-400" />
                        <span className="text-xs text-gray-400">{formatDate(activity.created_at)}</span>
                      </div>
                    </div>
                    <Badge variant="secondary" className="bg-gray-700 text-gray-300">
                      {activity.faq_count} FAQs
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
