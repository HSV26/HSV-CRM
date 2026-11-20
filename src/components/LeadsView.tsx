import React, { useEffect, useState, useCallback, useRef } from 'react';
import { safeQuery } from '../lib/db';
import { formatINR, formatDate, formatInputDate, getSourceBadgeStyle, getStatusBadgeStyle } from '../lib/utils';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useToast } from './Toast';
import {
  Search,
  Plus,
  Phone,
  MessageCircle,
  Building2,
  X,
  ArrowRight,
  Trash2,
  Download,
  Check,
  Instagram,
  Mail,
  Globe,
  Columns3,
  Table as TableIcon,
  MapPin,
} from 'lucide-react';
import { SkeletonTable } from './SkeletonLoader';
import ErrorCard from './ErrorCard';
import AddLeadModal from './AddLeadModal';
import {
  BUSINESS_TYPES,
  OUTLET_OPTIONS,
  DESIGNATION_OPTIONS,
  SOURCE_OPTIONS,
  INTEREST_OPTIONS,
  LEAD_STATUS_OPTIONS,
  FOLLOW_UP_TYPE_OPTIONS,
  PIPELINE_COLUMNS,
  LEAD_SOURCE_FILTER_PRESETS,
  cleanInstagramHandle,
  formatIndianPhone,
  parseInterests,
  getLeadHotelName,
  getLeadContactName,
  getLeadSourceValue,
  getLeadLocation,
  getLeadInterest,
  getLeadPipelineStage,
  stageToLegacyStatus,
  isLeadUnreadFlag,
} from '../lib/leadOptions';

interface LeadsViewProps {
  onOpenClientProfile: (clientId: string) => void;
  onCreateProposal: (type: 'lead', id: string) => void;
  refreshKey?: number;
  openLeadId?: string | null;
  onClearOpenLeadId?: () => void;
  onLeadsMutated?: () => void;
}

