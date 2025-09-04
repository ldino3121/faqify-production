import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { 
  Eye, 
  MousePointer, 
  Download, 
  Globe, 
  TrendingUp, 
  Calendar,
  Loader2,
  RefreshCw
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface AnalyticsData {
  overview: {
    totalViews: number;
    totalClicks: number;
    totalWidgetLoads: number;
    totalExports: number;
    totalCollections: number;
    totalFAQs: number;
  };
  chartData: Array<{
    date: string;
    views: number;
    clicks: number;
    loads: number;
  }>;
  topCollections: Array<{
    id: string;
    title: string;
    views: number;
    clicks: number;
  }>;
  topFAQs: Array<{
    id: string;
    question: string;
    collection: string;
    views: number;
    clicks: number;
  }>;
  recentActivity: Array<{
    type: string;
    timestamp: string;
    collection?: string;
    faq?: string;
  }>;
}

export const Analytics = () => {
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('30d');
  const [refreshing, setRefreshing] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      fetchAnalytics();
    }
  }, [user, timeframe]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase.functions.invoke('get-analytics', {
        body: null,
      }, {
        method: 'GET',
        query: {
          timeframe: timeframe
        }
      });

      if (error) throw error;

      setAnalyticsData(data);
    } catch (error) {
      console.error('Error fetching analytics:', error);
      toast({
        title: "Error",
        description: "Failed to load analytics data.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const refreshAnalytics = async () => {
    setRefreshing(true);
    await fetchAnalytics();
    setRefreshing(false);
    toast({
      title: "Analytics Refreshed",
      description: "Analytics data has been updated.",
    });
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const getEventTypeLabel = (type: string) => {
    switch (type) {
      case 'faq_view': return 'FAQ Viewed';
      case 'faq_click': return 'FAQ Clicked';
      case 'widget_load': return 'Widget Loaded';
      case 'export': return 'Export';
      case 'embed_generate': return 'Embed Generated';
      default: return type;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <span className="ml-2 text-gray-400">Loading analytics...</span>
      </div>
    );
  }

  if (!analyticsData) {
    return (
      <div className="text-center p-8">
        <p className="text-gray-400">No analytics data available.</p>
      </div>
    );
  }

  const { overview, chartData, topCollections, topFAQs, recentActivity } = analyticsData;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Analytics</h1>
          <p className="text-gray-400 mt-1">Track your FAQ performance and engagement</p>
        </div>
        <div className="flex items-center space-x-3">
          <Tabs value={timeframe} onValueChange={setTimeframe} className="w-auto">
            <TabsList className="bg-gray-800">
              <TabsTrigger value="7d" className="text-gray-300 data-[state=active]:text-white">7 days</TabsTrigger>
              <TabsTrigger value="30d" className="text-gray-300 data-[state=active]:text-white">30 days</TabsTrigger>
              <TabsTrigger value="90d" className="text-gray-300 data-[state=active]:text-white">90 days</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            onClick={refreshAnalytics}
            disabled={refreshing}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="bg-gray-900/50 border-gray-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Total Views</p>
                <p className="text-2xl font-bold text-white">{formatNumber(overview.totalViews)}</p>
              </div>
              <Eye className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900/50 border-gray-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Total Clicks</p>
                <p className="text-2xl font-bold text-white">{formatNumber(overview.totalClicks)}</p>
              </div>
              <MousePointer className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900/50 border-gray-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Widget Loads</p>
                <p className="text-2xl font-bold text-white">{formatNumber(overview.totalWidgetLoads)}</p>
              </div>
              <Globe className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900/50 border-gray-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Exports</p>
                <p className="text-2xl font-bold text-white">{formatNumber(overview.totalExports)}</p>
              </div>
              <Download className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Activity Chart */}
        <Card className="bg-gray-900/50 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Activity Over Time</CardTitle>
            <CardDescription className="text-gray-400">
              Daily views, clicks, and widget loads
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" stroke="#9CA3AF" />
                <YAxis stroke="#9CA3AF" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1F2937', 
                    border: '1px solid #374151',
                    borderRadius: '8px'
                  }}
                />
                <Line type="monotone" dataKey="views" stroke="#3B82F6" strokeWidth={2} />
                <Line type="monotone" dataKey="clicks" stroke="#10B981" strokeWidth={2} />
                <Line type="monotone" dataKey="loads" stroke="#8B5CF6" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top Collections */}
        <Card className="bg-gray-900/50 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Top Collections</CardTitle>
            <CardDescription className="text-gray-400">
              Most viewed FAQ collections
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {topCollections.slice(0, 5).map((collection, index) => (
                <div key={collection.id} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                      {index + 1}
                    </div>
                    <div>
                      <p className="text-white font-medium">{collection.title}</p>
                      <p className="text-gray-400 text-sm">{collection.views} views, {collection.clicks} clicks</p>
                    </div>
                  </div>
                  <TrendingUp className="h-4 w-4 text-green-500" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top FAQs */}
        <Card className="bg-gray-900/50 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Top FAQs</CardTitle>
            <CardDescription className="text-gray-400">
              Most engaged FAQ questions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {topFAQs.slice(0, 5).map((faq, index) => (
                <div key={faq.id} className="space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="text-white font-medium text-sm">{faq.question}</p>
                      <p className="text-gray-400 text-xs">{faq.collection}</p>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {faq.views + faq.clicks} interactions
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="bg-gray-900/50 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Recent Activity</CardTitle>
            <CardDescription className="text-gray-400">
              Latest user interactions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentActivity.slice(0, 8).map((activity, index) => (
                <div key={index} className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <div className="flex-1">
                    <p className="text-white text-sm">
                      {getEventTypeLabel(activity.type)}
                      {activity.collection && ` in ${activity.collection}`}
                    </p>
                    <p className="text-gray-400 text-xs">
                      {new Date(activity.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
