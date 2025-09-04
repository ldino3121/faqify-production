
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
  FileText, 
  TrendingUp, 
  Clock, 
  Zap,
  BarChart3,
  Plus,
  Eye,
  Calendar
} from "lucide-react";

export const DashboardOverview = () => {
  const stats = {
    totalFAQs: 18,
    monthlyUsage: { current: 3, limit: 10 },
    planType: "Free",
    planExpiry: "Never expires",
    recentActivity: [
      { action: "Created FAQ", title: "E-commerce FAQ", time: "2 hours ago" },
      { action: "Updated FAQ", title: "Shipping Policy FAQ", time: "1 day ago" },
      { action: "Embedded FAQ", title: "Product Support FAQ", time: "3 days ago" },
    ]
  };

  const quickActions = [
    { 
      title: "Create from URL", 
      description: "Generate FAQs from any website",
      icon: Plus,
      action: "create-url"
    },
    { 
      title: "Upload Document", 
      description: "Create FAQs from PDF or DOCX",
      icon: FileText,
      action: "upload-doc"
    },
    { 
      title: "Text Input", 
      description: "Paste content directly",
      icon: FileText,
      action: "text-input"
    },
  ];

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Welcome back, John!</h1>
        <p className="text-gray-400">Here's what's happening with your FAQify account</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="bg-gray-900/50 border-gray-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-300">Total FAQs</CardTitle>
            <FileText className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{stats.totalFAQs}</div>
            <p className="text-xs text-gray-400">+2 from last month</p>
          </CardContent>
        </Card>

        <Card className="bg-gray-900/50 border-gray-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-300">Monthly Usage</CardTitle>
            <BarChart3 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {stats.monthlyUsage.current}/{stats.monthlyUsage.limit}
            </div>
            <Progress 
              value={(stats.monthlyUsage.current / stats.monthlyUsage.limit) * 100} 
              className="mt-2"
            />
          </CardContent>
        </Card>

        <Card className="bg-gray-900/50 border-gray-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-300">Current Plan</CardTitle>
            <Zap className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{stats.planType}</div>
            <p className="text-xs text-gray-400">{stats.planExpiry}</p>
          </CardContent>
        </Card>

        <Card className="bg-gray-900/50 border-gray-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-300">This Month</CardTitle>
            <TrendingUp className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">+12%</div>
            <p className="text-xs text-gray-400">FAQ engagement</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Quick Actions */}
        <Card className="bg-gray-900/50 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Quick Actions</CardTitle>
            <CardDescription className="text-gray-400">
              Start creating FAQs with these shortcuts
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {quickActions.map((action, index) => (
              <div key={index} className="flex items-center space-x-4 p-3 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors cursor-pointer">
                <div className="p-2 bg-blue-600/10 rounded-lg border border-blue-600/20">
                  <action.icon className="h-5 w-5 text-blue-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-white font-medium">{action.title}</h3>
                  <p className="text-sm text-gray-400">{action.description}</p>
                </div>
                <Button size="sm" variant="ghost" className="text-blue-400 hover:text-blue-300">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="bg-gray-900/50 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Recent Activity</CardTitle>
            <CardDescription className="text-gray-400">
              Your latest FAQ management actions
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {stats.recentActivity.map((activity, index) => (
              <div key={index} className="flex items-center space-x-4">
                <div className="p-2 bg-green-600/10 rounded-lg border border-green-600/20">
                  <Clock className="h-4 w-4 text-green-400" />
                </div>
                <div className="flex-1">
                  <p className="text-white text-sm">{activity.action}</p>
                  <p className="text-blue-400 text-sm font-medium">{activity.title}</p>
                  <p className="text-xs text-gray-400">{activity.time}</p>
                </div>
              </div>
            ))}
            
            <Button variant="ghost" className="w-full text-blue-400 hover:text-blue-300 mt-4">
              <Eye className="h-4 w-4 mr-2" />
              View all activity
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Plan Status */}
      {stats.planType === "Free" && (
        <Card className="bg-gradient-to-r from-blue-600/10 to-purple-600/10 border border-blue-600/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-white mb-2">Ready to do more?</h3>
                <p className="text-gray-300">
                  Upgrade to Pro and generate 500 FAQs per month with advanced features.
                </p>
              </div>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                <Zap className="h-4 w-4 mr-2" />
                Upgrade Now
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
