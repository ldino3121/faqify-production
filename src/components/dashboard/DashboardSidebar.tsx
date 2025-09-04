
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Plus,
  FileText,
  User,
  CreditCard,
  HelpCircle
} from "lucide-react";

interface DashboardSidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isOpen: boolean;
}

export const DashboardSidebar = ({ activeTab, setActiveTab, isOpen }: DashboardSidebarProps) => {
  const menuItems = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "create", label: "Create FAQ", icon: Plus },
    { id: "manage", label: "Manage FAQs", icon: FileText },
    { id: "upgrade", label: "Upgrade Plan", icon: CreditCard },
  ];

  const bottomItems = [
    { id: "help", label: "Help", icon: HelpCircle },
  ];

  return (
    <aside className={`fixed left-0 top-16 h-full bg-gray-900/50 border-r border-gray-800 transition-all duration-300 z-40 ${
      isOpen ? 'w-64' : 'w-16'
    }`}>
      <div className="flex flex-col h-full">
        <nav className="flex-1 p-4 space-y-2">
          {menuItems.map((item) => (
            <Button
              key={item.id}
              variant={activeTab === item.id ? "default" : "ghost"}
              className={`w-full justify-start ${
                !isOpen ? 'px-2' : ''
              } ${
                activeTab === item.id 
                  ? 'bg-blue-600 text-white hover:bg-blue-700' 
                  : 'text-gray-300 hover:text-white hover:bg-gray-800'
              }`}
              onClick={() => setActiveTab(item.id)}
            >
              <item.icon className="h-5 w-5" />
              {isOpen && <span className="ml-3">{item.label}</span>}
            </Button>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-800 space-y-2">
          {bottomItems.map((item) => (
            <Button
              key={item.id}
              variant="ghost"
              className={`w-full justify-start ${
                !isOpen ? 'px-2' : ''
              } text-gray-300 hover:text-white hover:bg-gray-800`}
              onClick={() => setActiveTab(item.id)}
            >
              <item.icon className="h-5 w-5" />
              {isOpen && <span className="ml-3">{item.label}</span>}
            </Button>
          ))}
        </div>
      </div>
    </aside>
  );
};
