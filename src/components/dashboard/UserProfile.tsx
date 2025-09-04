
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { 
  User, 
  Mail, 
  Calendar, 
  Shield, 
  Zap,
  CreditCard,
  Activity,
  Edit,
  Save,
  X
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export const UserProfile = () => {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: "John Doe",
    email: "john@example.com",
    company: "Acme Corp",
    website: "https://acme.com"
  });
  const { toast } = useToast();

  const userStats = {
    plan: "Free",
    joinDate: "January 15, 2024",
    totalFAQs: 18,
    monthlyUsage: { current: 3, limit: 10 },
    planExpiry: "Never expires",
    lastLogin: "2024-01-22 14:30",
  };

  const recentActivity = [
    { action: "Created FAQ collection", details: "E-commerce Store FAQs", date: "2024-01-22" },
    { action: "Updated FAQ", details: "Shipping Policy FAQ", date: "2024-01-21" },
    { action: "Generated embed code", details: "Product Support FAQ", date: "2024-01-20" },
    { action: "Exported FAQ", details: "Customer Service FAQ", date: "2024-01-19" },
  ];

  const handleSave = () => {
    // Simulate API call
    setTimeout(() => {
      setIsEditing(false);
      toast({
        title: "Profile Updated",
        description: "Your profile information has been saved successfully.",
      });
    }, 500);
  };

  const handleCancel = () => {
    setIsEditing(false);
    // Reset form data to original values
    setFormData({
      name: "John Doe",
      email: "john@example.com",
      company: "Acme Corp",
      website: "https://acme.com"
    });
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Profile</h1>
        <p className="text-gray-400">Manage your account settings and view your usage statistics</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Profile Information */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="bg-gray-900/50 border-gray-800">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-white">Profile Information</CardTitle>
                <CardDescription className="text-gray-400">
                  Update your personal details and preferences
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                onClick={() => setIsEditing(!isEditing)}
                className="text-blue-400 hover:text-blue-300"
              >
                {isEditing ? <X className="h-4 w-4" /> : <Edit className="h-4 w-4" />}
              </Button>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center space-x-4">
                <Avatar className="h-16 w-16">
                  <AvatarFallback className="bg-blue-600 text-white text-xl">
                    {formData.name.split(' ').map(n => n[0]).join('')}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="text-lg font-medium text-white">{formData.name}</h3>
                  <p className="text-gray-400">{formData.email}</p>
                  <Badge className="bg-blue-600/20 text-blue-400 border-blue-600/30 mt-1">
                    {userStats.plan} Plan
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-300">Full Name</label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    disabled={!isEditing}
                    className="bg-gray-800 border-gray-700 text-white disabled:opacity-60"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-300">Email</label>
                  <Input
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    disabled={!isEditing}
                    className="bg-gray-800 border-gray-700 text-white disabled:opacity-60"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-300">Company</label>
                  <Input
                    value={formData.company}
                    onChange={(e) => setFormData(prev => ({ ...prev, company: e.target.value }))}
                    disabled={!isEditing}
                    className="bg-gray-800 border-gray-700 text-white disabled:opacity-60"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-300">Website</label>
                  <Input
                    value={formData.website}
                    onChange={(e) => setFormData(prev => ({ ...prev, website: e.target.value }))}
                    disabled={!isEditing}
                    className="bg-gray-800 border-gray-700 text-white disabled:opacity-60"
                  />
                </div>
              </div>

              {isEditing && (
                <div className="flex space-x-3 pt-4 border-t border-gray-800">
                  <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white">
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </Button>
                  <Button onClick={handleCancel} className="bg-gray-600 hover:bg-gray-700 text-white">
                    Cancel
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card className="bg-gray-900/50 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white flex items-center space-x-2">
                <Activity className="h-5 w-5 text-blue-500" />
                <span>Recent Activity</span>
              </CardTitle>
              <CardDescription className="text-gray-400">
                Your latest actions on FAQify
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentActivity.map((activity, index) => (
                  <div key={index} className="flex items-center space-x-4 p-3 bg-gray-800/50 rounded-lg">
                    <div className="p-2 bg-blue-600/10 rounded-lg border border-blue-600/20">
                      <Activity className="h-4 w-4 text-blue-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-white text-sm font-medium">{activity.action}</p>
                      <p className="text-blue-400 text-sm">{activity.details}</p>
                      <p className="text-xs text-gray-400">{activity.date}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Stats Sidebar */}
        <div className="space-y-6">
          {/* Plan Status */}
          <Card className="bg-gray-900/50 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white flex items-center space-x-2">
                <Zap className="h-5 w-5 text-yellow-500" />
                <span>Plan Status</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-white">{userStats.plan}</div>
                <p className="text-sm text-gray-400">{userStats.planExpiry}</p>
              </div>
              
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-400">Monthly Usage</span>
                  <span className="text-white">{userStats.monthlyUsage.current}/{userStats.monthlyUsage.limit}</span>
                </div>
                <Progress value={(userStats.monthlyUsage.current / userStats.monthlyUsage.limit) * 100} />
              </div>

              <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                <CreditCard className="h-4 w-4 mr-2" />
                Upgrade Plan
              </Button>
            </CardContent>
          </Card>

          {/* Account Stats */}
          <Card className="bg-gray-900/50 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white">Account Stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <User className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-400">Member since</span>
                </div>
                <span className="text-white text-sm">{userStats.joinDate}</span>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Shield className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-400">Total FAQs</span>
                </div>
                <span className="text-white text-sm">{userStats.totalFAQs}</span>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-400">Last login</span>
                </div>
                <span className="text-white text-sm">{userStats.lastLogin}</span>
              </div>
            </CardContent>
          </Card>

          {/* Account Actions */}
          <Card className="bg-gray-900/50 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white">Account Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                <Mail className="h-4 w-4 mr-2" />
                Change Password
              </Button>
              <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                <Shield className="h-4 w-4 mr-2" />
                Privacy Settings
              </Button>
              <Button variant="outline" className="w-full border-red-600 text-red-400 hover:bg-red-600/10">
                Delete Account
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
