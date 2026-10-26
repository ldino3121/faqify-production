
import { BillingSyncNotice } from '@/components/dashboard/BillingSyncNotice';
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from 'react-router-dom';
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { DashboardOverviewData } from "@/components/dashboard/DashboardOverviewData";
import { FAQCreator } from "@/components/dashboard/FAQCreator";
import { FAQManager } from "@/components/dashboard/FAQManager";
import { PlanUpgrade } from "@/components/dashboard/PlanUpgrade";
import { Button } from '@/components/ui/button';

const Dashboard = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const contentRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState(() => {
    const section = window.location.hash.slice(1);
    if (['overview', 'create', 'manage', 'upgrade'].includes(section)) return section;
    const params = new URLSearchParams(window.location.search);
    return params.has('purchase') || params.get('billing') === 'processing' ? 'upgrade' : 'overview';
  });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [creatorVisited, setCreatorVisited] = useState(false);
  const navigateTab = (tab: string) => {
    if (tab === 'create') setCreatorVisited(true);
    setActiveTab(tab);
    navigate({ pathname: '/dashboard', search: location.search, hash: `#${tab}` });
    requestAnimationFrame(() => contentRef.current?.scrollIntoView({ block: 'start' }));
  };
  useEffect(() => {
    const section = location.hash.slice(1);
    if (['overview', 'create', 'manage', 'upgrade'].includes(section)) {
      if (section === 'create') setCreatorVisited(true);
      setActiveTab(section);
    } else {
      const params = new URLSearchParams(location.search);
      setActiveTab(params.has('purchase') || params.get('billing') === 'processing' ? 'upgrade' : 'overview');
    }
  }, [location.hash, location.search]);

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
            onNavigateToUpgrade={() => navigateTab('upgrade')}
          />}
        </div>

        {/* Create Tab - Always rendered to preserve state */}
        <div className={activeTab === "create" ? "block" : "hidden"}>
          {creatorVisited && <FAQCreator
            key="create-persistent"
            onNavigateToUpgrade={() => navigateTab('upgrade')}
            onNavigateToManage={() => {
              forceRefresh(); // Force refresh before navigating
              navigateTab('manage');
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
          {activeTab === "upgrade" && <PlanUpgrade key={`upgrade-${refreshKey}`} onNavigateToOverview={() => navigateTab('overview')} />}
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

        <main className={`min-w-0 flex-1 transition-all duration-300 ${sidebarOpen ? 'md:ml-64' : 'md:ml-16'}`}>
          <nav className="flex md:hidden gap-2 overflow-x-auto p-3 border-b border-border" aria-label="Dashboard sections">
            {([['overview','Overview'],['create','Create'],['manage','FAQs'],['upgrade','Billing']] as const).map(([tab,label]) =>
              <Button key={tab} size="sm" variant={activeTab === tab ? 'default' : 'outline'} onClick={() => navigateTab(tab)}>{label}</Button>)}
          </nav>
          <div ref={contentRef} className="p-3 sm:p-6 scroll-mt-20">
            <BillingSyncNotice onOpenBilling={() => navigateTab('upgrade')} />
            {renderContent()}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
