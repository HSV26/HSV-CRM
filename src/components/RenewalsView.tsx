import React, { useEffect, useState } from 'react';
import { safeQuery } from '../lib/db';
import { formatINR, formatDate, formatInputDate } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';
import { ExternalLink, X } from 'lucide-react';
import { SkeletonTable } from './SkeletonLoader';
import ErrorCard from './ErrorCard';
import { getOffsetDateInput } from '../lib/leadOptions';
import { getTodayLocalDate } from '../lib/taskOptions';
import { getEffectivePaymentAmount, isPaymentOverdue } from '../lib/paymentOptions';

interface RenewalsViewProps {
  onOpenClientProfile: (clientId: string) => void;
  refreshKey?: number;
}

export default function RenewalsView({
  onOpenClientProfile,
  refreshKey = 0,
}: RenewalsViewProps) {
  const { showToast } = useToast();
  const [clientsState, setClientsState] = useState<{
    data: any[];
    error: string | null;
    isMissingTable: boolean;
    loading: boolean;
  }>({ data: [], error: null, isMissingTable: false, loading: true });
  const [payments, setPayments] = useState<any[]>([]);

  const [renewingClient, setRenewingClient] = useState<any | null>(null);
  const [newRenewalDate, setNewRenewalDate] = useState(
    formatInputDate(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000))
  );

  useEffect(() => {
    fetchData();
  }, [refreshKey]);

  const fetchData = async () => {
    setClientsState((prev) => ({ ...prev, loading: true }));
    const [clientsRes, paymentsRes] = await Promise.all([
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
    ]);
    setClientsState({
      data: clientsRes.data,
      error: clientsRes.error,
      isMissingTable: clientsRes.isMissingTable,
      loading: false,
    });
    setPayments(paymentsRes.data);
  };

  const handleRenewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renewingClient || !newRenewalDate) return;

    await supabase
      .from('clients')
      .update({
        renewal_date: newRenewalDate,
        status: 'Active',
      })
      .eq('id', renewingClient.id);

    await supabase.from('client_activities').insert({
      client_id: renewingClient.id,
      type: 'Renewal',
      note: `Contract renewed until ${formatDate(newRenewalDate)}`,
    });

    setRenewingClient(null);
    showToast('Contract renewed successfully!', 'success');
    fetchData();
  };

  const todayStr = getTodayLocalDate();
  const thirtyDaysStr = getOffsetDateInput(30);
  const sixtyDaysStr = getOffsetDateInput(60);

  const clients = clientsState.data;
  const overdue = clients.filter(
    (c) => c.renewal_date && c.renewal_date < todayStr && c.status === 'Active'
  );
  const next30 = clients.filter(
    (c) => c.renewal_date && c.renewal_date >= todayStr && c.renewal_date <= thirtyDaysStr
  );
  const next60 = clients.filter(
    (c) => c.renewal_date && c.renewal_date > thirtyDaysStr && c.renewal_date <= sixtyDaysStr
  );
  const later = clients.filter((c) => !c.renewal_date || c.renewal_date > sixtyDaysStr);

  const renderClientPaymentBadge = (clientId: string) => {
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

  const renderGroup = (title: string, groupClients: any[], badgeColor: string) => {
    if (groupClients.length === 0) return null;

    return (
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans'] flex items-center space-x-2">
          <span className={`w-2.5 h-2.5 rounded-full ${badgeColor}`} />
          <span>
            {title} ({groupClients.length})
          </span>
        </h2>
        <div className="bg-white rounded-2xl border border-[#E5ECF6] overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b text-[11px] font-semibold text-slate-500 uppercase">
                  <th className="py-3.5 px-4">Business Name</th>
                  <th className="py-3.5 px-4">Package & Fee</th>
                  <th className="py-3.5 px-4">Payments</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Renewal Date</th>
                  <th className="py-3.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {groupClients.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/50 h-[52px]">
                    <td className="py-3 px-4">
                      <button
                        onClick={() => onOpenClientProfile(c.id)}
                        className="font-semibold text-[#1D4ED8] hover:underline inline-flex items-center space-x-1"
                      >
                        <span>{c.business_name}</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                      <div className="text-[11px] text-slate-400">
                        {c.contact_name || 'No contact'} • {c.city || '-'}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-medium text-[#0A1F5C]">{c.package}</span>
                      <div className="text-[11px] text-slate-500 font-semibold">
                        {formatINR(c.monthly_fee)}/mo
                      </div>
                    </td>
                    <td className="py-3 px-4">{renderClientPaymentBadge(c.id)}</td>
                    <td className="py-3 px-4">
                      <span className="px-2.5 py-0.5 rounded-full font-semibold border text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                        {c.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-bold text-[#0A1F5C]">
                      {formatDate(c.renewal_date)}
                    </td>
                    <td className="py-3 px-4 text-right space-x-2">
                      <button
                        onClick={() => setRenewingClient(c)}
                        className="px-3 py-1.5 bg-[#1D4ED8] hover:bg-blue-700 text-white rounded-xl font-semibold transition-all shadow-xs"
                      >
                        Renewed
                      </button>
                      <button
                        onClick={() => onOpenClientProfile(c.id)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-all"
                      >
                        Profile
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
    <div className="p-6 lg:p-8 space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans']">
          Client Renewals Pipeline
        </h1>
        <p className="text-sm text-slate-500">
          Track contract renewal schedules and ensure high client retention.
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
      ) : clients.length === 0 ? (
        <div className="p-12 text-center text-slate-400 bg-white rounded-2xl border border-[#E5ECF6]">
          No clients found.
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
      {renewingClient && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-[#E5ECF6] p-6 space-y-4 animate-scale-in">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans'] text-lg">
                  Renew Contract
                </h3>
                <p className="text-xs text-slate-500">{renewingClient.business_name}</p>
              </div>
              <button
                onClick={() => setRenewingClient(null)}
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
                  onClick={() => setRenewingClient(null)}
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
