import React, { useEffect, useState } from 'react';
import { Search, LayoutDashboard, Users, UserCheck, CheckSquare, CreditCard, CalendarClock, PieChart, X, ArrowRight, FileText, FileSignature } from 'lucide-react';
import { TabType } from './Sidebar';
import { supabase } from '../lib/supabase';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (tab: TabType, clientId?: string) => void;
}

export default function CommandPalette({ isOpen, onClose, onNavigate }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [leads, setLeads] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen) {
      fetchSearchData();
    }
  }, [isOpen]);

  const fetchSearchData = async () => {
    const [lRes, cRes] = await Promise.all([
      supabase.from('leads').select('id, business_name, full_name').limit(20),
      supabase.from('clients').select('id, business_name, contact_name').limit(20),
    ]);
    setLeads(lRes.data || []);
    setClients(cRes.data || []);
  };

  if (!isOpen) return null;

  const filteredLeads = leads.filter(l => 
    (l.business_name || '').toLowerCase().includes(query.toLowerCase()) ||
    (l.full_name || '').toLowerCase().includes(query.toLowerCase())
  );

  const filteredClients = clients.filter(c => 
    (c.business_name || '').toLowerCase().includes(query.toLowerCase()) ||
    (c.contact_name || '').toLowerCase().includes(query.toLowerCase())
  );

  const navigationItems = [
    { label: 'Dashboard', tab: 'dashboard' as TabType, icon: LayoutDashboard },
    { label: 'Leads Pipeline', tab: 'leads' as TabType, icon: Users },
    { label: 'Proposals', tab: 'proposals' as TabType, icon: FileText },
    { label: 'Contracts', tab: 'contracts' as TabType, icon: FileSignature },
    { label: 'Clients Management', tab: 'clients' as TabType, icon: UserCheck },
    { label: 'Global Tasks Board', tab: 'tasks' as TabType, icon: CheckSquare },
    { label: 'Payments & Invoices', tab: 'payments' as TabType, icon: CreditCard },
    { label: 'Renewals Pipeline', tab: 'renewals' as TabType, icon: CalendarClock },
    { label: 'Sources Report', tab: 'sources' as TabType, icon: PieChart },
  ].filter(item => item.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-start justify-center pt-20 p-4" onClick={onClose}>
      <div 
        className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-[#E5ECF6] overflow-hidden animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center px-4 py-3.5 border-b border-slate-100">
          <Search className="w-5 h-5 text-slate-400 mr-3" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Type a command or search leads and clients (Ctrl+K)..."
            className="w-full bg-transparent text-sm text-slate-800 focus:outline-none placeholder-slate-400"
          />
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto p-3 space-y-4">
          {navigationItems.length > 0 && (
            <div className="space-y-1">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-3 py-1">Navigation</p>
              {navigationItems.map(item => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.tab}
                    onClick={() => {
                      onNavigate(item.tab);
                      onClose();
                    }}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium text-slate-700 hover:bg-[#F2F7FF] hover:text-[#1D4ED8] transition-all"
                  >
                    <div className="flex items-center space-x-2.5">
                      <Icon className="w-4 h-4 text-slate-400" />
                      <span>{item.label}</span>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-300" />
                  </button>
                );
              })}
            </div>
          )}

          {filteredClients.length > 0 && (
            <div className="space-y-1">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-3 py-1">Clients</p>
              {filteredClients.map(c => (
                <button
                  key={c.id}
                  onClick={() => {
                    onNavigate('client-detail', c.id);
                    onClose();
                  }}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium text-slate-700 hover:bg-[#F2F7FF] hover:text-[#1D4ED8] transition-all"
                >
                  <div className="flex items-center space-x-2.5">
                    <UserCheck className="w-4 h-4 text-emerald-600" />
                    <span>{c.business_name} <span className="text-slate-400 font-normal">({c.contact_name || 'Client'})</span></span>
                  </div>
                  <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">Client</span>
                </button>
              ))}
            </div>
          )}

          {filteredLeads.length > 0 && (
            <div className="space-y-1">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-3 py-1">Leads</p>
              {filteredLeads.map(l => (
                <button
                  key={l.id}
                  onClick={() => {
                    onNavigate('leads');
                    onClose();
                  }}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium text-slate-700 hover:bg-[#F2F7FF] hover:text-[#1D4ED8] transition-all"
                >
                  <div className="flex items-center space-x-2.5">
                    <Users className="w-4 h-4 text-[#1D4ED8]" />
                    <span>{l.business_name} <span className="text-slate-400 font-normal">({l.full_name || 'Lead'})</span></span>
                  </div>
                  <span className="text-[10px] bg-blue-50 text-[#1D4ED8] px-2 py-0.5 rounded-full font-semibold">Lead</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
