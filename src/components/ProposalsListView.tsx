import React, { useCallback, useEffect, useRef, useState } from 'react';
import { safeQuery } from '../lib/db';
import { formatINR, formatDate } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';
import {
  FileText,
  Search,
  Plus,
  Download,
  Copy,
  MoreVertical,
  Trash2,
  Edit,
  CheckCircle2,
  XCircle,
  Send,
  Settings,
  TrendingUp,
  IndianRupee,
  Loader2,
  X,
} from 'lucide-react';
import { SkeletonTable, SkeletonCard } from './SkeletonLoader';
import ErrorCard from './ErrorCard';
import {
  getEffectiveProposalStatus,
  getProposalStatusBadgeStyle,
  fetchNextProposalNumber,
  syncLinkedLeadOnProposalSent,
  syncLinkedLeadOnProposalDeclined,
  parseNumericInput,
  normalizeDeliverables,
} from '../lib/proposalConfig';
import { downloadProposalPdf } from '../lib/proposalPdf';
import CompanySettingsModal from './CompanySettingsModal';
import ConvertProposalClientModal, {
  AcceptedProposalForClient,
} from './ConvertProposalClientModal';

interface ProposalsListViewProps {
  onOpenEditor: (
    proposalId?: string,
    prefillType?: 'lead' | 'client',
    prefillId?: string
  ) => void;
  onOpenClientProfile?: (clientId: string) => void;
  refreshKey?: number;
}

