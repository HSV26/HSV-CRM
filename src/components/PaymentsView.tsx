import React, { useEffect, useState } from 'react';
import { safeQuery } from '../lib/db';
import { formatINR, formatDate, getStatusBadgeStyle } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';
import {
  Download,
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Plus,
} from 'lucide-react';
import { SkeletonTable, SkeletonCard } from './SkeletonLoader';
import ErrorCard from './ErrorCard';
import AddPaymentModal from './AddPaymentModal';
import MarkAsPaidModal from './MarkAsPaidModal';
import { getTodayLocalDate } from '../lib/taskOptions';
import {
  getEffectivePaymentAmount,
  getEffectivePaymentStatus,
  isPaymentOverdue,
} from '../lib/paymentOptions';

interface PaymentsViewProps {
  onOpenClientProfile: (clientId: string) => void;
  refreshKey?: number;
  onPaymentsMutated?: () => void;
}

export default function PaymentsView({
  onOpenClientProfile,
  refreshKey = 0,
  onPaymentsMutated,
}: PaymentsViewProps) {
  const { showToast } = useToast();
  const [paymentsState, setPaymentsState] = useState<{
    data: any[];
    error: string | null;
    isMissingTable: boolean;
    loading: boolean;
  }>({ data: [], error: null, isMissingTable: false, loading: true });

  const [isAddPaymentOpen, setIsAddPaymentOpen] = useState(false);
  const [markingPaidPayment, setMarkingPaidPayment] = useState<any | null>(null);

  useEffect(() => {
    fetchPayments();
  }, [refreshKey]);

  const fetchPayments = async () => {
    setPaymentsState((prev) => ({ ...prev, loading: true }));
    const res = await safeQuery(async () => {
      const { data, error } = await supabase
        .from('client_payments')
        .select('*, clients(business_name, monthly_fee)')
        .order('due_date', { ascending: false });
      return { data: data || [], error };
    }, []);
    setPaymentsState({
      data: res.data,
      error: res.error,
      isMissingTable: res.isMissingTable,
      loading: false,
    });
  };

  const todayStr = getTodayLocalDate();
  const currentMonthPrefix = todayStr.slice(0, 7);

  const handleExportCSV = () => {
    const payments = paymentsState.data;
    const headers = [
      'Payment ID',
      'Client Name',
      'Payment Type',
      'For Month',
      'Amount (INR)',
      'GST (INR)',
      'Total (INR)',
      'Due Date',
      'Paid On',
      'Method',
      'Reference',
      'Invoice No',
      'Status',
    ];
    const rows = payments.map((p) => {
      const effectiveStatus = getEffectivePaymentStatus(p, todayStr);
      const effectiveTotal = getEffectivePaymentAmount(p);
      return [
        p.id,
        `"${p.clients?.business_name || 'Client'}"`,
        `"${p.payment_type || ''}"`,
        `"${p.for_month || ''}"`,
        p.amount ?? 0,
        p.gst_amount ?? 0,
        effectiveTotal,
        p.due_date || '',
        p.paid_on || '',
        `"${p.payment_method || ''}"`,
        `"${p.reference_no || ''}"`,
        `"${p.invoice_number || ''}"`,
        effectiveStatus,
      ];
    });

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `HotelStory_Payments_${todayStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Payments exported to CSV successfully', 'success');
  };

  const payments = paymentsState.data;

  const collectedThisMonth = payments
    .filter(
      (p) =>
        p.status === 'Paid' &&
        Boolean(p.paid_on && String(p.paid_on).startsWith(currentMonthPrefix))
    )
    .reduce((sum, p) => sum + getEffectivePaymentAmount(p), 0);

  const overdueAmount = payments
    .filter((p) => isPaymentOverdue(p, todayStr))
    .reduce((sum, p) => sum + getEffectivePaymentAmount(p), 0);

  const pendingAmount = payments
    .filter((p) => p.status !== 'Paid' && !isPaymentOverdue(p, todayStr))
    .reduce((sum, p) => sum + getEffectivePaymentAmount(p), 0);

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans']">
            Payments & Invoices
          </h1>
          <p className="text-sm text-slate-500">
            Monitor retainer collections, dues and financial reporting.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleExportCSV}
            className="px-4 py-2.5 bg-white border border-[#E5ECF6] hover:bg-slate-50 text-[#0A1F5C] rounded-xl text-xs font-semibold flex items-center space-x-2 shadow-xs transition-all"
          >
            <Download className="w-4 h-4 text-[#1D4ED8]" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={() => setIsAddPaymentOpen(true)}
            className="tactile-btn-primary px-4 py-2.5 text-xs flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Add Payment</span>
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {paymentsState.loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : paymentsState.error ? (
        <ErrorCard
          title="Payments Metrics"
          error={paymentsState.error}
          isMissingTable={paymentsState.isMissingTable}
          onRetry={fetchPayments}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div className="bg-white p-6 rounded-2xl border border-[#E5ECF6] shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Collected This Month
              </span>
              <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4">
              <span className="text-3xl font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans'] tabular-nums">
                {formatINR(collectedThisMonth)}
              </span>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-[#E5ECF6] shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Pending
              </span>
              <div className="p-2 rounded-xl bg-blue-50 text-[#1D4ED8]">
                <Clock className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4">
              <span className="text-3xl font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans'] tabular-nums">
                {formatINR(pendingAmount)}
              </span>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-[#E5ECF6] shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Overdue
              </span>
              <div className="p-2 rounded-xl bg-rose-50 text-rose-600">
                <AlertCircle className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4">
              <span className="text-3xl font-bold text-rose-600 font-['Plus_Jakarta_Sans'] tabular-nums">
                {formatINR(overdueAmount)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Payments Table */}
      {paymentsState.loading ? (
        <SkeletonTable />
      ) : paymentsState.error ? null : (
        <div className="bg-white rounded-2xl border border-[#E5ECF6] overflow-hidden shadow-xs">
          {payments.length === 0 ? (
            <div className="p-12 text-center text-slate-400">No payment records found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b text-[11px] font-semibold text-slate-500 uppercase">
                    <th className="py-3.5 px-4">Client</th>
                    <th className="py-3.5 px-4">Billing Month</th>
                    <th className="py-3.5 px-4">Amount</th>
                    <th className="py-3.5 px-4">Due Date</th>
                    <th className="py-3.5 px-4">Paid On</th>
                    <th className="py-3.5 px-4">Method</th>
                    <th className="py-3.5 px-4">Reference</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.map((p) => {
                    const displayStatus = getEffectivePaymentStatus(p, todayStr);
                    const totalVal = getEffectivePaymentAmount(p);
                    const hasGst = Number(p.gst_amount) > 0;

                    return (
                      <tr key={p.id} className="hover:bg-slate-50/50 h-[56px]">
                        <td className="py-3 px-4">
                          <button
                            type="button"
                            onClick={() => onOpenClientProfile(p.client_id)}
                            className="font-semibold text-[#1D4ED8] hover:underline inline-flex items-center space-x-1"
                          >
                            <span>{p.clients?.business_name || 'Client'}</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                          {p.invoice_number && (
                            <div className="text-[11px] text-slate-400">{p.invoice_number}</div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-slate-700 font-medium">{p.for_month || '-'}</div>
                          {p.payment_type && (
                            <div className="text-[11px] text-slate-400">{p.payment_type}</div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-[#0A1F5C] tabular-nums">
                            {formatINR(totalVal)}
                          </div>
                          {hasGst && (
                            <div className="text-[10px] text-slate-400 tabular-nums">
                              incl. {formatINR(p.gst_amount)} GST
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-600">{formatDate(p.due_date)}</td>
                        <td className="py-3 px-4 text-slate-600">
                          {p.paid_on ? formatDate(p.paid_on) : '-'}
                        </td>
                        <td className="py-3 px-4 text-slate-600">{p.payment_method || '-'}</td>
                        <td className="py-3 px-4 text-slate-600 font-mono text-[11px]">
                          {p.reference_no || '-'}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2.5 py-0.5 rounded-full font-semibold border text-[10px] ${getStatusBadgeStyle(
                              displayStatus
                            )}`}
                          >
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
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <AddPaymentModal
        isOpen={isAddPaymentOpen}
        onClose={() => setIsAddPaymentOpen(false)}
        onPaymentCreated={(created) => {
          setPaymentsState((prev) => ({
            ...prev,
            data: [created, ...prev.data],
          }));
          onPaymentsMutated?.();
        }}
        onViewClient={onOpenClientProfile}
      />

      <MarkAsPaidModal
        payment={markingPaidPayment}
        onClose={() => setMarkingPaidPayment(null)}
        onSuccess={(updated) => {
          setPaymentsState((prev) => ({
            ...prev,
            data: prev.data.map((row) => (row.id === updated.id ? updated : row)),
          }));
          onPaymentsMutated?.();
        }}
      />
    </div>
  );
}
