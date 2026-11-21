import React, { useCallback, useEffect, useState } from 'react';
import {
  FileSignature,
  Search,
  Plus,
  Settings,
  FileText,
  Download,
  Calendar,
  IndianRupee,
  CheckCircle2,
  Send,
  Clock,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { safeQuery } from '../lib/db';
import { formatDate, formatINR } from '../lib/utils';
import { SkeletonCard, SkeletonTable } from './SkeletonLoader';
import ErrorCard from './ErrorCard';
import { useToast } from './Toast';
import {
  CONTRACT_STATUSES,
  getContractStatusBadgeStyle,
  getEffectiveContractStatus,
} from '../lib/contractConfig';
import { downloadContractPdf } from '../lib/contractPdf';
import ContractTemplatesModal from './ContractTemplatesModal';
import CompanySettingsModal from './CompanySettingsModal';
import { getOffsetDateInput } from '../lib/leadOptions';
import { getTodayLocalDate } from '../lib/taskOptions';

interface ContractsListViewProps {
  onOpenContract: (contractId?: string, prefillClientId?: string, prefillProposalId?: string) => void;
  onOpenClientProfile?: (clientId: string) => void;
  refreshKey?: number;
}

export default function ContractsListView({
  onOpenContract,
  onOpenClientProfile,
  refreshKey = 0,
}: ContractsListViewProps) {
  const { showToast } = useToast();
  const [contractsState, setContractsState] = useState<{
    data: any[];
    error: string | null;
    isMissingTable: boolean;
    loading: boolean;
  }>({ data: [], error: null, isMissingTable: false, loading: true });

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const fetchContracts = useCallback(async () => {
    setContractsState((prev) => ({ ...prev, loading: true }));
    const res = await safeQuery(async () => {
      const { data, error } = await supabase
        .from('contracts')
        .select('*')
        .order('created_at', { ascending: false });
      return { data: data || [], error };
    }, []);
    setContractsState({
      data: res.data,
      error: res.error,
      isMissingTable: res.isMissingTable,
      loading: false,
    });
  }, []);

  useEffect(() => {
    fetchContracts();
  }, [fetchContracts, refreshKey]);

  const contracts = contractsState.data;
  const todayStr = getTodayLocalDate();
  const sixtyDaysStr = getOffsetDateInput(60);

  const signedContracts = contracts.filter((c) => getEffectiveContractStatus(c) === 'Signed');
  const signedMrr = signedContracts.reduce((sum, c) => sum + (Number(c.monthly_fee) || 0), 0);
  const sentPendingCount = contracts.filter((c) => getEffectiveContractStatus(c) === 'Sent').length;
  const upcomingRenewalsCount = signedContracts.filter(
    (c) =>
      c.term_type === 'fixed' &&
      c.renewal_date &&
      c.renewal_date >= todayStr &&
      c.renewal_date <= sixtyDaysStr
  ).length;

  const filteredContracts = contracts.filter((c) => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      (c.contract_number || '').toLowerCase().includes(q) ||
      (c.business_name || '').toLowerCase().includes(q) ||
      (c.contact_name || '').toLowerCase().includes(q) ||
      (c.package || '').toLowerCase().includes(q);

    const eff = getEffectiveContractStatus(c);
    const matchesStatus = statusFilter === 'ALL' || eff === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const handleQuickPdf = async (e: React.MouseEvent, contract: any) => {
    e.stopPropagation();
    try {
      const filename = await downloadContractPdf(contract);
      showToast(`Downloaded ${filename}`, 'success');
    } catch (err: any) {
      showToast('Could not generate PDF: ' + (err?.message || 'Unknown error'), 'error');
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1400px] mx-auto pb-28 md:pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans']">
            Contracts
          </h1>
          <p className="text-sm text-slate-500">
            Create clause-based hospitality retainers, generate A4 contracts, and track signatures &amp; renewals.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setTemplatesOpen(true)}
            className="px-3.5 py-2.5 bg-white border border-[#DCEBFF] hover:bg-[#F2F7FF] text-[#0A1F5C] rounded-xl text-xs font-semibold transition-colors inline-flex items-center gap-1.5"
          >
            <FileText className="w-3.5 h-3.5 text-[#1D4ED8]" />
            <span>Contract Templates</span>
          </button>

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="px-3.5 py-2.5 bg-white border border-[#DCEBFF] hover:bg-[#F2F7FF] text-[#0A1F5C] rounded-xl text-xs font-semibold transition-colors inline-flex items-center gap-1.5"
          >
            <Settings className="w-3.5 h-3.5 text-[#1D4ED8]" />
            <span className="hidden sm:inline">Company Settings</span>
            <span className="sm:hidden">Settings</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenContract()}
            className="px-4 py-2.5 bg-[#1D4ED8] hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-sm inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>New Contract</span>
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {contractsState.loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : contractsState.error ? (
        <ErrorCard
          title="Contracts"
          error={contractsState.error}
          isMissingTable={contractsState.isMissingTable}
          onRetry={fetchContracts}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[#DCEBFF] shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Signed Contracts
                </span>
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
              <p className="mt-3 text-2xl sm:text-3xl font-bold text-emerald-600 font-['Plus_Jakarta_Sans'] tabular-nums">
                {signedContracts.length}
              </p>
            </div>

            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[#DCEBFF] shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Signed Retainer MRR
                </span>
                <div className="p-2 rounded-xl bg-[#F2F7FF] text-[#1D4ED8]">
                  <IndianRupee className="w-4 h-4" />
                </div>
              </div>
              <p className="mt-3 text-2xl sm:text-3xl font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans'] tabular-nums">
                {formatINR(signedMrr)}
              </p>
            </div>

            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[#DCEBFF] shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Awaiting Signature
                </span>
                <div className="p-2 rounded-xl bg-blue-50 text-[#1D4ED8]">
                  <Send className="w-4 h-4" />
                </div>
              </div>
              <p className="mt-3 text-2xl sm:text-3xl font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans'] tabular-nums">
                {sentPendingCount}
              </p>
            </div>

            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[#DCEBFF] shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Renewals (60 Days)
                </span>
                <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
                  <Clock className="w-4 h-4" />
                </div>
              </div>
              <p className="mt-3 text-2xl sm:text-3xl font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans'] tabular-nums">
                {upcomingRenewalsCount}
              </p>
            </div>
          </div>

          {/* Search & Status Filter Chips */}
          <div className="bg-white p-4 rounded-2xl border border-[#DCEBFF] shadow-2xs space-y-3">
            <div className="relative w-full md:w-96">
              <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search contract #, client name, package..."
                className="w-full pl-10 pr-4 py-2.5 bg-[#F8FAFF] border border-[#DCEBFF] rounded-xl text-xs text-[#0A1F5C] placeholder:text-[#94A3B8] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {['ALL', ...CONTRACT_STATUSES].map((st) => {
                const active = statusFilter === st;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap transition-colors ${
                      active
                        ? 'bg-[#1D4ED8] text-white border-[#1D4ED8]'
                        : 'bg-[#F8FAFF] text-[#0A1F5C] border-[#DCEBFF] hover:bg-white'
                    }`}
                  >
                    {st === 'ALL' ? 'All' : st}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Empty state */}
          {filteredContracts.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#DCEBFF] p-12 text-center space-y-3">
              <FileSignature className="w-12 h-12 text-slate-300 mx-auto" />
              <p className="text-[#0A1F5C] font-semibold">No contracts found.</p>
              <p className="text-xs text-slate-500">
                Tap &ldquo;+ New Contract&rdquo; to create a contract from scratch or from an existing proposal.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => onOpenContract()}
                  className="px-4 py-2 bg-[#1D4ED8] hover:bg-blue-700 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>New Contract</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* MOBILE CARDS (< md) */}
              <div className="grid grid-cols-1 gap-3 md:hidden">
                {filteredContracts.map((c) => {
                  const eff = getEffectiveContractStatus(c);
                  return (
                    <div
                      key={c.id}
                      onClick={() => onOpenContract(c.id)}
                      className="bg-white rounded-2xl border border-[#DCEBFF] p-4 space-y-3 shadow-2xs active:scale-[0.99] transition-transform cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className="font-mono text-[11px] font-bold text-[#1D4ED8] bg-[#F2F7FF] border border-[#DCEBFF] px-2 py-0.5 rounded-md">
                            {c.contract_number}
                          </span>
                          <h3 className="text-sm font-bold text-[#0A1F5C] mt-1.5 truncate">
                            {c.business_name}
                          </h3>
                          {c.contact_name && (
                            <p className="text-[11px] text-slate-500 truncate">{c.contact_name}</p>
                          )}
                        </div>
                        <span
                          className={`px-2.5 py-0.5 rounded-full font-semibold border text-[10px] shrink-0 ${getContractStatusBadgeStyle(
                            eff
                          )}`}
                        >
                          {eff}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#E5ECF6] text-xs">
                        <div>
                          <span className="text-[10px] text-slate-400 block uppercase">Package</span>
                          <span className="font-semibold text-[#0A1F5C] truncate block">
                            {c.package || 'Growth'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block uppercase">
                            Monthly Fee
                          </span>
                          <span className="font-bold text-[#0A1F5C] tabular-nums">
                            {formatINR(Number(c.monthly_fee) || 0)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block uppercase">
                            Start Date
                          </span>
                          <span className="font-medium text-slate-700">
                            {formatDate(c.start_date)}
                          </span>
                        </div>
                      </div>

                      {c.term_type === 'fixed' && c.renewal_date && (
                        <div className="flex items-center justify-between text-[11px] text-slate-500 bg-[#F8FAFF] rounded-lg px-2.5 py-1.5">
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-[#1D4ED8]" />
                            Renews {formatDate(c.renewal_date)}
                          </span>
                          <span>{c.term_months} mo fixed</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* DESKTOP TABLE (>= md) */}
              <div className="hidden md:block bg-white rounded-2xl border border-[#DCEBFF] overflow-hidden shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#F8FAFF] border-b border-[#DCEBFF] text-[11px] font-semibold text-slate-500 uppercase">
                        <th className="py-3.5 px-4">Contract #</th>
                        <th className="py-3.5 px-4">Client</th>
                        <th className="py-3.5 px-4">Service / Package</th>
                        <th className="py-3.5 px-4">Monthly Fee</th>
                        <th className="py-3.5 px-4">Start Date</th>
                        <th className="py-3.5 px-4">Renewal / Term</th>
                        <th className="py-3.5 px-4">Status</th>
                        <th className="py-3.5 px-4 text-right">PDF</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredContracts.map((c) => {
                        const eff = getEffectiveContractStatus(c);
                        return (
                          <tr
                            key={c.id}
                            onClick={() => onOpenContract(c.id)}
                            className="hover:bg-[#F8FAFF] cursor-pointer transition-colors h-[56px]"
                          >
                            <td className="py-3 px-4 font-mono font-semibold text-[#0A1F5C] whitespace-nowrap">
                              {c.contract_number}
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-semibold text-[#0A1F5C]">{c.business_name}</div>
                              {c.contact_name && (
                                <div className="text-[11px] text-slate-500">{c.contact_name}</div>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              <span className="bg-[#F2F7FF] text-[#1D4ED8] border border-[#DCEBFF] px-2.5 py-0.5 rounded-full font-semibold text-[11px]">
                                {c.package || 'Growth'}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-bold text-[#0A1F5C] tabular-nums whitespace-nowrap">
                              {formatINR(Number(c.monthly_fee) || 0)}
                            </td>
                            <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                              {formatDate(c.start_date)}
                            </td>
                            <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                              {c.term_type === 'fixed' && c.renewal_date
                                ? formatDate(c.renewal_date)
                                : c.term_type === 'fixed' && c.term_months
                                ? `${c.term_months} months`
                                : 'Month-to-month'}
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`px-2.5 py-0.5 rounded-full font-semibold border text-[11px] ${getContractStatusBadgeStyle(
                                  eff
                                )}`}
                              >
                                {eff}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                type="button"
                                onClick={(e) => handleQuickPdf(e, c)}
                                title="Download Contract PDF"
                                className="p-2 rounded-lg text-[#1D4ED8] hover:bg-[#F2F7FF] transition-colors"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* Floating Add Button on Mobile */}
      <button
        type="button"
        onClick={() => onOpenContract()}
        aria-label="New Contract"
        className="md:hidden fixed bottom-20 right-4 z-30 h-12 px-4 rounded-full bg-[#1D4ED8] hover:bg-blue-700 text-white shadow-lg flex items-center gap-2 text-xs font-semibold"
      >
        <Plus className="w-4 h-4" />
        <span>New Contract</span>
      </button>

      {/* Modals */}
      <ContractTemplatesModal isOpen={templatesOpen} onClose={() => setTemplatesOpen(false)} />
      <CompanySettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