export default function ProposalsListView({
  onOpenEditor,
  onOpenClientProfile,
  refreshKey = 0,
}: ProposalsListViewProps) {
  const { showToast } = useToast();
  const [proposalsState, setProposalsState] = useState<{
    data: any[];
    error: string | null;
    isMissingTable: boolean;
    loading: boolean;
  }>({ data: [], error: null, isMissingTable: false, loading: true });

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [packageFilter, setPackageFilter] = useState('ALL');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuContainerRef = useRef<HTMLDivElement | null>(null);

  // Action modals & inline states
  const [actionBusy, setActionBusy] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [declineTarget, setDeclineTarget] = useState<any | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [acceptPromptProposal, setAcceptPromptProposal] = useState<any | null>(null);
  const [convertProposal, setConvertProposal] = useState<AcceptedProposalForClient | null>(null);

  const fetchProposals = useCallback(async () => {
    setProposalsState((prev) => ({ ...prev, loading: true }));
    try {
      const res = await safeQuery(async () => {
        const { data, error } = await supabase
          .from('proposals')
          .select('*')
          .order('created_at', { ascending: false });
        return { data: data || [], error };
      }, []);
      setProposalsState({
        data: res.data,
        error: res.error,
        isMissingTable: res.isMissingTable,
        loading: false,
      });
    } catch (err: any) {
      setProposalsState({
        data: [],
        error: err?.message || 'Could not fetch proposals.',
        isMissingTable: false,
        loading: false,
      });
    }
  }, []);

  useEffect(() => {
    fetchProposals();
  }, [fetchProposals, refreshKey]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (
        openMenuId &&
        menuContainerRef.current &&
        !menuContainerRef.current.contains(e.target as Node)
      ) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [openMenuId]);

  const handleMarkAsSent = async (prop: any) => {
    setOpenMenuId(null);
    setActionBusy(true);
    try {
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from('proposals')
        .update({ status: 'Sent', sent_at: nowIso })
        .eq('id', prop.id);

      if (error) {
        showToast('Could not mark proposal as Sent: ' + error.message, 'error');
        setActionBusy(false);
        return;
      }

      if (prop.lead_id) {
        await syncLinkedLeadOnProposalSent(prop.lead_id);
      }

      showToast(
        prop.lead_id
          ? 'Proposal marked as Sent and linked lead updated'
          : 'Proposal marked as Sent',
        'success'
      );
      await fetchProposals();
    } catch (err: any) {
      showToast(err?.message || 'Unexpected error updating proposal', 'error');
    } finally {
      setActionBusy(false);
    }
  };

  const handleMarkAsAccepted = async (prop: any) => {
    setOpenMenuId(null);
    setActionBusy(true);
    try {
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from('proposals')
        .update({ status: 'Accepted', accepted_at: nowIso })
        .eq('id', prop.id)
        .select()
        .single();

      if (error) {
        showToast('Could not mark proposal as Accepted: ' + error.message, 'error');
        setActionBusy(false);
        return;
      }

      showToast('Proposal marked as Accepted', 'success');
      setAcceptPromptProposal(data || { ...prop, status: 'Accepted', accepted_at: nowIso });
      await fetchProposals();
    } catch (err: any) {
      showToast(err?.message || 'Unexpected error accepting proposal', 'error');
    } finally {
      setActionBusy(false);
    }
  };

  const handleConfirmDeclined = async () => {
    if (!declineTarget || actionBusy) return;
    setActionBusy(true);
    try {
      const reason = declineReason.trim();
      const existingNotes = (declineTarget.notes || '').trim();
      const nextNotes = reason
        ? existingNotes
          ? `${existingNotes}\nDeclined reason: ${reason}`
          : `Declined reason: ${reason}`
        : existingNotes || null;

      const { error } = await supabase
        .from('proposals')
        .update({ status: 'Declined', notes: nextNotes })
        .eq('id', declineTarget.id);

      if (error) {
        showToast('Could not mark proposal as Declined: ' + error.message, 'error');
        setActionBusy(false);
        return;
      }

      if (declineTarget.lead_id) {
        await syncLinkedLeadOnProposalDeclined(declineTarget.lead_id, reason);
      }

      showToast(
        declineTarget.lead_id
          ? 'Proposal marked as Declined and linked lead set to Lost'
          : 'Proposal marked as Declined',
        'success'
      );
      setDeclineTarget(null);
      setDeclineReason('');
      await fetchProposals();
    } catch (err: any) {
      showToast(err?.message || 'Unexpected error declining proposal', 'error');
    } finally {
      setActionBusy(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || actionBusy) return;
    setActionBusy(true);
    try {
      const { error } = await supabase.from('proposals').delete().eq('id', deleteTarget.id);
      if (error) {
        showToast('Could not delete proposal: ' + error.message, 'error');
        setActionBusy(false);
        return;
      }
      showToast('Proposal deleted', 'success');
      setDeleteTarget(null);
      await fetchProposals();
    } catch (err: any) {
      showToast(err?.message || 'Unexpected error deleting proposal', 'error');
    } finally {
      setActionBusy(false);
    }
  };

  const handleDuplicate = async (prop: any) => {
    setOpenMenuId(null);
    setActionBusy(true);
    try {
      const nextNumber = await fetchNextProposalNumber();
      const { error } = await supabase.from('proposals').insert({
        proposal_number: nextNumber,
        lead_id: prop.lead_id || null,
        client_id: prop.client_id || null,
        business_name: `${prop.business_name || 'Untitled'} (Copy)`,
        contact_name: prop.contact_name || null,
        business_type: prop.business_type || null,
        city: prop.city || null,
        package: prop.package || 'Growth',
        intro_text: prop.intro_text || null,
        deliverables: normalizeDeliverables(prop.deliverables),
        monthly_fee: prop.monthly_fee ?? null,
        setup_fee: prop.setup_fee ?? null,
        discount: prop.discount ?? null,
        gst_enabled: prop.gst_enabled ?? true,
        gst_percent: prop.gst_percent ?? 18,
        start_date: prop.start_date || null,
        valid_until: prop.valid_until || null,
        payment_terms: prop.payment_terms || null,
        terms_text: prop.terms_text || null,
        notes: prop.notes || null,
        status: 'Draft',
        sent_at: null,
        accepted_at: null,
      });

      if (error) {
        showToast('Could not duplicate proposal: ' + error.message, 'error');
      } else {
        showToast(`Duplicated as ${nextNumber}`, 'success');
        await fetchProposals();
      }
    } catch (err: any) {
      showToast(err?.message || 'Unexpected error duplicating proposal', 'error');
    } finally {
      setActionBusy(false);
    }
  };

  const handleDownloadPdf = async (prop: any) => {
    setOpenMenuId(null);
    if (parseNumericInput(prop.monthly_fee) <= 0) {
      showToast('No price is set for this proposal. Please open it and enter the price first.', 'error');
      return;
    }
    try {
      const filename = await downloadProposalPdf(prop);
      showToast(`Downloaded ${filename}`, 'success');
    } catch (err: any) {
      showToast('Could not generate PDF: ' + (err?.message || 'Unknown error'), 'error');
    }
  };

  const proposals = proposalsState.data;

  // Summary Metrics
  const now = new Date();
  const thisMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const sentThisMonth = proposals.filter((p) => {
    const sentDate = p.sent_at || '';
    if (sentDate && sentDate.startsWith(thisMonthStr)) return true;
    return (
      !p.sent_at &&
      (p.status === 'Sent' || p.status === 'Viewed' || p.status === 'Accepted' || p.status === 'Declined') &&
      p.created_at &&
      p.created_at.startsWith(thisMonthStr)
    );
  }).length;

  const openProposalsValue = proposals
    .filter((p) => {
      const eff = getEffectiveProposalStatus(p);
      return eff === 'Sent' || eff === 'Viewed';
    })
    .reduce((sum, p) => sum + parseNumericInput(p.monthly_fee), 0);

  const acceptedThisMonth = proposals.filter(
    (p) =>
      p.status === 'Accepted' &&
      ((p.accepted_at && p.accepted_at.startsWith(thisMonthStr)) ||
        (!p.accepted_at && p.created_at && p.created_at.startsWith(thisMonthStr)))
  ).length;

  const acceptedTotal = proposals.filter((p) => p.status === 'Accepted').length;
  const decidedOrSentTotal = proposals.filter((p) => {
    const eff = getEffectiveProposalStatus(p);
    return (
      eff === 'Sent' ||
      eff === 'Viewed' ||
      eff === 'Accepted' ||
      eff === 'Declined' ||
      (eff === 'Expired' && Boolean(p.sent_at))
    );
  }).length;
  const winRate =
    decidedOrSentTotal > 0 ? `${Math.round((acceptedTotal / decidedOrSentTotal) * 100)}%` : '-';

  const filteredProposals = proposals.filter((p) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      (p.business_name || '').toLowerCase().includes(q) ||
      (p.proposal_number || '').toLowerCase().includes(q) ||
      (p.contact_name || '').toLowerCase().includes(q);

    const effectiveStatus = getEffectiveProposalStatus(p);
    const matchesStatus = statusFilter === 'ALL' || effectiveStatus === statusFilter;
    const matchesPackage = packageFilter === 'ALL' || (p.package || '') === packageFilter;

    return matchesSearch && matchesStatus && matchesPackage;
  });

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans']">
            Proposals Generator
          </h1>
          <p className="text-sm text-slate-500">
            Create hospitality proposals with editable deliverables, GST calculation, and A4 PDF export.
          </p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setSettingsModalOpen(true)}
            className="px-3.5 py-2.5 bg-white border border-[#DCEBFF] hover:bg-[#F2F7FF] text-[#0A1F5C] rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-2 shrink-0"
          >
            <Settings className="w-4 h-4 text-[#1D4ED8]" />
            <span>Company Settings</span>
          </button>
          <button
            type="button"
            onClick={() => onOpenEditor()}
            className="px-4 py-2.5 bg-[#1D4ED8] hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-sm flex items-center justify-center space-x-2 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>New Proposal</span>
          </button>
        </div>
      </div>

      {/* Convert to client banner right after Mark as Accepted */}
      {acceptPromptProposal && (
        <div className="bg-white border border-[#DCEBFF] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <p className="text-xs font-bold text-[#0A1F5C]">
                Proposal {acceptPromptProposal.proposal_number} accepted!
              </p>
              <p className="text-xs text-slate-600">
                Convert {acceptPromptProposal.business_name} to a client with package, monthly fee,
                and start date prefilled?
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAcceptPromptProposal(null)}
              className="px-3 py-1.5 bg-white border border-[#DCEBFF] text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50"
            >
              Not now
            </button>
            <button
              type="button"
              onClick={() => {
                setConvertProposal(acceptPromptProposal);
                setAcceptPromptProposal(null);
              }}
              className="px-4 py-1.5 bg-[#1D4ED8] hover:bg-blue-700 text-white rounded-xl text-xs font-semibold"
            >
              Convert to Client
            </button>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      {proposalsState.loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : proposalsState.error ? (
        <ErrorCard
          title="Proposals"
          error={proposalsState.error}
          isMissingTable={proposalsState.isMissingTable}
          onRetry={fetchProposals}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-white p-6 rounded-2xl border border-[#DCEBFF] shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Sent This Month
              </span>
              <div className="p-2 rounded-xl bg-[#F2F7FF] text-[#1D4ED8]">
                <Send className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4">
              <span className="text-3xl font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans'] tabular-nums">
                {sentThisMonth}
              </span>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-[#DCEBFF] shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Open Value
              </span>
              <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
                <IndianRupee className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4">
              <span className="text-3xl font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans'] tabular-nums">
                {formatINR(openProposalsValue)}
              </span>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-[#DCEBFF] shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Accepted This Month
              </span>
              <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4">
              <span className="text-3xl font-bold text-emerald-600 font-['Plus_Jakarta_Sans'] tabular-nums">
                {acceptedThisMonth}
              </span>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-[#DCEBFF] shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Win Rate
              </span>
              <div className="p-2 rounded-xl bg-[#F2F7FF] text-[#1D4ED8]">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4">
              <span className="text-3xl font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans'] tabular-nums">
                {winRate}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-2xl border border-[#DCEBFF] shadow-2xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search proposal #, business, contact..."
            className="w-full pl-10 pr-4 py-2 bg-[#F8FAFF] border border-[#DCEBFF] rounded-xl text-xs text-[#0A1F5C] placeholder:text-[#94A3B8] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-[#F8FAFF] border border-[#DCEBFF] rounded-xl text-xs font-medium text-[#0A1F5C]"
          >
            <option value="ALL">All Statuses</option>
            <option value="Draft">Draft</option>
            <option value="Sent">Sent</option>
            <option value="Viewed">Viewed</option>
            <option value="Accepted">Accepted</option>
            <option value="Declined">Declined</option>
            <option value="Expired">Expired</option>
          </select>

          <select
            value={packageFilter}
            onChange={(e) => setPackageFilter(e.target.value)}
            className="px-3 py-2 bg-[#F8FAFF] border border-[#DCEBFF] rounded-xl text-xs font-medium text-[#0A1F5C]"
          >
            <option value="ALL">All Packages</option>
            <option value="Starter">Starter</option>
            <option value="Growth">Growth</option>
            <option value="Dominator">Dominator</option>
            <option value="Custom">Custom</option>
          </select>
        </div>
      </div>

      {/* Table */}
      {proposalsState.loading ? (
        <SkeletonTable />
      ) : proposalsState.error ? null : (
        <div className="bg-white rounded-2xl border border-[#DCEBFF] overflow-visible shadow-2xs">
          {filteredProposals.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <FileText className="w-12 h-12 text-slate-300 mx-auto" />
              <p className="text-[#0A1F5C] font-semibold">No proposals found.</p>
              <p className="text-xs text-slate-500">
                Click &ldquo;+ New Proposal&rdquo; to create your first proposal.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#F8FAFF] border-b border-[#DCEBFF] text-[11px] font-semibold text-slate-500 uppercase">
                    <th className="py-3.5 px-4">Number</th>
                    <th className="py-3.5 px-4">Business</th>
                    <th className="py-3.5 px-4">Package</th>
                    <th className="py-3.5 px-4">Monthly Fee</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4">Sent Date</th>
                    <th className="py-3.5 px-4">Valid Until</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProposals.map((p) => {
                    const displayStatus = getEffectiveProposalStatus(p);
                    const feeValue = parseNumericInput(p.monthly_fee);

                    return (
                      <tr
                        key={p.id}
                        onClick={() => onOpenEditor(p.id)}
                        className="hover:bg-[#F8FAFF] cursor-pointer transition-colors h-[54px]"
                      >
                        <td className="py-3 px-4 font-mono font-semibold text-[#0A1F5C]">
                          {p.proposal_number || '-'}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-[#0A1F5C]">
                            {p.business_name || 'Untitled'}
                          </div>
                          {(p.contact_name || p.city) && (
                            <div className="text-[11px] text-slate-500">
                              {[p.contact_name, p.city].filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className="bg-[#F2F7FF] text-[#1D4ED8] border border-[#DCEBFF] px-2.5 py-0.5 rounded-full font-semibold text-[11px]">
                            {p.package || 'Custom'}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-bold text-[#0A1F5C] tabular-nums">
                          {feeValue > 0 ? formatINR(feeValue) : '-'}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2.5 py-0.5 rounded-full font-semibold border text-[11px] ${getProposalStatusBadgeStyle(
                              displayStatus
                            )}`}
                          >
                            {displayStatus}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          {p.sent_at ? formatDate(p.sent_at) : '-'}
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          {p.valid_until ? formatDate(p.valid_until) : '-'}
                        </td>
                        <td
                          className="py-3 px-4 text-right relative"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div
                            className="inline-flex items-center justify-end"
                            ref={openMenuId === p.id ? menuContainerRef : undefined}
                          >
                            <button
                              type="button"
                              aria-label="Open proposal actions"
                              onClick={() =>
                                setOpenMenuId(openMenuId === p.id ? null : p.id)
                              }
                              className="p-2 hover:bg-[#F2F7FF] rounded-lg text-slate-500 hover:text-[#0A1F5C]"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>

                            {openMenuId === p.id && (
                              <div className="absolute right-4 top-11 w-48 bg-white rounded-xl shadow-xl border border-[#DCEBFF] py-1.5 z-40 text-left">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    onOpenEditor(p.id);
                                  }}
                                  className="w-full text-left px-3.5 py-2 hover:bg-[#F8FAFF] text-[#0A1F5C] font-medium flex items-center gap-2"
                                >
                                  <Edit className="w-3.5 h-3.5 text-[#1D4ED8]" />
                                  <span>Edit</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDuplicate(p)}
                                  className="w-full text-left px-3.5 py-2 hover:bg-[#F8FAFF] text-[#0A1F5C] font-medium flex items-center gap-2"
                                >
                                  <Copy className="w-3.5 h-3.5 text-[#1D4ED8]" />
                                  <span>Duplicate</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDownloadPdf(p)}
                                  className="w-full text-left px-3.5 py-2 hover:bg-[#F8FAFF] text-[#0A1F5C] font-medium flex items-center gap-2"
                                >
                                  <Download className="w-3.5 h-3.5 text-[#1D4ED8]" />
                                  <span>Download PDF</span>
                                </button>
                                <div className="my-1 border-t border-[#E5ECF6]" />
                                <button
                                  type="button"
                                  onClick={() => handleMarkAsSent(p)}
                                  className="w-full text-left px-3.5 py-2 hover:bg-[#F2F7FF] text-[#1D4ED8] font-semibold flex items-center gap-2"
                                >
                                  <Send className="w-3.5 h-3.5" />
                                  <span>Mark as Sent</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleMarkAsAccepted(p)}
                                  className="w-full text-left px-3.5 py-2 hover:bg-emerald-50 text-emerald-700 font-semibold flex items-center gap-2"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Mark as Accepted</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    setDeclineTarget(p);
                                    setDeclineReason('');
                                  }}
                                  className="w-full text-left px-3.5 py-2 hover:bg-rose-50 text-rose-600 font-semibold flex items-center gap-2"
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                  <span>Mark as Declined</span>
                                </button>
                                <div className="my-1 border-t border-[#E5ECF6]" />
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    setDeleteTarget(p);
                                  }}
                                  className="w-full text-left px-3.5 py-2 hover:bg-rose-50 text-rose-600 font-medium flex items-center gap-2"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>Delete</span>
                                </button>
                              </div>
                            )}
                          </div>
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

      {/* Mark as Declined Modal */}
      {declineTarget && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
          onClick={() => !actionBusy && setDeclineTarget(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white w-full max-w-md rounded-2xl border border-[#DCEBFF] shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans']">
                Mark Proposal as Declined
              </h3>
              <button
                type="button"
                onClick={() => setDeclineTarget(null)}
                className="p-1.5 text-slate-400 hover:text-[#0A1F5C] rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              {declineTarget.lead_id
                ? `Mark ${declineTarget.proposal_number} (${declineTarget.business_name}) as Declined and set the linked lead to Lost.`
                : `Mark ${declineTarget.proposal_number} (${declineTarget.business_name}) as Declined.`}
            </p>

            <div className="space-y-1.5">
              <label className="block text-[12px] font-semibold text-[#0A1F5C]">
                Reason (optional)
              </label>
              <textarea
                rows={3}
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="Budget mismatch, paused plans..."
                className="w-full p-3 rounded-xl border border-[#DCEBFF] bg-[#F8FAFF] focus:bg-white text-xs text-[#0A1F5C] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#1D4ED8]"
              />
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => setDeclineTarget(null)}
                className="px-4 py-2 bg-white border border-[#DCEBFF] text-[#0A1F5C] rounded-xl text-xs font-semibold hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionBusy}
                onClick={handleConfirmDeclined}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 disabled:opacity-60"
              >
                {actionBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Mark as Declined</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
          onClick={() => !actionBusy && setDeleteTarget(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white w-full max-w-md rounded-2xl border border-[#DCEBFF] shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans']">
                Delete Proposal
              </h3>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="p-1.5 text-slate-400 hover:text-[#0A1F5C] rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Delete <strong className="text-[#0A1F5C]">{deleteTarget.proposal_number}</strong> for{' '}
              <strong className="text-[#0A1F5C]">{deleteTarget.business_name}</strong>? This action
              cannot be undone.
            </p>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 bg-white border border-[#DCEBFF] text-[#0A1F5C] rounded-xl text-xs font-semibold hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionBusy}
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 disabled:opacity-60"
              >
                {actionBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Convert to Client Modal */}
      <ConvertProposalClientModal
        proposal={convertProposal}
        onClose={() => setConvertProposal(null)}
        onConverted={(clientId) => {
          fetchProposals();
          onOpenClientProfile?.(clientId);
        }}
      />

      {/* Company & Payment Settings Modal */}
      <CompanySettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
      />
    </div>
  );
}