export default function LeadsView({
  onOpenClientProfile,
  onCreateProposal,
  refreshKey = 0,
  openLeadId,
  onClearOpenLeadId,
  onLeadsMutated,
}: LeadsViewProps) {
  const { showToast } = useToast();
  const [leadsState, setLeadsState] = useState<{
    data: any[];
    error: string | null;
    isMissingTable: boolean;
    loading: boolean;
  }>({ data: [], error: null, isMissingTable: false, loading: true });

  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sourceFilter, setSourceFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  const [selectedLead, setSelectedLead] = useState<any | null>(null);
  const [leadActivities, setLeadActivities] = useState<any[]>([]);
  const [newNote, setNewNote] = useState('');
  const [autoSaveState, setAutoSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isConvertModalOpen, setIsConvertModalOpen] = useState(false);

  // Convert form
  const [clientPackage, setClientPackage] = useState('Growth');
  const [monthlyFee, setMonthlyFee] = useState('');
  const [contractStart, setContractStart] = useState(formatInputDate(new Date()));
  const [renewalDate, setRenewalDate] = useState(
    formatInputDate(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000))
  );

  const selectedLeadRef = useRef<any | null>(null);
  selectedLeadRef.current = selectedLead;

  const fetchLeads = useCallback(async (silent = false) => {
    if (!silent) {
      setLeadsState((prev) => ({ ...prev, loading: true }));
    }
    const res = await safeQuery(async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false });
      return { data: data || [], error };
    }, []);
    setLeadsState((prev) => ({
      data: silent && res.error ? prev.data : res.data,
      error: silent && res.error ? prev.error : res.error,
      isMissingTable: silent && res.error ? prev.isMissingTable : res.isMissingTable,
      loading: false,
    }));
  }, []);

  useEffect(() => {
    fetchLeads();
  }, [refreshKey, fetchLeads]);

  const markLeadAsRead = async (lead: any) => {
    if (!isLeadUnreadFlag(lead)) return;

    const localPatch = { is_unread: false, is_read: true };
    setLeadsState((prev) => ({
      ...prev,
      data: prev.data.map((l) => (l.id === lead.id ? { ...l, ...localPatch } : l)),
    }));
    setSelectedLead((prev: any) => (prev && prev.id === lead.id ? { ...prev, ...localPatch } : prev));

    const payload: Record<string, any> = { is_read: true };
    if ('is_unread' in lead) {
      payload.is_unread = false;
    }

    const { error } = await supabase.from('leads').update(payload).eq('id', lead.id);
    if (!error) {
      onLeadsMutated?.();
    }
  };

  const handleSelectLead = async (lead: any) => {
    const normalizedLead = {
      ...lead,
      business_name: lead.business_name || lead.hotel_name || '',
      full_name: lead.full_name || lead.contact_name || '',
      city: lead.city || lead.website_or_city || '',
      interested_in: lead.interested_in || lead.service_interest || '',
      source: lead.source || lead.lead_source || 'Manual',
      status: lead.status || stageToLegacyStatus(getLeadPipelineStage(lead)),
    };
    setSelectedLead(normalizedLead);
    setAutoSaveState('idle');

    if (isLeadUnreadFlag(lead)) {
      markLeadAsRead(lead);
    }

    const res = await safeQuery(async () => {
      const { data, error } = await supabase
        .from('lead_activities')
        .select('*')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: false });
      return { data: data || [], error };
    }, []);
    setLeadActivities(res.data);
  };

  const handleSelectLeadRef = useRef(handleSelectLead);
  handleSelectLeadRef.current = handleSelectLead;

  // Real-time subscription + silent polling fallback for incoming website leads
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const channel = supabase
      .channel('leads-pipeline-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leads' },
        (payload) => {
          if (payload.eventType === 'INSERT' && payload.new) {
            const incoming = payload.new as any;
            let wasAdded = false;
            setLeadsState((prev) => {
              if (prev.data.some((l) => l.id === incoming.id)) return prev;
              wasAdded = true;
              return {
                ...prev,
                data: [incoming, ...prev.data],
              };
            });
            if (wasAdded) {
              onLeadsMutated?.();
              if (getLeadSourceValue(incoming) === 'Website Lead') {
                showToast(`New website lead: ${getLeadHotelName(incoming)}`, 'info', {
                  label: 'View',
                  onClick: () => handleSelectLeadRef.current(incoming),
                });
              }
            }
          } else if (payload.eventType === 'UPDATE' && payload.new) {
            const updated = payload.new as any;
            setLeadsState((prev) => ({
              ...prev,
              data: prev.data.map((l) => (l.id === updated.id ? updated : l)),
            }));
            if (selectedLeadRef.current?.id === updated.id) {
              setSelectedLead((prev: any) => (prev ? { ...prev, ...updated } : prev));
            }
            onLeadsMutated?.();
          } else if (payload.eventType === 'DELETE' && payload.old) {
            const deletedId = (payload.old as any).id;
            setLeadsState((prev) => ({
              ...prev,
              data: prev.data.filter((l) => l.id !== deletedId),
            }));
            if (selectedLeadRef.current?.id === deletedId) {
              setSelectedLead(null);
            }
            onLeadsMutated?.();
          }
        }
      )
      .subscribe();

    const pollInterval = setInterval(() => {
      fetchLeads(true);
    }, 20000);

    return () => {
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
  }, [fetchLeads, onLeadsMutated, showToast]);

  // Open a specific lead if requested (e.g. from duplicate lead warning)
  useEffect(() => {
    if (!openLeadId || leadsState.loading) return;
    const found = leadsState.data.find((l) => l.id === openLeadId);
    if (found) {
      handleSelectLead(found);
      onClearOpenLeadId?.();
    } else {
      supabase
        .from('leads')
        .select('*')
        .eq('id', openLeadId)
        .single()
        .then(({ data }) => {
          if (data) {
            handleSelectLead(data);
          }
          onClearOpenLeadId?.();
        });
    }
  }, [openLeadId, leadsState.loading]);

  const autoSaveFields = async (leadId: string, patch: Record<string, any>) => {
    setAutoSaveState('saving');
    const existing = leadsState.data.find((l) => l.id === leadId) || selectedLeadRef.current || {};
    const dbPatch: Record<string, any> = { ...patch };

    if ('business_name' in patch && 'hotel_name' in existing) {
      dbPatch.hotel_name = patch.business_name;
    }
    if ('full_name' in patch && 'contact_name' in existing) {
      dbPatch.contact_name = patch.full_name;
    }
    if ('city' in patch && 'website_or_city' in existing) {
      dbPatch.website_or_city = patch.city;
    }
    if ('interested_in' in patch && 'service_interest' in existing) {
      dbPatch.service_interest = patch.interested_in;
    }
    if ('source' in patch && 'lead_source' in existing) {
      dbPatch.lead_source = patch.source;
    }
    if ('status' in patch && 'pipeline_stage' in existing) {
      dbPatch.pipeline_stage = patch.status === 'New' ? 'New Lead' : patch.status;
    }

    const { error } = await supabase.from('leads').update(dbPatch).eq('id', leadId);
    if (error) {
      setAutoSaveState('idle');
      showToast('Could not save change: ' + error.message, 'error');
      return;
    }

    setLeadsState((prev) => ({
      ...prev,
      data: prev.data.map((l) => (l.id === leadId ? { ...l, ...dbPatch } : l)),
    }));
    setSelectedLead((prev: any) => (prev && prev.id === leadId ? { ...prev, ...dbPatch } : prev));
    setAutoSaveState('saved');
    onLeadsMutated?.();
    setTimeout(() => {
      setAutoSaveState((curr) => (curr === 'saved' ? 'idle' : curr));
    }, 1800);
  };

  const handleMoveLeadStage = async (lead: any, targetStage: string) => {
    const currentStage = getLeadPipelineStage(lead);
    if (currentStage === targetStage) return;

    const legacyStatus = stageToLegacyStatus(targetStage);
    const localPatch: Record<string, any> = { status: legacyStatus, pipeline_stage: targetStage };

    setLeadsState((prev) => ({
      ...prev,
      data: prev.data.map((l) => (l.id === lead.id ? { ...l, ...localPatch } : l)),
    }));
    if (selectedLeadRef.current?.id === lead.id) {
      setSelectedLead((prev: any) => (prev ? { ...prev, ...localPatch } : prev));
    }

    const dbPatch: Record<string, any> = { status: legacyStatus };
    if ('pipeline_stage' in lead) {
      dbPatch.pipeline_stage = targetStage;
    }

    const { error } = await supabase.from('leads').update(dbPatch).eq('id', lead.id);
    if (error) {
      showToast('Could not move lead: ' + error.message, 'error');
      fetchLeads(true);
      return;
    }
    showToast(`Moved to ${targetStage}`, 'success');
    onLeadsMutated?.();
  };

  const updateLocalField = (field: string, value: any) => {
    setSelectedLead((prev: any) => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleToggleSideInterest = (chip: string) => {
    if (!selectedLead) return;
    const current = parseInterests(getLeadInterest(selectedLead));
    const next = current.includes(chip)
      ? current.filter((item) => item !== chip)
      : [...current, chip];
    const nextStr = next.length > 0 ? next.join(', ') : null;
    updateLocalField('interested_in', nextStr);
    updateLocalField('service_interest', nextStr);
    autoSaveFields(selectedLead.id, { interested_in: nextStr });
  };

  const handleSaveActivityNote = async () => {
    if (!selectedLead) return;
    if (newNote.trim()) {
      const { error } = await supabase.from('lead_activities').insert({
        lead_id: selectedLead.id,
        type: 'Note',
        outcome: 'Updated',
        note: newNote.trim(),
      });
      if (error) {
        showToast('Could not save note: ' + error.message, 'error');
        return;
      }
      setNewNote('');
      showToast('Note added', 'success');
      handleSelectLead(selectedLead);
    } else {
      await autoSaveFields(selectedLead.id, {
        status: selectedLead.status || 'New',
        follow_up_date: selectedLead.follow_up_date || null,
        notes: selectedLead.notes || null,
      });
      showToast('Lead updated successfully', 'success');
    }
  };

  const handleMarkAsDone = async () => {
    if (!selectedLead) return;
    await supabase.from('lead_activities').insert({
      lead_id: selectedLead.id,
      type: 'Follow-up',
      outcome: 'Completed',
      note: newNote.trim() || 'Marked follow-up as done',
    });
    setNewNote('');
    showToast('Follow-up marked as done', 'success');
    fetchLeads();
    handleSelectLead(selectedLead);
  };

  const handleConvertToClientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead) return;

    const fee = monthlyFee ? Number(monthlyFee) : Number(selectedLead.deal_value) || 45000;
    const leadBiz = getLeadHotelName(selectedLead);
    const leadContact = getLeadContactName(selectedLead) || null;
    const leadLoc = getLeadLocation(selectedLead);
    const leadSrc = getLeadSourceValue(selectedLead);

    const { data: clientData, error: clientError } = await supabase
      .from('clients')
      .insert({
        lead_id: selectedLead.id,
        business_name: leadBiz,
        contact_name: leadContact,
        phone: selectedLead.phone,
        email: selectedLead.email,
        city: leadLoc || null,
        business_type: selectedLead.business_type || 'Hotel',
        instagram: selectedLead.instagram,
        website: selectedLead.landing_page || (leadLoc?.includes('.') ? leadLoc : null),
        package: clientPackage,
        monthly_fee: fee,
        contract_start: contractStart,
        renewal_date: renewalDate,
        status: 'Onboarding',
        source: leadSrc,
        notes: selectedLead.notes || selectedLead.message || null,
      })
      .select()
      .single();

    if (clientError || !clientData) {
      showToast('Error converting lead: ' + (clientError?.message || ''), 'error');
      return;
    }

    const wonPatch: Record<string, any> = { status: 'Won' };
    if ('pipeline_stage' in selectedLead) wonPatch.pipeline_stage = 'Won';
    await supabase.from('leads').update(wonPatch).eq('id', selectedLead.id);
    await supabase.from('lead_activities').insert({
      lead_id: selectedLead.id,
      type: 'Converted',
      outcome: 'Won',
      note: `Converted to Client (${clientPackage} package, ₹${fee}/mo)`,
    });
    await supabase.from('client_activities').insert({
      client_id: clientData.id,
      type: 'Client Created',
      note: `Client created from lead ${leadBiz}`,
    });

    setIsConvertModalOpen(false);
    setSelectedLead(null);
    showToast('Lead successfully converted to Client!', 'success');
    fetchLeads();
    onLeadsMutated?.();
    onOpenClientProfile(clientData.id);
  };

  const handleDeleteLead = async (leadId: string) => {
    if (!confirm('Are you sure you want to delete this lead?')) return;
    await supabase.from('leads').delete().eq('id', leadId);
    if (selectedLead?.id === leadId) setSelectedLead(null);
    showToast('Lead deleted', 'success');
    fetchLeads();
    onLeadsMutated?.();
  };

  const leads = leadsState.data;
  const filteredLeads = leads.filter((l) => {
    const q = searchQuery.toLowerCase();
    const hotelName = getLeadHotelName(l).toLowerCase();
    const contactName = getLeadContactName(l).toLowerCase();
    const location = getLeadLocation(l).toLowerCase();
    const service = getLeadInterest(l).toLowerCase();
    const matchesSearch =
      hotelName.includes(q) ||
      contactName.includes(q) ||
      location.includes(q) ||
      service.includes(q) ||
      (l.area || '').toLowerCase().includes(q) ||
      (l.phone || '').toLowerCase().includes(q) ||
      (l.email || '').toLowerCase().includes(q) ||
      (l.instagram || '').toLowerCase().includes(q);

    const stageVal = getLeadPipelineStage(l);
    const matchesStatus =
      statusFilter === 'ALL' ||
      l.status === statusFilter ||
      stageVal === statusFilter ||
      (statusFilter === 'New' && stageVal === 'New Lead');
    const sourceVal = getLeadSourceValue(l);
    const matchesSource = sourceFilter === 'ALL' || sourceVal === sourceFilter;
    const matchesType = typeFilter === 'ALL' || l.business_type === typeFilter;

    return matchesSearch && matchesStatus && matchesSource && matchesType;
  });

  const handleExportCSV = () => {
    const headers = [
      'Business Name',
      'Business Type',
      'City / Website',
      'Area',
      'Outlets',
      'Instagram',
      'Contact Person',
      'Designation',
      'Phone',
      'Email',
      'Source',
      'Referred by',
      'Interested in',
      'Est. Monthly Budget (INR)',
      'Status',
      'Follow-up Date',
      'Follow-up Type',
      'Notes',
      'Created At',
    ];

    const csvCell = (val: unknown) => {
      if (val === null || val === undefined) return '"-"';
      const str = String(val).trim();
      if (!str) return '"-"';
      return `"${str.replace(/"/g, '""')}"`;
    };

    const rows = filteredLeads.map((l) => [
      csvCell(getLeadHotelName(l)),
      csvCell(l.business_type),
      csvCell(getLeadLocation(l)),
      csvCell(l.area),
      csvCell(l.outlets),
      csvCell(cleanInstagramHandle(l.instagram)),
      csvCell(getLeadContactName(l)),
      csvCell(l.designation),
      csvCell(formatIndianPhone(l.phone)),
      csvCell(l.email),
      csvCell(getLeadSourceValue(l)),
      csvCell(l.referred_by),
      csvCell(getLeadInterest(l)),
      csvCell(l.deal_value !== null && l.deal_value !== undefined ? l.deal_value : null),
      csvCell(getLeadPipelineStage(l)),
      csvCell(l.follow_up_date),
      csvCell(l.next_follow_up_type),
      csvCell(l.notes || l.message),
      csvCell(l.created_at ? formatDate(l.created_at) : null),
    ]);

    const csvString = [headers.map(csvCell).join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `HotelStory_Leads_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Leads exported to CSV', 'success');
  };

  const uniqueSources = Array.from(
    new Set<string>([
      ...LEAD_SOURCE_FILTER_PRESETS,
      ...leads.map((l) => getLeadSourceValue(l)).filter(Boolean),
    ])
  );
  const uniqueTypes = Array.from(new Set(leads.map((l) => l.business_type).filter(Boolean)));

  const selectedInterests = selectedLead ? parseInterests(getLeadInterest(selectedLead)) : [];
  const unreadWebsiteCount = leads.filter(
    (l) => isLeadUnreadFlag(l) && getLeadSourceValue(l) === 'Website Lead'
  ).length;

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans']">Leads Pipeline</h1>
            {unreadWebsiteCount > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-teal-50 border border-teal-200 text-[11px] font-semibold text-teal-800">
                <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
                {unreadWebsiteCount} new website {unreadWebsiteCount === 1 ? 'lead' : 'leads'}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500">Manage hospitality inquiries from your website and social media channels.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <div className="inline-flex rounded-xl bg-white border border-[#E5ECF6] p-1 shadow-2xs">
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'kanban'
                  ? 'bg-[#1D4ED8] text-white shadow-xs'
                  : 'text-slate-600 hover:text-[#0A1F5C]'
              }`}
            >
              <Columns3 className="w-3.5 h-3.5" />
              <span>Board</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'table'
                  ? 'bg-[#1D4ED8] text-white shadow-xs'
                  : 'text-slate-600 hover:text-[#0A1F5C]'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span>Table</span>
            </button>
          </div>

          <button
            onClick={handleExportCSV}
            disabled={leadsState.loading || filteredLeads.length === 0}
            className="tactile-btn-secondary px-4 py-2.5 text-xs flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            <Download className="w-4 h-4 text-[#1D4ED8]" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="tactile-btn-primary px-4 py-2.5 text-xs flex items-center justify-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Add Lead</span>
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-2xl border border-[#E5ECF6] shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search hotel, contact, city, website..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-[#E5ECF6] rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by pipeline stage"
            className="px-3 py-2 bg-slate-50 border border-[#E5ECF6] rounded-xl text-xs font-medium text-slate-700 focus:outline-none"
          >
            <option value="ALL">All Stages</option>
            {PIPELINE_COLUMNS.map((col) => (
              <option key={col.stage} value={col.stage}>
                {col.stage}
              </option>
            ))}
          </select>

          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            aria-label="Filter by lead source"
            className="px-3 py-2 bg-slate-50 border border-[#E5ECF6] rounded-xl text-xs font-medium text-slate-700 focus:outline-none"
          >
            <option value="ALL">All Sources</option>
            {uniqueSources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="Filter by business type"
            className="px-3 py-2 bg-slate-50 border border-[#E5ECF6] rounded-xl text-xs font-medium text-slate-700 focus:outline-none"
          >
            <option value="ALL">All Business Types</option>
            {uniqueTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Pipeline View (Kanban Board or Table) */}
      {leadsState.loading ? (
        <SkeletonTable />
      ) : leadsState.error ? (
        <ErrorCard
          title="Leads Pipeline"
          error={leadsState.error}
          isMissingTable={leadsState.isMissingTable}
          onRetry={() => fetchLeads()}
        />
      ) : viewMode === 'kanban' ? (
        <div className="flex gap-4 overflow-x-auto pb-4 items-start">
          {PIPELINE_COLUMNS.map((col) => {
            const colLeads = filteredLeads.filter(
              (l) => getLeadPipelineStage(l) === col.stage
            );
            const colTotal = colLeads.reduce((sum, l) => sum + (Number(l.deal_value) || 0), 0);
            const isDropTarget = dragOverStage === col.stage;

            return (
              <div
                key={col.stage}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragOverStage !== col.stage) setDragOverStage(col.stage);
                }}
                onDragLeave={() => {
                  if (dragOverStage === col.stage) setDragOverStage(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverStage(null);
                  const id = e.dataTransfer.getData('text/plain') || draggedLeadId;
                  setDraggedLeadId(null);
                  if (!id) return;
                  const targetLead = leads.find((item) => item.id === id);
                  if (targetLead) {
                    handleMoveLeadStage(targetLead, col.stage);
                  }
                }}
                className={`w-[290px] shrink-0 rounded-2xl border transition-colors flex flex-col max-h-[calc(100vh-280px)] ${
                  isDropTarget
                    ? 'bg-blue-50/70 border-[#1D4ED8]'
                    : 'bg-[#EEF3FB]/70 border-[#DCEBFF]'
                }`}
              >
                {/* Column Header */}
                <div className="p-3.5 border-b border-[#DCEBFF] bg-white rounded-t-2xl flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${col.dotColor}`} />
                    <h2 className="text-xs font-bold text-[#0A1F5C] truncate">{col.stage}</h2>
                    <span className="px-2 py-0.5 rounded-full bg-[#F2F7FF] border border-[#DCEBFF] text-[11px] font-bold text-[#1D4ED8] tabular-nums">
                      {colLeads.length}
                    </span>
                  </div>
                  {colTotal > 0 && (
                    <span className="text-[11px] font-semibold text-slate-500 tabular-nums shrink-0">
                      {formatINR(colTotal)}
                    </span>
                  )}
                </div>

                {/* Column Cards */}
                <div className="p-2.5 space-y-2.5 overflow-y-auto flex-1 min-h-[140px]">
                  {colLeads.length === 0 ? (
                    <div className="py-8 px-3 text-center text-[11px] text-slate-400 border border-dashed border-[#DCEBFF] rounded-xl bg-white/50">
                      No leads in {col.stage}
                    </div>
                  ) : (
                    colLeads.map((lead) => {
                      const hotel = getLeadHotelName(lead);
                      const contact = getLeadContactName(lead);
                      const sourceVal = getLeadSourceValue(lead);
                      const isWebsiteLead = sourceVal.toLowerCase() === 'website lead';
                      const location = getLeadLocation(lead);
                      const interest = getLeadInterest(lead);
                      const unread = isLeadUnreadFlag(lead);

                      return (
                        <div
                          key={lead.id}
                          draggable
                          onDragStart={(e) => {
                            setDraggedLeadId(lead.id);
                            e.dataTransfer.setData('text/plain', lead.id);
                          }}
                          onDragEnd={() => {
                            setDraggedLeadId(null);
                            setDragOverStage(null);
                          }}
                          onClick={() => handleSelectLead(lead)}
                          className={`bg-white p-3.5 rounded-xl border transition-all cursor-pointer group space-y-2.5 shadow-2xs hover:shadow-md ${
                            unread && isWebsiteLead
                              ? 'border-teal-300 ring-1 ring-teal-500/20'
                              : 'border-[#E5ECF6] hover:border-[#1D4ED8]'
                          }`}
                        >
                          {/* Top row: Source badge + New dot */}
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold border text-[10px] ${getSourceBadgeStyle(
                                sourceVal
                              )}`}
                            >
                              {isWebsiteLead && <Globe className="w-2.5 h-2.5 shrink-0" />}
                              <span>{sourceVal}</span>
                            </span>
                            {unread && (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-[10px] font-bold text-[#1D4ED8]"
                                title="Unread lead"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-[#1D4ED8] animate-pulse" />
                                New
                              </span>
                            )}
                          </div>

                          {/* Title & Contact */}
                          <div>
                            <h3 className="text-xs font-bold text-[#0A1F5C] group-hover:text-[#1D4ED8] truncate">
                              {hotel}
                            </h3>
                            <p className="text-[11px] text-slate-500 truncate mt-0.5">
                              {contact || 'No contact name'}
                              {lead.business_type ? ` • ${lead.business_type}` : ''}
                            </p>
                          </div>

                          {/* City/Website & Service Interest */}
                          {(location || interest) && (
                            <div className="space-y-1">
                              {location && (
                                <p className="text-[11px] text-slate-500 flex items-center gap-1 truncate">
                                  <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                                  <span className="truncate">{location}</span>
                                </p>
                              )}
                              {interest && (
                                <p className="text-[11px] text-[#1D4ED8] bg-[#F2F7FF] border border-[#DCEBFF] rounded-lg px-2 py-1 truncate font-medium">
                                  {interest}
                                </p>
                              )}
                            </div>
                          )}

                          {/* Bottom row: Deal value / Date & quick actions */}
                          <div
                            className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="text-[11px] text-slate-500 tabular-nums truncate">
                              {lead.deal_value ? (
                                <span className="font-bold text-[#0A1F5C]">
                                  {formatINR(lead.deal_value)}
                                </span>
                              ) : (
                                <span>{lead.created_at ? formatDate(lead.created_at) : '-'}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {lead.phone && (
                                <>
                                  <a
                                    href={`tel:${lead.phone}`}
                                    className="p-1 rounded-lg bg-blue-50 text-[#1D4ED8] hover:bg-blue-100 transition-all"
                                    title="Call"
                                  >
                                    <Phone className="w-3 h-3" />
                                  </a>
                                  <a
                                    href={`https://wa.me/${String(lead.phone).replace(/\D/g, '')}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-all"
                                    title="WhatsApp"
                                  >
                                    <MessageCircle className="w-3 h-3" />
                                  </a>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-[#E5ECF6] shadow-xs overflow-hidden">
          {filteredLeads.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <Building2 className="w-12 h-12 text-slate-300 mx-auto" />
              <p className="text-slate-600 font-medium">No leads found.</p>
              <p className="text-xs text-slate-400">Try adjusting filters or add a new lead.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-[#E5ECF6] text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="py-3.5 px-4">Business & Contact</th>
                    <th className="py-3.5 px-4">City / Website</th>
                    <th className="py-3.5 px-4">Source</th>
                    <th className="py-3.5 px-4">Stage</th>
                    <th className="py-3.5 px-4">Follow-up</th>
                    <th className="py-3.5 px-4">Deal Value</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredLeads.map((lead) => {
                    const hotel = getLeadHotelName(lead);
                    const contact = getLeadContactName(lead);
                    const sourceVal = getLeadSourceValue(lead);
                    const isWebsiteLead = sourceVal.toLowerCase() === 'website lead';
                    const location = getLeadLocation(lead);
                    const stageVal = getLeadPipelineStage(lead);
                    const unread = isLeadUnreadFlag(lead);

                    return (
                      <tr
                        key={lead.id}
                        onClick={() => handleSelectLead(lead)}
                        className="hover:bg-blue-50/40 cursor-pointer transition-colors h-[52px]"
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 rounded-full bg-blue-100 text-[#1D4ED8] font-bold text-xs flex items-center justify-center shrink-0 relative">
                              {hotel.charAt(0).toUpperCase()}
                              {unread && (
                                <span
                                  className="w-2.5 h-2.5 rounded-full bg-[#1D4ED8] border-2 border-white absolute -top-0.5 -right-0.5"
                                  title="New unread lead"
                                />
                              )}
                            </div>
                            <div>
                              <div className="font-semibold text-[#0A1F5C] text-xs flex items-center gap-1.5">
                                <span>{hotel}</span>
                                {unread && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-[10px] font-bold text-[#1D4ED8]">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#1D4ED8]" />
                                    New
                                  </span>
                                )}
                              </div>
                              <div className="text-slate-400 text-[11px]">
                                {contact || '-'} • {lead.business_type || getLeadInterest(lead) || '-'}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          {location || '-'}
                          {lead.area ? `, ${lead.area}` : ''}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-semibold border text-[10px] ${getSourceBadgeStyle(
                              sourceVal
                            )}`}
                          >
                            {isWebsiteLead && <Globe className="w-2.5 h-2.5 shrink-0" />}
                            <span>{sourceVal}</span>
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2.5 py-0.5 rounded-full font-semibold border text-[10px] ${getStatusBadgeStyle(
                              lead.status || stageVal
                            )}`}
                          >
                            {stageVal}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          {lead.follow_up_date ? formatDate(lead.follow_up_date) : '-'}
                        </td>
                        <td className="py-3 px-4 font-semibold text-[#0A1F5C] tabular-nums">
                          {lead.deal_value ? formatINR(lead.deal_value) : '-'}
                        </td>
                        <td
                          className="py-3 px-4 text-right space-x-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {lead.phone && (
                            <>
                              <a
                                href={`tel:${lead.phone}`}
                                className="inline-flex p-1.5 rounded-lg bg-blue-50 text-[#1D4ED8] hover:bg-blue-100 transition-all"
                                title="Call"
                              >
                                <Phone className="w-3.5 h-3.5" />
                              </a>
                              <a
                                href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-all"
                                title="WhatsApp"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                              </a>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Slide-over Detail Panel (560px) */}
      {selectedLead && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex justify-end"
          onClick={() => setSelectedLead(null)}
        >
          <div
            className="w-full max-w-[560px] bg-white h-full shadow-2xl overflow-y-auto p-6 space-y-6 flex flex-col justify-between animate-slide-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-start justify-between border-b border-slate-100 pb-4 gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-semibold border text-[10px] ${getSourceBadgeStyle(
                        getLeadSourceValue(selectedLead)
                      )}`}
                    >
                      {getLeadSourceValue(selectedLead).toLowerCase() === 'website lead' && (
                        <Globe className="w-2.5 h-2.5 shrink-0" />
                      )}
                      <span>{getLeadSourceValue(selectedLead)}</span>
                    </span>
                    {autoSaveState === 'saving' && (
                      <span className="text-[11px] text-slate-400 font-medium">Saving...</span>
                    )}
                    {autoSaveState === 'saved' && (
                      <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        Saved
                      </span>
                    )}
                  </div>
                  <h2 className="text-xl font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans'] mt-1 truncate">
                    {getLeadHotelName(selectedLead)}
                  </h2>
                </div>
                <div className="flex items-center space-x-1.5 shrink-0">
                  <button
                    onClick={() => handleDeleteLead(selectedLead.id)}
                    className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl"
                    title="Delete Lead"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setSelectedLead(null)}
                    className="p-2 text-slate-400 hover:text-slate-600 rounded-xl"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Convert Banner */}
              {getLeadPipelineStage(selectedLead) !== 'Won' && (
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-2xl border border-blue-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-[#0A1F5C]">Ready to close this deal?</p>
                    <p className="text-[11px] text-slate-500">
                      Create a commercial proposal or convert to client.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onCreateProposal('lead', selectedLead.id)}
                      className="px-3 py-2 bg-white border border-[#1D4ED8] text-[#1D4ED8] hover:bg-blue-50 rounded-xl text-xs font-semibold shadow-2xs transition-all"
                    >
                      Create Proposal
                    </button>
                    <button
                      onClick={() => setIsConvertModalOpen(true)}
                      className="px-4 py-2 bg-[#1D4ED8] hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-500/20 flex items-center space-x-1.5 transition-all"
                    >
                      <span>Convert</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Status & Follow-up (Auto-save) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-600 uppercase">Status</label>
                  <select
                    value={stageToLegacyStatus(getLeadPipelineStage(selectedLead))}
                    onChange={(e) => {
                      const val = e.target.value;
                      updateLocalField('status', val);
                      updateLocalField('pipeline_stage', val === 'New' ? 'New Lead' : val);
                      autoSaveFields(selectedLead.id, { status: val });
                    }}
                    className="w-full px-3 py-2 bg-white border border-[#E5ECF6] rounded-xl text-xs font-medium text-slate-800"
                  >
                    {LEAD_STATUS_OPTIONS.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-600 uppercase">
                    Follow-up Date
                  </label>
                  <input
                    type="date"
                    value={selectedLead.follow_up_date || ''}
                    onChange={(e) => {
                      const val = e.target.value || null;
                      updateLocalField('follow_up_date', val);
                      autoSaveFields(selectedLead.id, { follow_up_date: val });
                    }}
                    className="w-full px-3 py-2 bg-white border border-[#E5ECF6] rounded-xl text-xs font-medium text-slate-800"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-600 uppercase">
                    Follow-up Type
                  </label>
                  <select
                    value={selectedLead.next_follow_up_type || ''}
                    onChange={(e) => {
                      const val = e.target.value || null;
                      updateLocalField('next_follow_up_type', val);
                      autoSaveFields(selectedLead.id, { next_follow_up_type: val });
                    }}
                    className="w-full px-3 py-2 bg-white border border-[#E5ECF6] rounded-xl text-xs font-medium text-slate-800"
                  >
                    <option value="">-</option>
                    {FOLLOW_UP_TYPE_OPTIONS.map((ft) => (
                      <option key={ft} value={ft}>
                        {ft}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Editable Business & Contact Information (Auto-save) */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Business & Contact Details
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-500">Contact Person</label>
                    <input
                      type="text"
                      value={selectedLead.full_name ?? selectedLead.contact_name ?? ''}
                      onChange={(e) => {
                        updateLocalField('full_name', e.target.value);
                        updateLocalField('contact_name', e.target.value);
                      }}
                      onBlur={(e) =>
                        autoSaveFields(selectedLead.id, {
                          full_name: e.target.value.trim() || null,
                        })
                      }
                      placeholder="-"
                      className="w-full px-3 py-2 bg-[#F6F8FC] border border-[#E5ECF6] rounded-xl text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-500">Designation</label>
                    <select
                      value={selectedLead.designation || ''}
                      onChange={(e) => {
                        const val = e.target.value || null;
                        updateLocalField('designation', val);
                        autoSaveFields(selectedLead.id, { designation: val });
                      }}
                      className="w-full px-3 py-2 bg-[#F6F8FC] border border-[#E5ECF6] rounded-xl text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                    >
                      <option value="">-</option>
                      {DESIGNATION_OPTIONS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-500">
                      Phone / WhatsApp
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="tel"
                        value={selectedLead.phone || ''}
                        onChange={(e) => updateLocalField('phone', e.target.value)}
                        onBlur={(e) => {
                          const formatted = e.target.value.trim()
                            ? formatIndianPhone(e.target.value)
                            : null;
                          updateLocalField('phone', formatted || '');
                          autoSaveFields(selectedLead.id, { phone: formatted });
                        }}
                        placeholder="-"
                        className="w-full px-3 py-2 bg-[#F6F8FC] border border-[#E5ECF6] rounded-xl text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                      />
                      {selectedLead.phone && (
                        <a
                          href={`https://wa.me/${String(selectedLead.phone).replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 shrink-0"
                          title="WhatsApp"
                        >
                          <MessageCircle className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-500">Email</label>
                    <div className="relative">
                      <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                      <input
                        type="email"
                        value={selectedLead.email || ''}
                        onChange={(e) => updateLocalField('email', e.target.value)}
                        onBlur={(e) =>
                          autoSaveFields(selectedLead.id, {
                            email: e.target.value.trim() || null,
                          })
                        }
                        placeholder="-"
                        className="w-full pl-8 pr-3 py-2 bg-[#F6F8FC] border border-[#E5ECF6] rounded-xl text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-500">Business Type</label>
                    <select
                      value={selectedLead.business_type || ''}
                      onChange={(e) => {
                        const val = e.target.value || null;
                        updateLocalField('business_type', val);
                        autoSaveFields(selectedLead.id, { business_type: val });
                      }}
                      className="w-full px-3 py-2 bg-[#F6F8FC] border border-[#E5ECF6] rounded-xl text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                    >
                      <option value="">-</option>
                      {BUSINESS_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-500">Outlets</label>
                    <select
                      value={selectedLead.outlets || ''}
                      onChange={(e) => {
                        const val = e.target.value || null;
                        updateLocalField('outlets', val);
                        autoSaveFields(selectedLead.id, { outlets: val });
                      }}
                      className="w-full px-3 py-2 bg-[#F6F8FC] border border-[#E5ECF6] rounded-xl text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                    >
                      <option value="">-</option>
                      {OUTLET_OPTIONS.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-500">City / Website</label>
                    <input
                      type="text"
                      value={selectedLead.city ?? selectedLead.website_or_city ?? ''}
                      onChange={(e) => {
                        updateLocalField('city', e.target.value);
                        updateLocalField('website_or_city', e.target.value);
                      }}
                      onBlur={(e) =>
                        autoSaveFields(selectedLead.id, {
                          city: e.target.value.trim() || null,
                        })
                      }
                      placeholder="-"
                      className="w-full px-3 py-2 bg-[#F6F8FC] border border-[#E5ECF6] rounded-xl text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-500">
                      Area / Locality
                    </label>
                    <input
                      type="text"
                      value={selectedLead.area || ''}
                      onChange={(e) => updateLocalField('area', e.target.value)}
                      onBlur={(e) =>
                        autoSaveFields(selectedLead.id, {
                          area: e.target.value.trim() || null,
                        })
                      }
                      placeholder="-"
                      className="w-full px-3 py-2 bg-[#F6F8FC] border border-[#E5ECF6] rounded-xl text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-500">Instagram</label>
                    <div className="relative">
                      <Instagram className="w-3.5 h-3.5 text-pink-500 absolute left-3 top-2.5 pointer-events-none" />
                      <input
                        type="text"
                        value={selectedLead.instagram || ''}
                        onChange={(e) => updateLocalField('instagram', e.target.value)}
                        onBlur={(e) => {
                          const cleaned = cleanInstagramHandle(e.target.value) || null;
                          updateLocalField('instagram', cleaned || '');
                          autoSaveFields(selectedLead.id, { instagram: cleaned });
                        }}
                        placeholder="-"
                        className="w-full pl-8 pr-3 py-2 bg-[#F6F8FC] border border-[#E5ECF6] rounded-xl text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-500">
                      Est. Monthly Budget (₹)
                    </label>
                    <input
                      type="number"
                      value={selectedLead.deal_value ?? ''}
                      onChange={(e) => updateLocalField('deal_value', e.target.value)}
                      onBlur={(e) => {
                        const raw = String(e.target.value).trim();
                        const num = raw ? Number(raw) : null;
                        autoSaveFields(selectedLead.id, { deal_value: num });
                      }}
                      placeholder="-"
                      className="w-full px-3 py-2 bg-[#F6F8FC] border border-[#E5ECF6] rounded-xl text-slate-800 font-semibold tabular-nums focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-500">Source</label>
                    <select
                      value={selectedLead.source || selectedLead.lead_source || ''}
                      onChange={(e) => {
                        const val = e.target.value || null;
                        updateLocalField('source', val);
                        updateLocalField('lead_source', val);
                        autoSaveFields(selectedLead.id, { source: val });
                      }}
                      className="w-full px-3 py-2 bg-[#F6F8FC] border border-[#E5ECF6] rounded-xl text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                    >
                      <option value="">-</option>
                      {Array.from(new Set(['Website Lead', 'Manual', ...SOURCE_OPTIONS])).map((src) => (
                        <option key={src} value={src}>
                          {src}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-500">Referred by</label>
                    <input
                      type="text"
                      value={selectedLead.referred_by || ''}
                      onChange={(e) => updateLocalField('referred_by', e.target.value)}
                      onBlur={(e) =>
                        autoSaveFields(selectedLead.id, {
                          referred_by: e.target.value.trim() || null,
                        })
                      }
                      placeholder="-"
                      className="w-full px-3 py-2 bg-[#F6F8FC] border border-[#E5ECF6] rounded-xl text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                    />
                  </div>
                </div>

                {/* Interested In (Multi-select chips with auto-save) */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold text-slate-500">
                      Interested in
                    </label>
                    <span className="text-[11px] text-slate-400">
                      {selectedLead.interested_in || '-'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {INTEREST_OPTIONS.map((chip) => {
                      const active = selectedInterests.includes(chip);
                      return (
                        <button
                          key={chip}
                          type="button"
                          onClick={() => handleToggleSideInterest(chip)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all ${
                            active
                              ? 'bg-[#1D4ED8] text-white border-[#1D4ED8]'
                              : 'bg-[#F6F8FC] text-slate-600 border-[#E5ECF6] hover:border-[#3B82F6] hover:text-[#1D4ED8]'
                          }`}
                        >
                          {chip}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Notes (auto-save on blur) */}
                <div className="space-y-1 pt-1">
                  <label className="text-[11px] font-semibold text-slate-500">Lead Notes</label>
                  <textarea
                    rows={2}
                    value={selectedLead.notes || ''}
                    onChange={(e) => updateLocalField('notes', e.target.value)}
                    onBlur={(e) =>
                      autoSaveFields(selectedLead.id, {
                        notes: e.target.value.trim() || null,
                      })
                    }
                    placeholder="-"
                    className="w-full p-2.5 bg-[#F6F8FC] border border-[#E5ECF6] rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                  />
                </div>

                {selectedLead.message && (
                  <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
                    <p className="font-semibold mb-1">Original Inquiry Message:</p>
                    <p className="italic">"{selectedLead.message}"</p>
                  </div>
                )}
              </div>

              {/* Activity Timeline & Notes */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Activity Timeline & Notes
                </h3>
                <div className="space-y-2">
                  <textarea
                    rows={2}
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Type note or call summary..."
                    className="w-full p-3 bg-slate-50 border border-[#E5ECF6] rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={handleMarkAsDone}
                      className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-semibold transition-all"
                    >
                      Mark as Done
                    </button>
                    <button
                      onClick={handleSaveActivityNote}
                      className="px-4 py-1.5 bg-[#1D4ED8] hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-all shadow-xs"
                    >
                      Save Changes
                    </button>
                  </div>
                </div>

                <div className="space-y-2 mt-4 max-h-48 overflow-y-auto pr-1">
                  {leadActivities.map((act) => (
                    <div
                      key={act.id}
                      className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1"
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-[#0A1F5C]">
                          {act.type} ({act.outcome})
                        </span>
                        <span className="text-slate-400">{formatDate(act.created_at)}</span>
                      </div>
                      <p className="text-xs text-slate-600">{act.note}</p>
                    </div>
                  ))}
                  {leadActivities.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-4">
                      No activities logged yet.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setSelectedLead(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-medium"
              >
                Close Panel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upgraded Add New Lead Modal */}
      <AddLeadModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        existingLeads={leads}
        onLeadCreated={(newLead) => {
          setLeadsState((prev) => ({
            ...prev,
            data: [newLead, ...prev.data.filter((l) => l.id !== newLead.id)],
          }));
          fetchLeads();
          onLeadsMutated?.();
        }}
        onOpenExistingLead={(existing) => {
          const full = leads.find((l) => l.id === existing.id) || existing;
          handleSelectLead(full);
        }}
        onViewLead={(newLead) => {
          handleSelectLead(newLead);
        }}
      />

      {/* Convert Modal */}
      {isConvertModalOpen && selectedLead && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-[#E5ECF6] p-6 space-y-4 max-h-[90vh] overflow-y-auto animate-scale-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans'] text-lg">
                  Convert Lead to Client
                </h3>
                <p className="text-xs text-slate-500">{getLeadHotelName(selectedLead)}</p>
              </div>
              <button
                onClick={() => setIsConvertModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConvertToClientSubmit} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 uppercase">Package Tier</label>
                <select
                  value={clientPackage}
                  onChange={(e) => {
                    setClientPackage(e.target.value);
                    if (e.target.value === 'Starter') setMonthlyFee('25000');
                    if (e.target.value === 'Growth') setMonthlyFee('45000');
                    if (e.target.value === 'Dominator') setMonthlyFee('75000');
                  }}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-[#E5ECF6] rounded-xl text-slate-800 font-medium"
                >
                  <option value="Starter">Starter (8 posts, 4 reels, 12 stories)</option>
                  <option value="Growth">Growth (12 posts, 8 reels, 20 stories)</option>
                  <option value="Dominator">Dominator (16 posts, 12 reels, 30 stories)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700 uppercase">Monthly Fee (₹)</label>
                <input
                  type="number"
                  required
                  value={monthlyFee || selectedLead.deal_value || 45000}
                  onChange={(e) => setMonthlyFee(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-[#E5ECF6] rounded-xl text-slate-800 font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 uppercase">Contract Start</label>
                  <input
                    type="date"
                    required
                    value={contractStart}
                    onChange={(e) => setContractStart(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-[#E5ECF6] rounded-xl text-slate-800"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 uppercase">Renewal Date</label>
                  <input
                    type="date"
                    required
                    value={renewalDate}
                    onChange={(e) => setRenewalDate(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-[#E5ECF6] rounded-xl text-slate-800"
                  />
                </div>
              </div>

              <div className="p-3 bg-blue-50 rounded-xl text-[11px] text-blue-800">
                This will create a new client profile, mark the lead as <strong>Won</strong>, and
                log conversion activities.
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsConvertModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#1D4ED8] hover:bg-blue-700 text-white rounded-xl font-medium shadow-md shadow-blue-500/20"
                >
                  Confirm & Create Client
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
