import React, { useEffect, useState } from 'react';
import { safeQuery } from '../lib/db';
import { formatINR, formatDate, getSourceBadgeStyle, getStatusBadgeStyle } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { 
  Users, 
  IndianRupee, 
  Calendar, 
  AlertCircle, 
  CheckSquare, 
  Clock, 
  Building,
  Plus,
  TrendingUp,
  Sparkles
} from 'lucide-react';
import { TabType } from './Sidebar';
import { SkeletonCard } from './SkeletonLoader';
import ErrorCard from './ErrorCard';
import RevenueGauge from './RevenueGauge';
import { getOffsetDateInput } from '../lib/leadOptions';
import { getTodayLocalDate } from '../lib/taskOptions';
import { getEffectivePaymentAmount, isPaymentOverdue } from '../lib/paymentOptions';

interface DashboardViewProps {
  onNavigate: (tab: TabType, clientId?: string) => void;
  onOpenNewModal: (type: 'lead' | 'client' | 'task' | 'payment' | 'proposal') => void;
  refreshKey?: number;
}

export default function DashboardView({ onNavigate, onOpenNewModal, refreshKey = 0 }: DashboardViewProps) {
  const [clientsState, setClientsState] = useState<{ data: any[]; error: string | null; isMissingTable: boolean; loading: boolean }>({ data: [], error: null, isMissingTable: false, loading: true });
  const [paymentsState, setPaymentsState] = useState<{ data: any[]; error: string | null; isMissingTable: boolean; loading: boolean }>({ data: [], error: null, isMissingTable: false, loading: true });
  const [tasksState, setTasksState] = useState<{ data: any[]; error: string | null; isMissingTable: boolean; loading: boolean }>({ data: [], error: null, isMissingTable: false, loading: true });
  const [leadsState, setLeadsState] = useState<{ data: any[]; error: string | null; isMissingTable: boolean; loading: boolean }>({ data: [], error: null, isMissingTable: false, loading: true });

  useEffect(() => {
    loadClients();
    loadPayments();
    loadTasks();
    loadLeads();
  }, []);

  useEffect(() => {
    if (refreshKey > 0) {
      loadLeads();
      loadClients();
      loadTasks();
      loadPayments();
    }
  }, [refreshKey]);

  const loadClients = async () => {
    setClientsState(prev => ({ ...prev, loading: true }));
    const res = await safeQuery(async () => {
      const { data, error } = await supabase.from('clients').select('*');
      return { data: data || [], error };
    }, []);
    setClientsState({ data: res.data, error: res.error, isMissingTable: res.isMissingTable, loading: false });
  };

  const loadPayments = async () => {
    setPaymentsState(prev => ({ ...prev, loading: true }));
    const res = await safeQuery(async () => {
      const { data, error } = await supabase.from('client_payments').select('*, clients(business_name)');
      return { data: data || [], error };
    }, []);
    setPaymentsState({ data: res.data, error: res.error, isMissingTable: res.isMissingTable, loading: false });
  };

  const loadTasks = async () => {
    setTasksState(prev => ({ ...prev, loading: true }));
    const res = await safeQuery(async () => {
      const { data, error } = await supabase.from('client_tasks').select('*, clients(business_name)');
      return { data: data || [], error };
    }, []);
    setTasksState({ data: res.data, error: res.error, isMissingTable: res.isMissingTable, loading: false });
  };

  const loadLeads = async () => {
    setLeadsState(prev => ({ ...prev, loading: true }));
    const res = await safeQuery(async () => {
      const { data, error } = await supabase.from('leads').select('*');
      return { data: data || [], error };
    }, []);
    setLeadsState({ data: res.data, error: res.error, isMissingTable: res.isMissingTable, loading: false });
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const todayStr = getTodayLocalDate();
  const thirtyDaysLater = getOffsetDateInput(30);
  const sevenDaysLater = getOffsetDateInput(7);

  const clients = clientsState.data;
  const activeClients = clients.filter(c => c.status === 'Active');
  const mrr = activeClients.reduce((sum, c) => sum + (Number(c.monthly_fee) || 0), 0);
  const renewals30 = clients.filter(c => c.renewal_date && c.renewal_date >= todayStr && c.renewal_date <= thirtyDaysLater);

  const payments = paymentsState.data;
  const overduePayments = payments.filter((p) => isPaymentOverdue(p, todayStr));
  const overduePaymentsAmount = overduePayments.reduce((sum, p) => sum + getEffectivePaymentAmount(p), 0);

  const tasks = tasksState.data;
  const tasksDueWeek = tasks.filter(t => t.status !== 'Published' && t.status !== 'Approved' && t.due_date && t.due_date <= sevenDaysLater);
  const todaysTasks = tasks.filter(t => t.status !== 'Published' && t.due_date === todayStr);

  const leads = leadsState.data;
  const leadsFollowupToday = leads.filter(l => l.follow_up_date && l.follow_up_date <= todayStr && l.status !== 'Won' && l.status !== 'Lost');

  // All six stages: New, Contacted, Audit Sent, Proposal, Won, Lost
  const stages = ['New', 'Contacted', 'Audit Sent', 'Proposal', 'Won', 'Lost'];
  const stageColors = ['bg-blue-500', 'bg-indigo-500', 'bg-purple-500', 'bg-amber-500', 'bg-emerald-500', 'bg-rose-500'];
  
  const pipelineStats = stages.map((stage, idx) => {
    const stageLeads = leads.filter(l => {
      const rawStage = l.status || l.pipeline_stage || 'New';
      const st = rawStage === 'New Lead' ? 'New' : rawStage;
      if (stage === 'Audit Sent') return st.toLowerCase().includes('audit') || st === 'Audit Sent';
      return st.toLowerCase() === stage.toLowerCase();
    });
    const totalValue = stageLeads.reduce((sum, l) => sum + (Number(l.deal_value) || 0), 0);
    return { stage, count: stageLeads.length, value: totalValue, color: stageColors[idx % stageColors.length] };
  });

  return (
    <div className="p-6 lg:p-8 space-y-8 max-w-[1400px] mx-auto">
      {/* Greeting & Quick Actions Strip */}
      <div className="tactile-card p-6 bg-white flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-[12px] font-semibold text-slate-400 mb-1">
            <Sparkles className="w-4 h-4 text-[#1D4ED8]" />
            <span>{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}</span>
          </div>
          <h1 className="text-2xl font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans']">
            {getGreeting()}, Sarvesh 👋
          </h1>
          <p className="text-[13px] text-slate-500 mt-1">
            You have{' '}
            <button 
              onClick={() => onNavigate('leads')}
              className="text-[#1D4ED8] font-semibold hover:underline"
            >
              {leadsFollowupToday.length} follow-ups
            </button>{' '}
            and{' '}
            <button 
              onClick={() => onNavigate('tasks')}
              className="text-[#1D4ED8] font-semibold hover:underline"
            >
              {todaysTasks.length} tasks
            </button>{' '}
            due today.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => onOpenNewModal('lead')}
            className="tactile-btn-primary px-3.5 py-2 text-xs flex items-center space-x-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Lead</span>
          </button>
          <button
            onClick={() => onOpenNewModal('client')}
            className="tactile-btn-secondary px-3.5 py-2 text-xs flex items-center space-x-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Client</span>
          </button>
          <button
            onClick={() => onOpenNewModal('proposal')}
            className="tactile-btn-secondary px-3.5 py-2 text-xs flex items-center space-x-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Proposal</span>
          </button>
          <button
            onClick={() => onOpenNewModal('task')}
            className="tactile-btn-secondary px-3.5 py-2 text-xs flex items-center space-x-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Task</span>
          </button>
          <button
            onClick={() => onOpenNewModal('payment')}
            className="tactile-btn-secondary px-3.5 py-2 text-xs flex items-center space-x-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Payment</span>
          </button>
        </div>
      </div>

      {/* 6-Column KPI Cards (Equal height panels, 32px bold tabular numbers, clickable) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {clientsState.loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : clientsState.error ? (
          <div className="col-span-full">
            <ErrorCard title="Active Clients & MRR" error={clientsState.error} isMissingTable={clientsState.isMissingTable} onRetry={loadClients} />
          </div>
        ) : (
          <>
            <div 
              onClick={() => onNavigate('clients')}
              className="tactile-card p-5 bg-white cursor-pointer group flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] font-semibold text-slate-400 uppercase tracking-wider truncate">Active Clients</span>
                <div className="w-8 h-8 rounded-full bg-blue-50 text-[#1D4ED8] flex items-center justify-center shadow-xs shrink-0 group-hover:scale-110 transition-transform">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <div className="tactile-recessed p-3 text-center my-1">
                <span className="text-[32px] font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans'] tabular-nums leading-none">{activeClients.length}</span>
              </div>
              <span className="text-[12px] text-slate-500 block text-center truncate">Active contracts</span>
            </div>

            <div 
              onClick={() => onNavigate('payments')}
              className="tactile-card p-5 bg-white cursor-pointer group flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] font-semibold text-slate-400 uppercase tracking-wider truncate">Monthly MRR</span>
                <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-xs shrink-0 group-hover:scale-110 transition-transform">
                  <IndianRupee className="w-4 h-4" />
                </div>
              </div>
              <div className="tactile-recessed p-3 text-center my-1">
                <span className="text-[26px] font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans'] tabular-nums leading-none truncate block">{formatINR(mrr)}</span>
              </div>
              <span className="text-[12px] text-slate-500 block text-center truncate">Recurring revenue</span>
            </div>
          </>
        )}

        {clientsState.loading ? (
          <SkeletonCard />
        ) : (
          <div 
            onClick={() => onNavigate('renewals')}
            className="tactile-card p-5 bg-white cursor-pointer group flex flex-col justify-between"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-semibold text-slate-400 uppercase tracking-wider truncate">Renewals (30d)</span>
              <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center shadow-xs shrink-0 group-hover:scale-110 transition-transform">
                <Calendar className="w-4 h-4" />
              </div>
            </div>
            <div className="tactile-recessed p-3 text-center my-1">
              <span className="text-[32px] font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans'] tabular-nums leading-none">{renewals30.length}</span>
            </div>
            <span className="text-[12px] text-amber-600 font-medium block text-center truncate">Upcoming renewals</span>
          </div>
        )}

        {paymentsState.loading ? (
          <SkeletonCard />
        ) : paymentsState.error ? (
          <div className="col-span-full">
            <ErrorCard title="Payments Overdue" error={paymentsState.error} isMissingTable={paymentsState.isMissingTable} onRetry={loadPayments} />
          </div>
        ) : (
          <div 
            onClick={() => onNavigate('payments')}
            className="tactile-card p-5 bg-white cursor-pointer group flex flex-col justify-between"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-semibold text-slate-400 uppercase tracking-wider truncate">Overdue</span>
              <div className="w-8 h-8 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center shadow-xs shrink-0 group-hover:scale-110 transition-transform">
                <AlertCircle className="w-4 h-4" />
              </div>
            </div>
            <div className="tactile-recessed p-3 text-center my-1">
              <span className="text-[24px] font-bold text-rose-600 font-['Plus_Jakarta_Sans'] tabular-nums leading-none truncate block">{formatINR(overduePaymentsAmount)}</span>
            </div>
            <span className="text-[12px] text-rose-500 font-medium block text-center truncate">{overduePayments.length} invoices due</span>
          </div>
        )}

        {tasksState.loading ? (
          <SkeletonCard />
        ) : tasksState.error ? (
          <div className="col-span-full">
            <ErrorCard title="Tasks Due This Week" error={tasksState.error} isMissingTable={tasksState.isMissingTable} onRetry={loadTasks} />
          </div>
        ) : (
          <div 
            onClick={() => onNavigate('tasks')}
            className="tactile-card p-5 bg-white cursor-pointer group flex flex-col justify-between"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-semibold text-slate-400 uppercase tracking-wider truncate">Tasks (Week)</span>
              <div className="w-8 h-8 rounded-full bg-blue-50 text-[#1D4ED8] flex items-center justify-center shadow-xs shrink-0 group-hover:scale-110 transition-transform">
                <CheckSquare className="w-4 h-4" />
              </div>
            </div>
            <div className="tactile-recessed p-3 text-center my-1">
              <span className="text-[32px] font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans'] tabular-nums leading-none">{tasksDueWeek.length}</span>
            </div>
            <span className="text-[12px] text-slate-500 block text-center truncate">Pending deliverables</span>
          </div>
        )}

        {leadsState.loading ? (
          <SkeletonCard />
        ) : leadsState.error ? (
          <div className="col-span-full">
            <ErrorCard title="Follow-ups Due" error={leadsState.error} isMissingTable={leadsState.isMissingTable} onRetry={loadLeads} />
          </div>
        ) : (
          <div 
            onClick={() => onNavigate('leads')}
            className="tactile-card p-5 bg-white cursor-pointer group flex flex-col justify-between"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-semibold text-slate-400 uppercase tracking-wider truncate">Follow-ups</span>
              <div className="w-8 h-8 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center shadow-xs shrink-0 group-hover:scale-110 transition-transform">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="tactile-recessed p-3 text-center my-1">
              <span className="text-[32px] font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans'] tabular-nums leading-none">{leadsFollowupToday.length}</span>
            </div>
            <span className="text-[12px] text-purple-600 font-medium block text-center truncate">Needs attention</span>
          </div>
        )}
      </div>

      {/* Row 2: Revenue Gauge & Sales Pipeline Funnel (all 6 stages) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RevenueGauge currentMRR={mrr} />

        {/* Sales Pipeline Funnel with all 6 stages */}
        <div className="tactile-card p-6 bg-white space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans'] flex items-center space-x-2">
              <TrendingUp className="w-4 h-4 text-[#1D4ED8]" />
              <span>Sales Pipeline Funnel</span>
            </h2>
            <button onClick={() => onNavigate('leads')} className="text-[13px] text-[#1D4ED8] hover:underline font-semibold">View Leads</button>
          </div>

          <div className="space-y-3 pt-2">
            {pipelineStats.map((item) => (
              <div 
                key={item.stage} 
                onClick={() => onNavigate('leads')}
                className="space-y-1 cursor-pointer group p-2 rounded-xl hover:bg-slate-50 transition-all"
              >
                <div className="flex justify-between text-[14px] font-semibold text-slate-700">
                  <span className="capitalize group-hover:text-[#1D4ED8]">{item.stage}</span>
                  <span className="text-slate-500 tabular-nums">{item.count} leads • <strong className="text-[#0A1F5C]">{formatINR(item.value)}</strong></span>
                </div>
                <div className="w-full bg-[#DCEBFF] h-3 rounded-full overflow-hidden shadow-inner">
                  <div 
                    className={`${item.color} h-full rounded-full transition-all`}
                    style={{ width: `${Math.max(6, Math.min(100, (item.count / (leads.length || 1)) * 100))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 3: Three Cards Side by Side (min-height 220px, 14px text) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Today's Tasks */}
        <div className="tactile-card p-6 bg-white flex flex-col min-h-[220px]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans'] flex items-center space-x-2">
              <CheckSquare className="w-4 h-4 text-[#1D4ED8]" />
              <span>Today's Tasks</span>
            </h2>
            <button onClick={() => onNavigate('tasks')} className="text-[13px] text-[#1D4ED8] hover:underline font-semibold">View all</button>
          </div>
          <div className="flex-1 space-y-3 text-[14px]">
            {todaysTasks.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <CheckSquare className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-[14px] text-slate-500 font-medium">No tasks due today.</p>
                <p className="text-[13px] text-slate-400">Add a task in the Global Tasks board to get started.</p>
              </div>
            ) : (
              todaysTasks.map(t => (
                <div 
                  key={t.id}
                  onClick={() => onNavigate('client-detail', t.client_id)}
                  className="p-3 rounded-xl bg-slate-50 border border-slate-100 hover:border-[#1D4ED8] cursor-pointer transition-all flex items-center justify-between group"
                >
                  <div className="space-y-1 truncate pr-2">
                    <p className="font-semibold text-[#0A1F5C] truncate group-hover:text-[#1D4ED8]">{t.title}</p>
                    <p className="text-xs text-slate-400 flex items-center gap-1">
                      <Building className="w-3 h-3" />
                      <span>{t.clients?.business_name || 'Client'}</span> • <span className="capitalize">{t.task_type}</span>
                    </p>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold border shrink-0 ${getStatusBadgeStyle(t.status)}`}>
                    {t.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Follow-ups Due */}
        <div className="tactile-card p-6 bg-white flex flex-col min-h-[220px]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans'] flex items-center space-x-2">
              <Clock className="w-4 h-4 text-purple-600" />
              <span>Follow-ups Due</span>
            </h2>
            <button onClick={() => onNavigate('leads')} className="text-[13px] text-[#1D4ED8] hover:underline font-semibold">View all</button>
          </div>
          <div className="flex-1 space-y-3 text-[14px]">
            {leadsFollowupToday.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <Clock className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-[14px] text-slate-500 font-medium">No follow-ups due today.</p>
                <p className="text-[13px] text-slate-400">Great job keeping your leads pipeline up to date!</p>
              </div>
            ) : (
              leadsFollowupToday.slice(0, 5).map(l => (
                <div 
                  key={l.id}
                  onClick={() => onNavigate('leads')}
                  className="p-3 rounded-xl bg-slate-50 border border-slate-100 hover:border-[#1D4ED8] cursor-pointer transition-all flex items-center justify-between group"
                >
                  <div className="space-y-1 truncate pr-2">
                    <p className="font-semibold text-[#0A1F5C] truncate group-hover:text-[#1D4ED8]">{l.business_name}</p>
                    <p className="text-xs text-slate-400">{l.full_name || 'No contact'} • {l.city || '-'}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold border shrink-0 ${getSourceBadgeStyle(l.source)}`}>
                    {l.source || 'Lead'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Upcoming Renewals and Payments */}
        <div className="tactile-card p-6 bg-white flex flex-col min-h-[220px]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans'] flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-amber-600" />
              <span>Renewals & Dues</span>
            </h2>
            <button onClick={() => onNavigate('renewals')} className="text-[13px] text-[#1D4ED8] hover:underline font-semibold">View all</button>
          </div>
          <div className="flex-1 space-y-3 text-[14px]">
            {renewals30.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <Calendar className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-[14px] text-slate-500 font-medium">No renewals in next 30 days.</p>
                <p className="text-[13px] text-slate-400">All client contracts are secure and active.</p>
              </div>
            ) : (
              renewals30.slice(0, 5).map(c => (
                <div 
                  key={c.id}
                  onClick={() => onNavigate('client-detail', c.id)}
                  className="p-3 rounded-xl bg-slate-50 border border-slate-100 hover:border-[#1D4ED8] cursor-pointer transition-all flex items-center justify-between group"
                >
                  <div className="space-y-1 truncate pr-2">
                    <p className="font-semibold text-[#0A1F5C] truncate group-hover:text-[#1D4ED8]">{c.business_name}</p>
                    <p className="text-xs text-slate-400">{c.package} • {formatINR(c.monthly_fee)}/mo</p>
                  </div>
                  <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2.5 py-0.5 rounded border border-amber-200 shrink-0">
                    {formatDate(c.renewal_date)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
