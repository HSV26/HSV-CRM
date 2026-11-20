import React, { useEffect, useState } from 'react';
import { safeQuery } from '../lib/db';
import { formatINR, formatDate, formatInputDate, getSourceBadgeStyle, getStatusBadgeStyle } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';
import { 
  ArrowLeft, 
  Phone, 
  MessageCircle, 
  Mail, 
  Building2, 
  CheckSquare, 
  FileText, 
  CreditCard, 
  Clock, 
  Plus, 
  Trash2, 
  ExternalLink, 
  Copy, 
  Check, 
  Sparkles
} from 'lucide-react';
import { SkeletonCard, SkeletonTable } from './SkeletonLoader';
import ErrorCard from './ErrorCard';
import TaskCard from './TaskCard';
import TaskModal from './TaskModal';
import AddPaymentModal from './AddPaymentModal';
import MarkAsPaidModal from './MarkAsPaidModal';
import { computeCompletedAt, getTodayLocalDate } from '../lib/taskOptions';
import {
  getEffectivePaymentAmount,
  getEffectivePaymentStatus,
} from '../lib/paymentOptions';

interface ClientDetailViewProps {
  clientId: string;
  onBack: () => void;
  onCreateProposal: (type: 'client', id: string) => void;
  onTasksMutated?: () => void;
  onPaymentsMutated?: () => void;
}

type ProfileTab = 'overview' | 'tasks' | 'reports' | 'payments' | 'activity';

