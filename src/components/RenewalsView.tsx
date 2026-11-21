import React, { useEffect, useState } from 'react';
import { safeQuery } from '../lib/db';
import { formatINR, formatDate, formatInputDate } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';
import { ExternalLink, FileSignature, X } from 'lucide-react';
import { SkeletonTable } from './SkeletonLoader';
import ErrorCard from './ErrorCard';
import { getOffsetDateInput } from '../lib/leadOptions';
import { getTodayLocalDate } from '../lib/taskOptions';
import { getEffectivePaymentAmount, isPaymentOverdue } from '../lib/paymentOptions';
import {
  getContractStatusBadgeStyle,
  getEffectiveContractStatus,
} from '../lib/contractConfig';

interface RenewalsViewProps {
  onOpenClientProfile: (clientId: string) => void;
  onOpenContract?: (contractId?: string, prefillClientId?: string, prefillProposalId?: string) => void;
  refreshKey?: number;
}

interface RenewalRow {
  kind: 'client' | 'contract';
  id: string;
  clientId?: string | null;
  businessName: string;
  subline: string;
  packageName: string;
  monthlyFee: number;
  statusLabel: string;
  statusBadgeClass: string;
  renewalDate: string | null;
  contractNumber?: string;
  termMonths?: number | null;
  raw: any;
}

