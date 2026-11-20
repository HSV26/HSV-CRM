import React, { useState, useRef, useEffect } from 'react';
import { Search, Plus, User, LogOut, ChevronDown, Bell } from 'lucide-react';
import { TabType } from './Sidebar';
import { supabase } from '../lib/supabase';

interface TopBarProps {
  currentTab: TabType;
  onOpenCommandPalette: () => void;
  onOpenNewModal: (type: 'lead' | 'client' | 'task' | 'payment' | 'proposal') => void;
  hasNotifications?: boolean;
}

export default function TopBar({ currentTab, onOpenCommandPalette, onOpenNewModal, hasNotifications }: TopBarProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const getTabTitle = () => {
    switch (currentTab) {
      case 'dashboard': return { title: 'Dashboard', desc: 'Agency overview & performance metrics' };
      case 'leads': return { title: 'Leads Pipeline', desc: 'Hospitality inquiries & conversions' };
      case 'clients': return { title: 'Clients Management', desc: 'Active hospitality accounts & contracts' };
      case 'client-detail': return { title: 'Client Profile', desc: 'Overview, tasks, reports & billing' };
      case 'tasks': return { title: 'Global Tasks Board', desc: 'Deliverables across all active accounts' };
      case 'payments': return { title: 'Payments & Invoices', desc: 'Retainer billing & payment tracking' };
      case 'renewals': return { title: 'Renewals Pipeline', desc: 'Upcoming contract expirations' };
      case 'sources': return { title: 'Sources Report', desc: 'Lead channel performance & attribution' };
      case 'proposals': return { title: 'Proposals Generator', desc: 'Client proposals & commercial agreements' };
      case 'proposal-editor': return { title: 'Proposal Editor', desc: 'Edit proposal details & deliverables' };
      default: return { title: 'HotelStory CRM', desc: '' };
    }
  };

  const tabInfo = getTabTitle();

  return (
    <header className="sticky top-0 z-20 bg-white border-b border-[#E5ECF6] px-6 lg:px-8 py-4 flex items-center justify-between shadow-xs">
      <div>
        <div className="flex items-center space-x-2 text-xs text-slate-400 font-medium mb-0.5">
          <span>HotelStory CRM</span>
          <span>/</span>
          <span className="text-[#1D4ED8] capitalize">{currentTab.replace('-', ' ')}</span>
        </div>
        <h1 className="text-xl lg:text-2xl font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans'] tracking-tight">
          {tabInfo.title}
        </h1>
      </div>

      <div className="flex items-center space-x-4">
        {/* Global Search trigger */}
        <button
          onClick={onOpenCommandPalette}
          className="hidden md:flex items-center space-x-3 px-3.5 py-2 bg-[#F6F8FC] hover:bg-slate-100 border border-[#E5ECF6] rounded-xl text-xs text-slate-500 transition-all w-60 justify-between"
        >
          <div className="flex items-center space-x-2 truncate">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <span className="truncate">Search...</span>
          </div>
          <kbd className="bg-white px-2 py-0.5 rounded border border-slate-200 text-[10px] font-semibold text-slate-500 shadow-2xs shrink-0">Ctrl+K</kbd>
        </button>

        {/* New Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="tactile-btn-primary px-4 py-2 text-xs flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>New</span>
            <ChevronDown className="w-3.5 h-3.5" />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-[#E5ECF6] py-2 z-50 animate-scale-in">
              <button
                onClick={() => { onOpenNewModal('lead'); setDropdownOpen(false); }}
                className="w-full text-left px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-[#F2F7FF] hover:text-[#1D4ED8] transition-all"
              >
                + Add New Lead
              </button>
              <button
                onClick={() => { onOpenNewModal('client'); setDropdownOpen(false); }}
                className="w-full text-left px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-[#F2F7FF] hover:text-[#1D4ED8] transition-all"
              >
                + Add New Client
              </button>
              <button
                onClick={() => { onOpenNewModal('proposal'); setDropdownOpen(false); }}
                className="w-full text-left px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-[#F2F7FF] hover:text-[#1D4ED8] transition-all"
              >
                + New Proposal
              </button>
              <button
                onClick={() => { onOpenNewModal('task'); setDropdownOpen(false); }}
                className="w-full text-left px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-[#F2F7FF] hover:text-[#1D4ED8] transition-all"
              >
                + Add Content Task
              </button>
              <button
                onClick={() => { onOpenNewModal('payment'); setDropdownOpen(false); }}
                className="w-full text-left px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-[#F2F7FF] hover:text-[#1D4ED8] transition-all"
              >
                + Add Payment Invoice
              </button>
            </div>
          )}
        </div>

        {/* Avatar / Profile Menu with optional notification indicator */}
        <div className="flex items-center space-x-2 pl-2 border-l border-slate-200 relative">
          <div className="w-9 h-9 rounded-full bg-[#1D4ED8] text-white font-bold text-xs flex items-center justify-center shadow-xs">
            SL
          </div>
          {hasNotifications && (
            <span className="absolute top-1 right-2 w-2.5 h-2.5 bg-rose-500 rounded-full border-2 border-white animate-pulse" />
          )}
        </div>
      </div>
    </header>
  );
}