export default function ClientDetailView({ clientId, onBack, onCreateProposal, onTasksMutated, onPaymentsMutated }: ClientDetailViewProps) {
  const { showToast } = useToast();
  const [clientState, setClientState] = useState<{ data: any | null; error: string | null; isMissingTable: boolean; loading: boolean }>({ data: null, error: null, isMissingTable: false, loading: true });
  const [activeTab, setActiveTab] = useState<ProfileTab>('overview');

  const [linkedLead, setLinkedLead] = useState<any | null>(null);

  // Overview edit state
  const [businessName, setBusinessName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [packageTier, setPackageTier] = useState('');
  const [monthlyFee, setMonthlyFee] = useState(0);
  const [contractStart, setContractStart] = useState('');
  const [renewalDate, setRenewalDate] = useState('');
  const [status, setStatus] = useState('');
  const [instagram, setInstagram] = useState('');
  const [facebook, setFacebook] = useState('');
  const [website, setWebsite] = useState('');
  const [notes, setNotes] = useState('');
  const [savingOverview, setSavingOverview] = useState(false);

  // Content Tasks state
  const [tasks, setTasks] = useState<any[]>([]);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<any | null>(null);

  // Reports state
  const [reports, setReports] = useState<any[]>([]);
  const [isAddReportOpen, setIsAddReportOpen] = useState(false);
  const [reportMonth, setReportMonth] = useState('November 2026');
  const [followersStart, setFollowersStart] = useState('');
  const [followersEnd, setFollowersEnd] = useState('');
  const [reach, setReach] = useState('');
  const [enquiries, setEnquiries] = useState('');
  const [highlights, setHighlights] = useState('');
  const [reportLink, setReportLink] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Payments state
  const [payments, setPayments] = useState<any[]>([]);
  const [isAddPaymentOpen, setIsAddPaymentOpen] = useState(false);
  const [markingPaidPayment, setMarkingPaidPayment] = useState<any | null>(null);

  // Activity state
  const [activities, setActivities] = useState<any[]>([]);
  const [activityNote, setActivityNote] = useState('');
  const [activityType, setActivityType] = useState('Call');

  useEffect(() => {
    fetchClientData();
  }, [clientId]);

  const fetchClientData = async () => {
    setClientState(prev => ({ ...prev, loading: true }));

    const clientRes = await safeQuery(async () => {
      const { data, error } = await supabase.from('clients').select('*').eq('id', clientId).single();
      return { data, error };
    }, null);

    if (clientRes.error || !clientRes.data) {
      setClientState({ data: null, error: clientRes.error, isMissingTable: clientRes.isMissingTable, loading: false });
      return;
    }

    const clientData = clientRes.data;
    setClientState({ data: clientData, error: null, isMissingTable: false, loading: false });

    setBusinessName(clientData.business_name || '');
    setContactName(clientData.contact_name || '');
    setPhone(clientData.phone || '');
    setEmail(clientData.email || '');
    setCity(clientData.city || '');
    setBusinessType(clientData.business_type || '');
    setPackageTier(clientData.package || '');
    setMonthlyFee(clientData.monthly_fee || 0);
    setContractStart(clientData.contract_start || '');
    setRenewalDate(clientData.renewal_date || '');
    setStatus(clientData.status || 'Active');
    setInstagram(clientData.instagram || '');
    setFacebook(clientData.facebook || '');
    setWebsite(clientData.website || '');
    setNotes(clientData.notes || '');

    if (clientData.lead_id) {
      const leadRes = await safeQuery(async () => {
        const { data, error } = await supabase.from('leads').select('*').eq('id', clientData.lead_id).single();
        return { data, error };
      }, null);
      setLinkedLead(leadRes.data);
    }

    const [tasksRes, reportsRes, paymentsRes, activitiesRes] = await Promise.all([
      safeQuery(async () => {
        const { data, error } = await supabase.from('client_tasks').select('*').eq('client_id', clientId).order('due_date', { ascending: true });
        return { data: data || [], error };
      }, []),
      safeQuery(async () => {
        const { data, error } = await supabase.from('client_reports').select('*').eq('client_id', clientId).order('created_at', { ascending: false });
        return { data: data || [], error };
      }, []),
      safeQuery(async () => {
        const { data, error } = await supabase.from('client_payments').select('*').eq('client_id', clientId).order('due_date', { ascending: false });
        return { data: data || [], error };
      }, []),
      safeQuery(async () => {
        const { data, error } = await supabase.from('client_activities').select('*').eq('client_id', clientId).order('created_at', { ascending: false });
        return { data: data || [], error };
      }, [])
    ]);

    setTasks(tasksRes.data);
    setReports(reportsRes.data);
    setPayments(paymentsRes.data);
    setActivities(activitiesRes.data);
  };

  const handleSaveOverview = async () => {
    setSavingOverview(true);
    const { error } = await supabase.from('clients').update({
      business_name: businessName,
      contact_name: contactName,
      phone,
      email,
      city,
      business_type: businessType,
      package: packageTier,
      monthly_fee: Number(monthlyFee),
      contract_start: contractStart,
      renewal_date: renewalDate,
      status,
      instagram,
      facebook,
      website,
      notes
    }).eq('id', clientId);

    setSavingOverview(false);
    if (error) {
      showToast('Could not save client: ' + error.message, 'error');
    } else {
      showToast('Client profile saved successfully', 'success');
      fetchClientData();
    }
  };

  const handleUpdateTaskStatus = async (
    taskId: string,
    newStatus: string,
    existingCompletedAt?: string | null
  ) => {
    const completed_at = computeCompletedAt(newStatus, existingCompletedAt);
    const { error } = await supabase
      .from('client_tasks')
      .update({ status: newStatus, completed_at })
      .eq('id', taskId);
    if (error) {
      showToast('Could not update task: ' + error.message, 'error');
      return;
    }
    showToast('Task status updated', 'success');
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: newStatus, completed_at } : t))
    );
    onTasksMutated?.();
  };

  const handleDeleteTask = async (taskId: string) => {
    const { error } = await supabase.from('client_tasks').delete().eq('id', taskId);
    if (error) {
      showToast('Could not delete task: ' + error.message, 'error');
      return;
    }
    showToast('Task deleted', 'success');
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    onTasksMutated?.();
  };

  const handleGenerateMonthlyPlan = async () => {
    let postCount = 8;
    let reelCount = 4;
    let storyCount = 12;

    if (packageTier === 'Growth') {
      postCount = 12;
      reelCount = 8;
      storyCount = 20;
    } else if (packageTier === 'Dominator') {
      postCount = 16;
      reelCount = 12;
      storyCount = 30;
    }

    const newTasks = [];
    const today = new Date();

    for (let i = 1; i <= postCount; i++) {
      const due = new Date(today.getTime() + Math.floor((i / postCount) * 30) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      newTasks.push({
        client_id: clientId,
        title: `Instagram Post #${i}: Hospitality Showcase`,
        task_type: 'Post',
        platform: 'Instagram',
        due_date: due,
        status: 'To do',
        notes: 'Generated from monthly package plan'
      });
    }

    for (let i = 1; i <= reelCount; i++) {
      const due = new Date(today.getTime() + Math.floor((i / reelCount) * 30) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      newTasks.push({
        client_id: clientId,
        title: `Instagram Reel #${i}: Cinematic Room Tour`,
        task_type: 'Reel',
        platform: 'Instagram',
        due_date: due,
        status: 'To do',
        notes: 'Generated from monthly package plan'
      });
    }

    for (let i = 1; i <= Math.min(storyCount, 12); i++) {
      const due = new Date(today.getTime() + Math.floor((i / 12) * 30) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      newTasks.push({
        client_id: clientId,
        title: `Instagram Story Batch #${i}: Behind the Scenes`,
        task_type: 'Story',
        platform: 'Instagram',
        due_date: due,
        status: 'To do',
        notes: 'Generated from monthly package plan'
      });
    }

    await supabase.from('client_tasks').insert(newTasks);
    showToast(`Generated ${newTasks.length} tasks for ${packageTier} package`, 'success');
    onTasksMutated?.();
    fetchClientData();
  };

  const handleAddReport = async (e: React.FormEvent) => {
    e.preventDefault();
    await supabase.from('client_reports').insert({
      client_id: clientId,
      report_month: reportMonth,
      followers_start: followersStart ? Number(followersStart) : null,
      followers_end: followersEnd ? Number(followersEnd) : null,
      reach: reach ? Number(reach) : null,
      enquiries: enquiries ? Number(enquiries) : null,
      highlights,
      report_link: reportLink
    });

    setIsAddReportOpen(false);
    setFollowersStart('');
    setFollowersEnd('');
    setReach('');
    setEnquiries('');
    setHighlights('');
    setReportLink('');
    showToast('Report added successfully', 'success');
    fetchClientData();
  };

  const handleCopyReportSummary = (rep: any) => {
    const diff = (rep.followers_end || 0) - (rep.followers_start || 0);
    const diffStr = diff >= 0 ? `+${diff.toLocaleString()}` : `${diff.toLocaleString()}`;
    const text = `📊 *HotelStory Monthly Report - ${rep.report_month}*
🏨 *${clientState.data?.business_name}*

👥 Followers: ${(rep.followers_end || 0).toLocaleString()} (${diffStr})
📈 Total Reach: ${(rep.reach || 0).toLocaleString()}
🛎️ Direct Enquiries: ${(rep.enquiries || 0).toLocaleString()}

✨ *Key Highlights:*
${rep.highlights || 'Great month of content & growth!'}

${rep.report_link ? `🔗 View Full Report: ${rep.report_link}` : ''}`;

    navigator.clipboard.writeText(text);
    setCopiedId(rep.id);
    setTimeout(() => setCopiedId(null), 2000);
    showToast('Monthly report summary copied to clipboard', 'success');
  };

  const handleGenerateNextPayment = async () => {
    const today = new Date();
    const nextMonthStr = new Date(today.getFullYear(), today.getMonth() + 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
    const dueDateStr = new Date(today.getFullYear(), today.getMonth() + 1, 5).toISOString().split('T')[0];

    await supabase.from('client_payments').insert({
      client_id: clientId,
      for_month: nextMonthStr,
      amount: monthlyFee,
      total_amount: monthlyFee,
      payment_type: 'Monthly retainer',
      due_date: dueDateStr,
      status: 'Due'
    });

    showToast(`Generated invoice for ${nextMonthStr}`, 'success');
    onPaymentsMutated?.();
    fetchClientData();
  };

  const handleAddActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activityNote.trim()) return;

    await supabase.from('client_activities').insert({
      client_id: clientId,
      type: activityType,
      note: activityNote.trim()
    });

    setActivityNote('');
    showToast('Activity logged', 'success');
    fetchClientData();
  };

  if (clientState.loading) {
    return (
      <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
        <SkeletonCard />
        <SkeletonTable />
      </div>
    );
  }

  if (clientState.error || !clientState.data) {
    return (
      <div className="p-8 max-w-[1400px] mx-auto">
        <ErrorCard title="Client Profile" error={clientState.error || 'Client not found'} isMissingTable={clientState.isMissingTable} onRetry={fetchClientData} />
      </div>
    );
  }

  const client = clientState.data;
  const columns = ['To do', 'In progress', 'Waiting approval', 'Approved', 'Published'];

  // Mini stats
  const daysToRenewal = client.renewal_date ? Math.ceil((new Date(client.renewal_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 0;
  const openTasksCount = tasks.filter(t => t.status !== 'Published' && t.status !== 'Approved').length;
  const pendingPaymentsCount = payments.filter(p => p.status !== 'Paid').length;

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1400px] mx-auto">
      <button
        onClick={onBack}
        className="inline-flex items-center space-x-2 text-xs font-semibold text-slate-600 hover:text-[#1D4ED8] bg-white px-3.5 py-2 rounded-xl border border-[#E5ECF6] transition-all shadow-2xs"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Clients</span>
      </button>

      {/* Header Card */}
      <div className="bg-white rounded-2xl p-6 border border-[#E5ECF6] shadow-xs space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 text-[#1D4ED8] flex items-center justify-center font-bold text-xl shadow-xs shrink-0">
              {client.business_name.charAt(0).toUpperCase()}
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans']">{client.business_name}</h1>
                <span className={`px-2.5 py-0.5 rounded-full font-semibold border text-[10px] ${getStatusBadgeStyle(client.status)}`}>
                  {client.status}
                </span>
                <span className="font-medium text-[#1D4ED8] bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-100 text-[10px]">
                  {client.package || 'Standard'}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {client.contact_name || 'No contact'} • {client.business_type} • {client.city || 'No city'} • <span className={getSourceBadgeStyle(client.source)}>{client.source || 'Direct'}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onCreateProposal('client', clientId)}
              className="px-4 py-2.5 bg-blue-50 hover:bg-blue-100 text-[#1D4ED8] rounded-xl text-xs font-semibold flex items-center space-x-2 transition-all shadow-2xs"
            >
              <FileText className="w-4 h-4" />
              <span>Create Proposal</span>
            </button>
            {client.phone && (
              <a
                href={`tel:${client.phone}`}
                className="px-4 py-2.5 bg-blue-50 hover:bg-blue-100 text-[#1D4ED8] rounded-xl text-xs font-semibold flex items-center space-x-2 transition-all"
              >
                <Phone className="w-4 h-4" />
                <span>Call</span>
              </a>
            )}
            {client.phone && (
              <a
                href={`https://wa.me/${client.phone.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-xs font-semibold flex items-center space-x-2 transition-all"
              >
                <MessageCircle className="w-4 h-4" />
                <span>WhatsApp</span>
              </a>
            )}
            {client.email && (
              <a
                href={`mailto:${client.email}`}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center space-x-2 transition-all"
              >
                <Mail className="w-4 h-4" />
                <span>Email</span>
              </a>
            )}
          </div>
        </div>

        {/* 4 Mini Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-slate-100 text-xs">
          <div className="p-3 bg-slate-50 rounded-xl">
            <span className="text-slate-400 block uppercase text-[10px]">Monthly Fee</span>
            <span className="text-lg font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans']">{formatINR(client.monthly_fee)}</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl">
            <span className="text-slate-400 block uppercase text-[10px]">Renewal Date</span>
            <span className={`text-lg font-bold font-['Plus_Jakarta_Sans'] ${daysToRenewal <= 30 ? 'text-amber-600' : 'text-[#0A1F5C]'}`}>
              {daysToRenewal > 0 ? `${daysToRenewal} days` : 'Due'}
            </span>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl">
            <span className="text-slate-400 block uppercase text-[10px]">Open Tasks</span>
            <span className="text-lg font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans']">{openTasksCount}</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl">
            <span className="text-slate-400 block uppercase text-[10px]">Pending Payments</span>
            <span className={`text-lg font-bold font-['Plus_Jakarta_Sans'] ${pendingPaymentsCount > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              {pendingPaymentsCount}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto space-x-2 border-b border-[#E5ECF6] pb-2">
        {[
          { id: 'overview' as ProfileTab, label: 'Overview', icon: Building2 },
          { id: 'tasks' as ProfileTab, label: 'Content Tasks', icon: CheckSquare, count: tasks.length },
          { id: 'reports' as ProfileTab, label: 'Reports', icon: FileText, count: reports.length },
          { id: 'payments' as ProfileTab, label: 'Payments', icon: CreditCard, count: payments.length },
          { id: 'activity' as ProfileTab, label: 'Activity', icon: Clock, count: activities.length },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-[#1D4ED8] text-white shadow-md shadow-blue-500/20'
                  : 'bg-white text-slate-600 hover:bg-slate-50 border border-[#E5ECF6]'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${isActive ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-6 border border-[#E5ECF6] shadow-xs space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h2 className="text-base font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans']">Client Details & Contract</h2>
              <button
                onClick={handleSaveOverview}
                disabled={savingOverview}
                className="px-4 py-2 bg-[#1D4ED8] hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-500/20 transition-all disabled:opacity-50"
              >
                {savingOverview ? 'Saving...' : 'Save Changes'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 uppercase">Business Name</label>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-[#E5ECF6] rounded-xl text-slate-800"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700 uppercase">Contact Name</label>
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-[#E5ECF6] rounded-xl text-slate-800"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700 uppercase">City</label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-[#E5ECF6] rounded-xl text-slate-800"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700 uppercase">Phone</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-[#E5ECF6] rounded-xl text-slate-800"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700 uppercase">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-[#E5ECF6] rounded-xl text-slate-800"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700 uppercase">Business Type</label>
                <input
                  type="text"
                  value={businessType}
                  onChange={(e) => setBusinessType(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-[#E5ECF6] rounded-xl text-slate-800"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700 uppercase">Package Tier</label>
                <select
                  value={packageTier}
                  onChange={(e) => setPackageTier(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-[#E5ECF6] rounded-xl text-slate-800 font-medium"
                >
                  <option value="Starter">Starter</option>
                  <option value="Growth">Growth</option>
                  <option value="Dominator">Dominator</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700 uppercase">Monthly Fee (₹)</label>
                <input
                  type="number"
                  value={monthlyFee}
                  onChange={(e) => setMonthlyFee(Number(e.target.value))}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-[#E5ECF6] rounded-xl text-slate-800 font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700 uppercase">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-[#E5ECF6] rounded-xl text-slate-800 font-medium"
                >
                  <option value="Active">Active</option>
                  <option value="Onboarding">Onboarding</option>
                  <option value="Paused">Paused</option>
                  <option value="Churned">Churned</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700 uppercase">Contract Start</label>
                <input
                  type="date"
                  value={contractStart}
                  onChange={(e) => setContractStart(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-[#E5ECF6] rounded-xl text-slate-800"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700 uppercase">Renewal Date</label>
                <input
                  type="date"
                  value={renewalDate}
                  onChange={(e) => setRenewalDate(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-[#E5ECF6] rounded-xl text-slate-800"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700 uppercase">Instagram Handle</label>
                <input
                  type="text"
                  value={instagram}
                  onChange={(e) => setInstagram(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-[#E5ECF6] rounded-xl text-slate-800"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 uppercase">Client Notes</label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-[#E5ECF6] rounded-xl text-xs text-slate-800"
              />
            </div>
          </div>

          {linkedLead && (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-6 border border-blue-100 space-y-3">
              <h3 className="text-xs font-bold text-[#0A1F5C] uppercase tracking-wider">Converted Lead Origin</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-slate-700">
                <div>
                  <span className="text-slate-400 block">Source</span>
                  <span className={`inline-block mt-1 px-2.5 py-0.5 rounded-full font-semibold border text-[10px] ${getSourceBadgeStyle(linkedLead.source)}`}>
                    {linkedLead.source || 'Website'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">UTM Campaign</span>
                  <span className="font-semibold">{linkedLead.utm_campaign || '-'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Original Message</span>
                  <span className="italic">"{linkedLead.message || '-'}"</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: CONTENT TASKS */}
      {activeTab === 'tasks' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-[#E5ECF6]">
            <div>
              <h2 className="text-base font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans']">Content Tasks Board</h2>
              <p className="text-xs text-slate-500">Manage editorial workflows across columns.</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleGenerateMonthlyPlan}
                className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-all"
              >
                <Sparkles className="w-4 h-4" />
                <span>Create Monthly Plan ({client.package})</span>
              </button>
              <button
                onClick={() => {
                  setEditingTask(null);
                  setIsTaskModalOpen(true);
                }}
                className="px-4 py-2 bg-[#1D4ED8] hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center space-x-1.5 shadow-md shadow-blue-500/20 transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Add Task</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
            {columns.map(col => {
              const colTasks = tasks.filter(t => (t.status || 'To do') === col);
              return (
                <div key={col} className="bg-slate-50/80 rounded-2xl p-4 border border-[#E5ECF6] space-y-3 flex flex-col min-h-[400px]">
                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="text-xs font-bold text-[#0A1F5C]">{col}</span>
                    <span className="text-xs font-semibold bg-blue-100 text-[#1D4ED8] px-2 py-0.5 rounded-full">
                      {colTasks.length}
                    </span>
                  </div>

                  <div className="space-y-3 flex-1">
                    {colTasks.map(t => (
                      <TaskCard
                        key={t.id}
                        task={t}
                        showClientName={false}
                        onOpenTask={(clicked) => {
                          setEditingTask(clicked);
                          setIsTaskModalOpen(true);
                        }}
                        onStatusChange={handleUpdateTaskStatus}
                        onDeleteTask={handleDeleteTask}
                      />
                    ))}
                    {colTasks.length === 0 && (
                      <div className="text-center py-12 text-[11px] text-slate-400 italic">No tasks</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: REPORTS */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-[#E5ECF6]">
            <div>
              <h2 className="text-base font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans']">Monthly Performance Reports</h2>
              <p className="text-xs text-slate-500">Track follower growth, reach, enquiries and generate client WhatsApp summaries.</p>
            </div>
            <button
              onClick={() => setIsAddReportOpen(true)}
              className="px-4 py-2 bg-[#1D4ED8] hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center space-x-1.5 shadow-md shadow-blue-500/20"
            >
              <Plus className="w-4 h-4" />
              <span>Add Report</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {reports.map(rep => {
              const diff = (rep.followers_end || 0) - (rep.followers_start || 0);
              return (
                <div key={rep.id} className="bg-white rounded-2xl p-6 border border-[#E5ECF6] shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b pb-3">
                    <h3 className="font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans'] text-base">{rep.report_month}</h3>
                    <button
                      onClick={() => handleCopyReportSummary(rep)}
                      className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-[#1D4ED8] rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-all"
                    >
                      {copiedId === rep.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedId === rep.id ? 'Copied!' : 'Copy WhatsApp Summary'}</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="p-3 bg-slate-50 rounded-xl">
                      <span className="text-[10px] text-slate-400 block uppercase">Followers</span>
                      <span className="text-base font-bold text-[#0A1F5C]">{(rep.followers_end || 0).toLocaleString()}</span>
                      <span className={`text-[10px] font-semibold block ${diff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {diff >= 0 ? `+${diff.toLocaleString()}` : diff.toLocaleString()}
                      </span>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl">
                      <span className="text-[10px] text-slate-400 block uppercase">Total Reach</span>
                      <span className="text-base font-bold text-[#0A1F5C]">{(rep.reach || 0).toLocaleString()}</span>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl">
                      <span className="text-[10px] text-slate-400 block uppercase">Enquiries</span>
                      <span className="text-base font-bold text-emerald-600">{(rep.enquiries || 0).toLocaleString()}</span>
                    </div>
                  </div>

                  {rep.highlights && (
                    <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl">
                      <p className="font-semibold text-[#0A1F5C] mb-1">Highlights:</p>
                      <p>{rep.highlights}</p>
                    </div>
                  )}

                  {rep.report_link && (
                    <div className="pt-2 text-xs">
                      <a
                        href={rep.report_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#1D4ED8] hover:underline inline-flex items-center space-x-1 font-medium"
                      >
                        <span>View Report Document</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  )}
                </div>
              );
            })}
            {reports.length === 0 && (
              <div className="col-span-full py-12 text-center text-slate-400 bg-white rounded-2xl border border-[#E5ECF6]">
                No monthly reports added yet.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: PAYMENTS */}
      {activeTab === 'payments' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-[#E5ECF6]">
            <div>
              <h2 className="text-base font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans']">Invoices & Payments</h2>
              <p className="text-xs text-slate-500">Track monthly retainer fees, due dates and payment statuses.</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleGenerateNextPayment}
                className="px-4 py-2 bg-blue-50 hover:bg-blue-100 text-[#1D4ED8] rounded-xl text-xs font-semibold flex items-center space-x-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Generate Next Month's Payment</span>
              </button>
              <button
                onClick={() => setIsAddPaymentOpen(true)}
                className="px-4 py-2 bg-[#1D4ED8] hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center space-x-1.5 shadow-md shadow-blue-500/20"
              >
                <Plus className="w-4 h-4" />
                <span>Add Payment</span>
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-[#E5ECF6] overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b text-[11px] font-semibold text-slate-500 uppercase">
                    <th className="py-3.5 px-4">Billing Month</th>
                    <th className="py-3.5 px-4">Amount</th>
                    <th className="py-3.5 px-4">Due Date</th>
                    <th className="py-3.5 px-4">Paid On</th>
                    <th className="py-3.5 px-4">Method</th>
                    <th className="py-3.5 px-4">Reference</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.map(p => {
                    const todayStr = getTodayLocalDate();
                    const displayStatus = getEffectivePaymentStatus(p, todayStr);
                    const effectiveTotal = getEffectivePaymentAmount(p);
                    const hasGst = Number(p.gst_amount) > 0;

                    return (
                      <tr key={p.id} className="hover:bg-slate-50/50 h-[56px]">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-[#0A1F5C]">{p.for_month || '-'}</div>
                          {p.payment_type && (
                            <div className="text-[11px] text-slate-400">{p.payment_type}</div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-[#0A1F5C] tabular-nums">{formatINR(effectiveTotal)}</div>
                          {hasGst && (
                            <div className="text-[10px] text-slate-400 tabular-nums">
                              incl. {formatINR(p.gst_amount)} GST
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-600">{formatDate(p.due_date)}</td>
                        <td className="py-3 px-4 text-slate-600">{p.paid_on ? formatDate(p.paid_on) : '-'}</td>
                        <td className="py-3 px-4 text-slate-600">{p.payment_method || '-'}</td>
                        <td className="py-3 px-4 text-slate-600 font-mono text-[11px]">{p.reference_no || '-'}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2.5 py-0.5 rounded-full font-semibold border text-[10px] ${getStatusBadgeStyle(displayStatus)}`}>
                            {displayStatus}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {p.status !== 'Paid' && (
                            <button
                              type="button"
                              onClick={() => setMarkingPaidPayment(p)}
                              className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg font-semibold transition-all"
                            >
                              Mark as paid
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {payments.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">No payment records found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: ACTIVITY TIMELINE */}
      {activeTab === 'activity' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-6 border border-[#E5ECF6] shadow-xs space-y-4">
            <h2 className="text-base font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans']">Log Client Activity</h2>
            <form onSubmit={handleAddActivity} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 uppercase">Activity Type</label>
                  <select
                    value={activityType}
                    onChange={(e) => setActivityType(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-[#E5ECF6] rounded-xl text-xs font-medium text-slate-800"
                  >
                    <option value="Call">Call</option>
                    <option value="WhatsApp">WhatsApp</option>
                    <option value="Meeting">Meeting</option>
                    <option value="Email">Email</option>
                    <option value="Note">Note</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 uppercase">Note / Summary</label>
                <textarea
                  rows={2}
                  required
                  value={activityNote}
                  onChange={(e) => setActivityNote(e.target.value)}
                  placeholder="Discussed upcoming campaign strategy..."
                  className="w-full p-3 bg-slate-50 border border-[#E5ECF6] rounded-xl text-xs text-slate-800"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#1D4ED8] hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-500/20"
                >
                  Add Activity
                </button>
              </div>
            </form>
          </div>

          <div className="space-y-3">
            {activities.map(act => (
              <div key={act.id} className="bg-white p-4 rounded-2xl border border-[#E5ECF6] shadow-xs space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#1D4ED8] bg-blue-50 px-2 py-0.5 rounded">{act.type}</span>
                  <span className="text-slate-400">{formatDate(act.created_at)}</span>
                </div>
                <p className="text-xs text-slate-700">{act.note}</p>
              </div>
            ))}
            {activities.length === 0 && (
              <div className="py-12 text-center text-slate-400 bg-white rounded-2xl border border-[#E5ECF6]">
                No activities logged yet.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      <TaskModal
        isOpen={isTaskModalOpen}
        onClose={() => {
          setIsTaskModalOpen(false);
          setEditingTask(null);
        }}
        taskToEdit={editingTask}
        defaultClientId={clientId}
        clientsList={[{ id: client.id, business_name: client.business_name }]}
        onTaskCreated={() => {
          onTasksMutated?.();
          fetchClientData();
        }}
        onTaskUpdated={(updated) => {
          setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
          onTasksMutated?.();
        }}
        onTaskDeleted={(deletedId) => {
          setTasks((prev) => prev.filter((t) => t.id !== deletedId));
          onTasksMutated?.();
        }}
      />

      {isAddReportOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-[#E5ECF6] p-6 space-y-4 animate-scale-in">
            <h3 className="font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans'] text-lg">Add Monthly Report</h3>
            <form onSubmit={handleAddReport} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 uppercase">Report Month</label>
                <input
                  type="text"
                  required
                  value={reportMonth}
                  onChange={(e) => setReportMonth(e.target.value)}
                  placeholder="November 2026"
                  className="w-full px-3 py-2.5 bg-slate-50 border border-[#E5ECF6] rounded-xl text-slate-800"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 uppercase">Followers Start</label>
                  <input
                    type="number"
                    value={followersStart}
                    onChange={(e) => setFollowersStart(e.target.value)}
                    placeholder="12500"
                    className="w-full px-3 py-2.5 bg-slate-50 border border-[#E5ECF6] rounded-xl text-slate-800"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 uppercase">Followers End</label>
                  <input
                    type="number"
                    value={followersEnd}
                    onChange={(e) => setFollowersEnd(e.target.value)}
                    placeholder="13200"
                    className="w-full px-3 py-2.5 bg-slate-50 border border-[#E5ECF6] rounded-xl text-slate-800"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 uppercase">Total Reach</label>
                  <input
                    type="number"
                    value={reach}
                    onChange={(e) => setReach(e.target.value)}
                    placeholder="45000"
                    className="w-full px-3 py-2.5 bg-slate-50 border border-[#E5ECF6] rounded-xl text-slate-800"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 uppercase">Enquiries</label>
                  <input
                    type="number"
                    value={enquiries}
                    onChange={(e) => setEnquiries(e.target.value)}
                    placeholder="85"
                    className="w-full px-3 py-2.5 bg-slate-50 border border-[#E5ECF6] rounded-xl text-slate-800"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 uppercase">Highlights</label>
                <textarea
                  rows={2}
                  value={highlights}
                  onChange={(e) => setHighlights(e.target.value)}
                  placeholder="Reel went viral..."
                  className="w-full p-3 bg-slate-50 border border-[#E5ECF6] rounded-xl text-slate-800"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 uppercase">Report Link (Optional)</label>
                <input
                  type="url"
                  value={reportLink}
                  onChange={(e) => setReportLink(e.target.value)}
                  placeholder="https://canva.com/..."
                  className="w-full px-3 py-2.5 bg-slate-50 border border-[#E5ECF6] rounded-xl text-slate-800"
                />
              </div>
              <div className="flex justify-end gap-3 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsAddReportOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#1D4ED8] hover:bg-blue-700 text-white rounded-xl font-medium shadow-md"
                >
                  Save Report
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AddPaymentModal
        isOpen={isAddPaymentOpen}
        onClose={() => setIsAddPaymentOpen(false)}
        defaultClientId={clientId}
        clientsList={[
          {
            id: client.id,
            business_name: client.business_name,
            monthly_fee: client.monthly_fee,
          },
        ]}
        onPaymentCreated={() => {
          onPaymentsMutated?.();
          fetchClientData();
        }}
      />

      <MarkAsPaidModal
        payment={markingPaidPayment}
        clientName={client.business_name}
        onClose={() => setMarkingPaidPayment(null)}
        onSuccess={() => {
          onPaymentsMutated?.();
          fetchClientData();
        }}
      />
    </div>
  );
}