export default function RenewalsView({
  onOpenClientProfile,
  onOpenContract,
  refreshKey = 0,
}: RenewalsViewProps) {
  const { showToast } = useToast();
  const [clientsState, setClientsState] = useState<{
    data: any[];
    error: string | null;
    isMissingTable: boolean;
    loading: boolean;
  }>({ data: [], error: null, isMissingTable: false, loading: true });
  const [contracts, setContracts] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);

  const [renewingItem, setRenewingItem] = useState<RenewalRow | null>(null);
  const [newRenewalDate, setNewRenewalDate] = useState(
    formatInputDate(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000))
  );

  useEffect(() => {
    fetchData();
  }, [refreshKey]);

  const fetchData = async () => {
    setClientsState((prev) => ({ ...prev, loading: true }));
    const [clientsRes, paymentsRes, contractsRes] = await Promise.all([
      safeQuery(async () => {
        const { data, error } = await supabase
          .from('clients')
          .select('*')
          .order('renewal_date', { ascending: true });
        return { data: data || [], error };
      }, []),
      safeQuery(async () => {
        const { data, error } = await supabase
          .from('client_payments')
          .select('id, client_id, for_month, amount, total_amount, due_date, paid_on, status')
          .order('due_date', { ascending: false });
        return { data: data || [], error };
      }, []),
      safeQuery(async () => {
        const { data, error } = await supabase
          .from('contracts')
          .select('*')
          .eq('status', 'Signed')
          .eq('term_type', 'fixed')
          .not('renewal_date', 'is', null)
          .order('renewal_date', { ascending: true });
        return { data: data || [], error };
      }, []),
    ]);
    setClientsState({
      data: clientsRes.data,
      error: clientsRes.error,
      isMissingTable: clientsRes.isMissingTable,
      loading: false,
    });
    setPayments(paymentsRes.data);
    setContracts(contractsRes.data);
  };

  const handleRenewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renewingItem || !newRenewalDate) return;

    if (renewingItem.kind === 'contract') {
      const { error } = await supabase
        .from('contracts')
        .update({
          renewal_date: newRenewalDate,
          status: 'Signed',
        })
        .eq('id', renewingItem.id);

      if (error) {
        showToast('Could not renew contract: ' + error.message, 'error');
        return;
      }

      if (renewingItem.clientId) {
        await supabase.from('client_activities').insert({
          client_id: renewingItem.clientId,
          type: 'Renewal',
          note: `Contract ${renewingItem.contractNumber || ''} renewed until ${formatDate(
            newRenewalDate
          )}`,
        });
      }
    } else {
      await supabase
        .from('clients')
        .update({
          renewal_date: newRenewalDate,
          status: 'Active',
        })
        .eq('id', renewingItem.id);

      await supabase.from('client_activities').insert({
        client_id: renewingItem.id,
        type: 'Renewal',
        note: `Contract renewed until ${formatDate(newRenewalDate)}`,
      });
    }

    setRenewingItem(null);
    showToast('Contract renewed successfully!', 'success');
    fetchData();
  };

  const todayStr = getTodayLocalDate();
  const thirtyDaysStr = getOffsetDateInput(30);
  const sixtyDaysStr = getOffsetDateInput(60);

  const clients = clientsState.data;

  const contractRows: RenewalRow[] = contracts.map((ct) => {
    const effStatus = getEffectiveContractStatus(ct);
    return {
      kind: 'contract',
      id: ct.id,
      clientId: ct.client_id || null,
      businessName: ct.business_name,
      subline: `${ct.contract_number}${
        ct.term_months ? ` • ${ct.term_months} mo fixed` : ' • Fixed term'
      }`,
      packageName: ct.package || 'Growth',
      monthlyFee: Number(ct.monthly_fee) || 0,
      statusLabel: effStatus,
      statusBadgeClass: getContractStatusBadgeStyle(effStatus),
      renewalDate: ct.renewal_date || null,
      contractNumber: ct.contract_number,
      termMonths: ct.term_months,
      raw: ct,
    };
  });

  const clientRows: RenewalRow[] = clients.map((c) => ({
    kind: 'client',
    id: c.id,
    clientId: c.id,
    businessName: c.business_name,
    subline: `${c.contact_name || 'No contact'} • ${c.city || '-'}`,
    packageName: c.package || 'Growth',
    monthlyFee: Number(c.monthly_fee) || 0,
    statusLabel: c.status || 'Active',
    statusBadgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    renewalDate: c.renewal_date || null,
    raw: c,
  }));

  const allItems: RenewalRow[] = [...contractRows, ...clientRows].sort((a, b) => {
    if (!a.renewalDate && !b.renewalDate) return 0;
    if (!a.renewalDate) return 1;
    if (!b.renewalDate) return -1;
    return a.renewalDate.localeCompare(b.renewalDate);
  });

  const overdue = allItems.filter(
    (item) =>
      item.renewalDate &&
      item.renewalDate < todayStr &&
      (item.kind === 'contract' || item.statusLabel === 'Active')
  );
  const next30 = allItems.filter(
    (item) => item.renewalDate && item.renewalDate >= todayStr && item.renewalDate <= thirtyDaysStr
  );
  const next60 = allItems.filter(
    (item) =>
      item.renewalDate && item.renewalDate > thirtyDaysStr && item.renewalDate <= sixtyDaysStr
  );
  const later = allItems.filter((item) => !item.renewalDate || item.renewalDate > sixtyDaysStr);

  const renderClientPaymentBadge = (clientId?: string | null) => {
    if (!clientId) return <span className="text-[11px] text-slate-400">Unlinked</span>;
    const clientPayments = payments.filter((p) => p.client_id === clientId);
    if (clientPayments.length === 0) {
      return <span className="text-[11px] text-slate-400">No invoices</span>;
    }

    const overdueList = clientPayments.filter((p) => isPaymentOverdue(p, todayStr));
    if (overdueList.length > 0) {
      const overdueTotal = overdueList.reduce((sum, p) => sum + getEffectivePaymentAmount(p), 0);
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full font-semibold border text-[10px] bg-rose-50 text-rose-700 border-rose-200">
          {overdueList.length} Overdue • {formatINR(overdueTotal)}
        </span>
      );
    }

    const pendingList = clientPayments.filter((p) => p.status !== 'Paid');
    if (pendingList.length > 0) {
      const pendingTotal = pendingList.reduce((sum, p) => sum + getEffectivePaymentAmount(p), 0);
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full font-semibold border text-[10px] bg-amber-50 text-amber-700 border-amber-200">
          {formatINR(pendingTotal)} Due
        </span>
      );
    }

    const latest = clientPayments[0];
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full font-semibold border text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
        Paid • {latest.for_month || formatDate(latest.paid_on)}
      </span>
    );
  };

  const openRenewalItem = (item: RenewalRow) => {
    if (item.kind === 'contract' && onOpenContract) {
      onOpenContract(item.id);
    } else if (item.clientId) {
      onOpenClientProfile(item.clientId);
    }
  };

  const renderGroup = (title: string, groupItems: RenewalRow[], badgeColor: string) => {
    if (groupItems.length === 0) return null;

    return (
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans'] flex items-center space-x-2">
          <span className={`w-2.5 h-2.5 rounded-full ${badgeColor}`} />
          <span>
            {title} ({groupItems.length})
          </span>
        </h2>

        {/* Mobile Cards (< md) */}
        <div className="grid grid-cols-1 gap-3 md:hidden">
          {groupItems.map((item) => (
            <div
              key={`${item.kind}-${item.id}`}
              className="bg-white rounded-2xl border border-[#DCEBFF] p-4 space-y-3 shadow-2xs"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 mb-1">
                    {item.kind === 'contract' ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#1D4ED8] bg-[#F2F7FF] border border-[#DCEBFF] px-2 py-0.5 rounded-md font-mono">
                        <FileSignature className="w-3 h-3" />
                        {item.contractNumber}
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                        Client Retainer
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => openRenewalItem(item)}
                    className="font-bold text-sm text-[#0A1F5C] hover:text-[#1D4ED8] text-left truncate block"
                  >
                    {item.businessName}
                  </button>
                  <p className="text-[11px] text-slate-500 truncate">{item.subline}</p>
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded-full font-semibold border text-[10px] shrink-0 ${item.statusBadgeClass}`}
                >
                  {item.statusLabel}
                </span>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase block">
                    {item.packageName}
                  </span>
                  <span className="font-bold text-[#0A1F5C] tabular-nums">
                    {formatINR(item.monthlyFee)}/mo
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 uppercase block">Renewal</span>
                  <span className="font-bold text-[#0A1F5C]">
                    {formatDate(item.renewalDate)}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setRenewingItem(item);
                    setNewRenewalDate(
                      formatInputDate(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000))
                    );
                  }}
                  className="flex-1 py-2 bg-[#1D4ED8] text-white rounded-xl text-xs font-semibold"
                >
                  Renewed
                </button>
                <button
                  type="button"
                  onClick={() => openRenewalItem(item)}
                  className="flex-1 py-2 bg-[#F8FAFF] border border-[#DCEBFF] text-[#0A1F5C] rounded-xl text-xs font-semibold"
                >
                  {item.kind === 'contract' ? 'Open Contract' : 'Profile'}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop Table (>= md) */}
        <div className="hidden md:block bg-white rounded-2xl border border-[#E5ECF6] overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b text-[11px] font-semibold text-slate-500 uppercase">
                  <th className="py-3.5 px-4">Business / Contract</th>
                  <th className="py-3.5 px-4">Package &amp; Fee</th>
                  <th className="py-3.5 px-4">Payments</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Renewal Date</th>
                  <th className="py-3.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {groupItems.map((item) => (
                  <tr key={`${item.kind}-${item.id}`} className="hover:bg-slate-50/50 h-[56px]">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        {item.kind === 'contract' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[10px] font-bold bg-[#F2F7FF] text-[#1D4ED8] border border-[#DCEBFF]">
                            <FileSignature className="w-3 h-3" />
                            Contract
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => openRenewalItem(item)}
                          className="font-semibold text-[#1D4ED8] hover:underline inline-flex items-center space-x-1"
                        >
                          <span>{item.businessName}</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{item.subline}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-medium text-[#0A1F5C]">{item.packageName}</span>
                      <div className="text-[11px] text-slate-500 font-semibold">
                        {formatINR(item.monthlyFee)}/mo
                      </div>
                    </td>
                    <td className="py-3 px-4">{renderClientPaymentBadge(item.clientId)}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2.5 py-0.5 rounded-full font-semibold border text-[10px] ${item.statusBadgeClass}`}
                      >
                        {item.statusLabel}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-bold text-[#0A1F5C]">
                      {formatDate(item.renewalDate)}
                    </td>
                    <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => {
                          setRenewingItem(item);
                          setNewRenewalDate(
                            formatInputDate(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000))
                          );
                        }}
                        className="px-3 py-1.5 bg-[#1D4ED8] hover:bg-blue-700 text-white rounded-xl font-semibold transition-all shadow-xs"
                      >
                        Renewed
                      </button>
                      <button
                        type="button"
                        onClick={() => openRenewalItem(item)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-all"
                      >
                        {item.kind === 'contract' ? 'Contract' : 'Profile'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans']">
          Client &amp; Contract Renewals Pipeline
        </h1>
        <p className="text-sm text-slate-500">
          Track client retainer and fixed-term signed contract renewal schedules.
        </p>
      </div>

      {clientsState.loading ? (
        <SkeletonTable />
      ) : clientsState.error ? (
        <ErrorCard
          title="Renewals Pipeline"
          error={clientsState.error}
          isMissingTable={clientsState.isMissingTable}
          onRetry={fetchData}
        />
      ) : allItems.length === 0 ? (
        <div className="p-12 text-center text-slate-400 bg-white rounded-2xl border border-[#E5ECF6]">
          No clients or fixed-term signed contracts found.
        </div>
      ) : (
        <div className="space-y-6">
          {renderGroup('Overdue Renewals', overdue, 'bg-rose-500')}
          {renderGroup('Next 30 Days', next30, 'bg-amber-500')}
          {renderGroup('Next 60 Days', next60, 'bg-blue-500')}
          {renderGroup('Later Renewals', later, 'bg-slate-400')}
        </div>
      )}

      {/* Renew Modal */}
      {renewingItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-[#E5ECF6] p-6 space-y-4 animate-scale-in">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans'] text-lg">
                  {renewingItem.kind === 'contract' ? 'Renew Fixed Contract' : 'Renew Client Retainer'}
                </h3>
                <p className="text-xs text-slate-500">
                  {renewingItem.businessName}
                  {renewingItem.contractNumber ? ` (${renewingItem.contractNumber})` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRenewingItem(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRenewSubmit} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 uppercase">New Renewal Date *</label>
                <input
                  type="date"
                  required
                  value={newRenewalDate}
                  onChange={(e) => setNewRenewalDate(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-[#E5ECF6] rounded-xl text-slate-800"
                />
              </div>

              <div className="p-3 bg-blue-50 rounded-xl text-[11px] text-blue-800">
                This will update the renewal date to the new term and log a renewal activity.
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setRenewingItem(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#1D4ED8] hover:bg-blue-700 text-white rounded-xl font-medium shadow-md"
                >
                  Confirm Renewal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
