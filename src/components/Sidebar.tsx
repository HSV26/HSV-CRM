import React, { useEffect, useState } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  UserCheck, 
  CheckSquare, 
  CreditCard, 
  CalendarClock, 
  PieChart, 
  Building2,
  Menu,
  X,
  LogOut,
  ChevronLeft,
  ChevronRight,
  FileText,
  FileSignature
} from 'lucide-react';
import { supabase } from '../lib/supabase';

export type TabType = 'dashboard' | 'leads' | 'clients' | 'client-detail' | 'tasks' | 'payments' | 'renewals' | 'sources' | 'proposals' | 'proposal-editor' | 'contracts' | 'contract-detail';

interface SidebarProps {
  currentTab: TabType;
  onTabChange: (tab: TabType) => void;
  selectedClientId?: string | null;
  onSelectClient?: (id: string | null) => void;
}

export default function Sidebar({ currentTab, onTabChange, onSelectClient }: SidebarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const handleSignOut = async () => {
    setMobileMenuOpen(false);
    try {
      await supabase.auth.signOut();
    } catch {
      // No-op when auth is not required
    }
  };

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileMenuOpen]);

  const navGroups = [
    {
      title: 'Overview',
      items: [{ id: 'dashboard' as TabType, label: 'Dashboard', icon: LayoutDashboard }]
    },
    {
      title: 'Sales',
      items: [
        { id: 'leads' as TabType, label: 'Leads Pipeline', icon: Users },
        { id: 'proposals' as TabType, label: 'Proposals', icon: FileText },
        { id: 'contracts' as TabType, label: 'Contracts', icon: FileSignature }
      ]
    },
    {
      title: 'Delivery',
      items: [
        { id: 'clients' as TabType, label: 'Clients', icon: UserCheck },
        { id: 'tasks' as TabType, label: 'Tasks Board', icon: CheckSquare }
      ]
    },
    {
      title: 'Finance',
      items: [{ id: 'payments' as TabType, label: 'Payments', icon: CreditCard }]
    },
    {
      title: 'Insights',
      items: [
        { id: 'renewals' as TabType, label: 'Renewals', icon: CalendarClock },
        { id: 'sources' as TabType, label: 'Sources Report', icon: PieChart }
      ]
    }
  ];

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className={`hidden lg:flex flex-col bg-[#0A1F5C] text-white shrink-0 sticky top-0 h-screen transition-all duration-200 border-r border-white/10 ${
        collapsed ? 'w-20' : 'w-[260px]'
      }`}>
        <div className="p-5 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center space-x-3 overflow-hidden">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-b from-[#3B82F6] to-[#1D4ED8] text-white flex items-center justify-center shadow-lg font-bold shrink-0 border border-white/30">
              <Building2 className="w-5 h-5" />
            </div>
            {!collapsed && (
              <div className="truncate">
                <h1 className="font-bold text-white font-['Plus_Jakarta_Sans'] tracking-tight text-sm">HotelStory CRM</h1>
                <p className="text-[11px] text-blue-200">Hospitality Agency</p>
              </div>
            )}
          </div>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all shrink-0 border border-white/20 shadow-xs"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
          {navGroups.map((group, idx) => (
            <div key={idx} className="space-y-1">
              {!collapsed && (
                <p className="px-3 text-[11px] font-semibold text-blue-200 uppercase tracking-wider mb-1">
                  {group.title}
                </p>
              )}
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = currentTab === item.id || (currentTab === 'client-detail' && item.id === 'clients') || (currentTab === 'proposal-editor' && item.id === 'proposals') || (currentTab === 'contract-detail' && item.id === 'contracts');
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      if (item.id === 'clients' && currentTab === 'client-detail' && onSelectClient) {
                        onSelectClient(null);
                      }
                      onTabChange(item.id);
                    }}
                    title={collapsed ? item.label : undefined}
                    className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all relative group ${
                      isActive
                        ? 'bg-[#1D4ED8] text-white shadow-md font-semibold'
                        : 'text-white hover:bg-white/10'
                    }`}
                  >
                    <Icon className="w-5 h-5 shrink-0 text-white" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Profile Block at Bottom */}
        <div className="p-3 border-t border-white/10 space-y-2">
          {!collapsed ? (
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/10 border border-white/15">
              <div className="flex items-center space-x-3 overflow-hidden">
                <div className="w-8 h-8 rounded-full bg-gradient-to-b from-[#3B82F6] to-[#1D4ED8] text-white font-bold text-xs flex items-center justify-center shrink-0 border border-white/30">
                  SL
                </div>
                <div className="truncate">
                  <p className="text-xs font-semibold text-white truncate">Sarvesh Lotankar</p>
                  <p className="text-[10px] text-blue-200">Founder</p>
                </div>
              </div>
              <button
                onClick={handleSignOut}
                className="p-1.5 rounded-lg text-white hover:text-rose-300 hover:bg-rose-500/20 transition-all shrink-0"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex justify-center">
              <button
                onClick={handleSignOut}
                className="w-10 h-10 rounded-xl bg-white/10 text-white hover:text-rose-300 hover:bg-rose-500/20 flex items-center justify-center transition-all border border-white/15"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile Top Navbar */}
      <div className="lg:hidden bg-[#0A1F5C] text-white border-b border-white/10 sticky top-0 z-30 px-4 py-3 flex items-center justify-between shadow-xs">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-b from-[#3B82F6] to-[#1D4ED8] text-white flex items-center justify-center font-bold border border-white/30">
            <Building2 className="w-4 h-4" />
          </div>
          <span className="font-bold text-white font-['Plus_Jakarta_Sans'] text-sm">HotelStory CRM</span>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={mobileMenuOpen}
          className="ml-auto p-2 rounded-xl text-white hover:bg-white/10 transition-colors"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Drawer Backdrop */}
      <div
        aria-hidden={!mobileMenuOpen}
        onClick={() => setMobileMenuOpen(false)}
        className={`lg:hidden fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300 ease-in-out ${
          mobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Mobile Slide-in Drawer (Right) */}
      <aside
        role="dialog"
        aria-modal={mobileMenuOpen ? 'true' : undefined}
        aria-label="Mobile navigation"
        aria-hidden={!mobileMenuOpen}
        className={`lg:hidden fixed top-0 right-0 bottom-0 z-50 w-72 bg-[#0A1F5C] text-white h-full shadow-2xl p-6 flex flex-col justify-between border-l border-white/20 transform transition-transform duration-300 ease-in-out overflow-y-auto ${
          mobileMenuOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none'
        }`}
      >
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div className="flex items-center space-x-2">
              <Building2 className="w-5 h-5 text-[#3B82F6]" />
              <span className="font-bold text-white">HotelStory CRM</span>
            </div>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Close navigation menu"
              className="text-white hover:text-blue-200 p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="space-y-2">
            {navGroups.map((group, idx) => (
              <div key={idx} className="space-y-1">
                <p className="px-3 text-[11px] font-semibold text-blue-200 uppercase tracking-wider mb-1">
                  {group.title}
                </p>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentTab === item.id || (currentTab === 'client-detail' && item.id === 'clients') || (currentTab === 'proposal-editor' && item.id === 'proposals') || (currentTab === 'contract-detail' && item.id === 'contracts');
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        if (item.id === 'clients' && currentTab === 'client-detail' && onSelectClient) {
                          onSelectClient(null);
                        }
                        onTabChange(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                        isActive
                          ? 'bg-[#1D4ED8] text-white shadow-md font-semibold'
                          : 'text-white hover:bg-white/10'
                      }`}
                    >
                      <Icon className="w-5 h-5 text-white" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>

        <div className="border-t border-white/10 pt-4 mt-6">
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/10 border border-white/15">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-b from-[#3B82F6] to-[#1D4ED8] text-white font-bold text-xs flex items-center justify-center border border-white/30">
                SL
              </div>
              <div>
                <p className="text-xs font-semibold text-white">Sarvesh Lotankar</p>
                <p className="text-[10px] text-blue-200">Founder</p>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="p-1.5 rounded-lg text-white hover:text-rose-300"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Bottom Tab Bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#0A1F5C] text-white border-t border-white/10 z-30 px-2 py-1 flex justify-around items-center shadow-lg">
        {[
          { id: 'dashboard' as TabType, label: 'Dashboard', icon: LayoutDashboard },
          { id: 'leads' as TabType, label: 'Leads', icon: Users },
          { id: 'proposals' as TabType, label: 'Proposals', icon: FileText },
          { id: 'clients' as TabType, label: 'Clients', icon: UserCheck },
          { id: 'tasks' as TabType, label: 'Tasks', icon: CheckSquare },
        ].map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id || (currentTab === 'client-detail' && item.id === 'clients') || (currentTab === 'proposal-editor' && item.id === 'proposals') || (currentTab === 'contract-detail' && item.id === 'contracts');
          return (
            <button
              key={item.id}
              onClick={() => {
                if (item.id === 'clients' && currentTab === 'client-detail' && onSelectClient) {
                  onSelectClient(null);
                }
                onTabChange(item.id);
              }}
              className={`flex flex-col items-center py-2 px-3 rounded-xl text-[11px] font-medium transition-all ${
                isActive ? 'text-white font-bold bg-[#1D4ED8] shadow-xs' : 'text-blue-200 hover:text-white'
              }`}
            >
              <Icon className="w-5 h-5 mb-1 text-white" />
              <span className="truncate max-w-[60px]">{item.label}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}
