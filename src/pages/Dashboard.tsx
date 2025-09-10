
import { useState } from "react";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { DashboardOverviewData } from "@/components/dashboard/DashboardOverviewData";
import { FAQCreator } from "@/components/dashboard/FAQCreator";
import { FAQManager } from "@/components/dashboard/FAQManager";
import { PlanUpgrade } from "@/components/dashboard/PlanUpgrade";

const Dashboard = () => {
  const [activeTab, setActiveTab] = useState("overview");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Force refresh function for data sync
  const forceRefresh = () => {
    console.log('🔄 Force refreshing dashboard data');
    setRefreshKey(prev => prev + 1);
  };

  const renderContent = () => {
    return (
      <div className="relative">
        {/* Overview Tab */}
        <div className={activeTab === "overview" ? "block" : "hidden"}>
          <DashboardOverviewData key={`overview-${refreshKey}`} />
        </div>

        {/* Create Tab - Always rendered to preserve state */}
        <div className={activeTab === "create" ? "block" : "hidden"}>
          <FAQCreator
            key="create-persistent"
            onNavigateToUpgrade={() => setActiveTab("upgrade")}
            onNavigateToManage={() => {
              forceRefresh(); // Force refresh before navigating
              setActiveTab("manage");
            }}
          />
        </div>

        {/* Manage Tab */}
        <div className={activeTab === "manage" ? "block" : "hidden"}>
          <FAQManager
            key={`manage-${refreshKey}`}
            onNavigateToCreate={() => setActiveTab("create")}
          />
        </div>

        {/* Upgrade Tab */}
        <div className={activeTab === "upgrade" ? "block" : "hidden"}>
          <PlanUpgrade key={`upgrade-${refreshKey}`} />
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <DashboardHeader 
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
      />
      
      <div className="flex">
        <DashboardSidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isOpen={sidebarOpen}
        />
        
        <main className={`flex-1 transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-16'}`}>
          <div className="p-6">
            {renderContent()}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
