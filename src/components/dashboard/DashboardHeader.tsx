
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Menu, Bell, Zap, LogOut } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { useToast } from "@/hooks/use-toast";

interface DashboardHeaderProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

export const DashboardHeader = ({ sidebarOpen, setSidebarOpen }: DashboardHeaderProps) => {
  const { user, signOut } = useAuth();
  const { subscription, loading } = useSubscription();
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/');
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to sign out. Please try again.",
        variant: "destructive",
      });
    }
  };

  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
  const userEmail = user?.email || '';
  const userInitials = userName.split(' ').map(n => n[0]).join('').toUpperCase();

  return (
    <header className="bg-gray-900/50 border-b border-gray-800 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-white hover:bg-gray-800"
          >
            <Menu className="h-5 w-5" />
          </Button>
          
          <Link to="/" className="flex items-center space-x-2">
            <Zap className="h-6 w-6 text-blue-500" />
            <span className="text-xl font-bold text-white">FAQify</span>
          </Link>
        </div>

        <div className="flex items-center space-x-4">
          {/* Notifications */}
          <Button variant="ghost" size="sm" className="text-white hover:bg-gray-800">
            <Bell className="h-5 w-5" />
          </Button>

          {/* User Menu */}
          <div className="flex items-center space-x-3">
            <Avatar>
              <AvatarFallback className="bg-blue-600 text-white">
                {userInitials}
              </AvatarFallback>
            </Avatar>
            <div className="hidden md:block">
              <p className="text-sm font-medium text-white">{userName}</p>
              <p className="text-xs text-gray-400">{userEmail}</p>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleSignOut}
              className="text-white hover:bg-gray-800"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};
