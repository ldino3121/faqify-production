
import { BillingSyncNotice } from '@/components/dashboard/BillingSyncNotice';
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
  const [creatorVisited, setCreatorVisited] = useState(false);
  const navigateTab = (tab: string) => { if (tab === 'create') setCreatorVisited(true); setActiveTab(tab); };

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
          {activeTab === "overview" && <DashboardOverviewData
            key={`overview-${refreshKey}`}
            onNavigateToUpgrade={() => setActiveTab("upgrade")}
          />}
        </div>

        {/* Create Tab - Always rendered to preserve state */}
        <div className={activeTab === "create" ? "block" : "hidden"}>
          {creatorVisited && <FAQCreator
            key="create-persistent"
            onNavigateToUpgrade={() => setActiveTab("upgrade")}
            onNavigateToManage={() => {
              forceRefresh(); // Force refresh before navigating
              setActiveTab("manage");
            }}
          />}
        </div>

        {/* Manage Tab */}
        <div className={activeTab === "manage" ? "block" : "hidden"}>
          {activeTab === "manage" && <FAQManager
            key={`manage-${refreshKey}`}
            onNavigateToCreate={() => navigateTab("create")}
          />}
        </div>

        {/* Upgrade Tab */}
        <div className={activeTab === "upgrade" ? "block" : "hidden"}>
          {activeTab === "upgrade" && <PlanUpgrade key={`upgrade-${refreshKey}`} />}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <DashboardHeader
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
      />

      <div className="flex">
        <DashboardSidebar
          activeTab={activeTab}
          setActiveTab={navigateTab}
          isOpen={sidebarOpen}
        />

        <main className={`flex-1 transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-16'}`}>
          <div className="p-6">
            <BillingSyncNotice />
            {renderContent()}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
