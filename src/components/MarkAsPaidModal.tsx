import React, { useEffect, useState } from 'react';
import { X, CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';
import { formatINR } from '../lib/utils';
import { getTodayLocalDate } from '../lib/taskOptions';
import {
  PAYMENT_METHOD_OPTIONS,
  getEffectivePaymentAmount,
} from '../lib/paymentOptions';

interface MarkAsPaidModalProps {
  payment: any | null;
  clientName?: string | null;
  onClose: () => void;
  onSuccess: (updatedPayment: any) => void;
}

export default function MarkAsPaidModal({
  payment,
  clientName,
  onClose,
  onSuccess,
}: MarkAsPaidModalProps) {
  const { showToast } = useToast();
  const [paidOn, setPaidOn] = useState(() => getTodayLocalDate());
  const [paymentMethod, setPaymentMethod] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [paidOnError, setPaidOnError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (payment) {
      setPaidOn(payment.paid_on || getTodayLocalDate());
      setPaymentMethod(payment.payment_method || '');
      setReferenceNo(payment.reference_no || '');
      setPaidOnError(null);
      setSaving(false);
    }
  }, [payment?.id]);

  useEffect(() => {
    if (!payment) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [payment, saving, onClose]);

  if (!payment) return null;

  const effectiveAmount = getEffectivePaymentAmount(payment);
  const displayClient = clientName || payment.clients?.business_name || 'Client';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!paidOn) {
      setPaidOnError('Please select the Paid on date.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        status: 'Paid',
        paid_on: paidOn,
        payment_method: paymentMethod || null,
        reference_no: referenceNo.trim() || null,
      };

      const { data, error } = await supabase
        .from('client_payments')
        .update(payload)
        .eq('id', payment.id)
        .select('*, clients(business_name, monthly_fee)')
        .single();

      if (error || !data) {
        showToast('Could not mark payment as paid: ' + (error?.message || 'Unknown error'), 'error');
        setSaving(false);
        return;
      }

      showToast('Payment marked as paid', 'success');
      setSaving(false);
      onSuccess(data);
      onClose();
    } catch (err: any) {
      showToast('Could not mark payment as paid: ' + (err?.message || 'Unexpected error'), 'error');
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-end sm:items-center justify-center sm:p-4"
      onClick={() => !saving && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mark-paid-title"
        className="bg-white w-full sm:max-w-[460px] rounded-t-2xl sm:rounded-2xl shadow-2xl border border-[#DCEBFF] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-[#E5ECF6] flex items-center justify-between bg-white">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <h3
                id="mark-paid-title"
                className="font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans'] text-base"
              >
                Mark as Paid
              </h3>
              <p className="text-[12px] text-slate-600 truncate">
                {displayClient} • {payment.for_month || 'Invoice'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => !saving && onClose()}
            className="p-2 text-slate-500 hover:text-[#0A1F5C] hover:bg-[#F8FAFF] rounded-xl transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="p-5 sm:p-6 bg-[#F8FAFF] space-y-4">
          <div className="bg-white p-3.5 rounded-xl border border-[#DCEBFF] flex items-center justify-between">
            <span className="text-[12px] font-semibold text-slate-600">Amount Due</span>
            <span className="text-lg font-bold text-[#0A1F5C] tabular-nums">
              {formatINR(effectiveAmount)}
            </span>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="mark-paid-date"
              className="block text-[12px] font-semibold text-[#0A1F5C]"
            >
              Paid on <span className="text-rose-600">*</span>
            </label>
            <input
              id="mark-paid-date"
              type="date"
              value={paidOn}
              onChange={(e) => {
                setPaidOn(e.target.value);
                if (e.target.value) setPaidOnError(null);
              }}
              aria-invalid={Boolean(paidOnError)}
              className={`w-full h-[44px] px-3.5 rounded-xl border text-[14px] text-[#0A1F5C] bg-white focus:outline-none ${
                paidOnError
                  ? 'border-rose-500 focus:ring-3 focus:ring-rose-500/20'
                  : 'border-[#DCEBFF] focus:border-[#1D4ED8] focus:ring-3 focus:ring-[#1D4ED8]/15'
              }`}
            />
            {paidOnError && (
              <p className="text-[12px] font-medium text-rose-600">{paidOnError}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="mark-paid-method"
              className="block text-[12px] font-semibold text-[#0A1F5C]"
            >
              Payment method
            </label>
            <select
              id="mark-paid-method"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className={`w-full h-[44px] px-3.5 rounded-xl border border-[#DCEBFF] text-[14px] font-medium bg-white focus:outline-none focus:border-[#1D4ED8] focus:ring-3 focus:ring-[#1D4ED8]/15 ${
                paymentMethod ? 'text-[#0A1F5C]' : 'text-[#94A3B8]'
              }`}
            >
              <option value="">Select payment method</option>
              {PAYMENT_METHOD_OPTIONS.map((m) => (
                <option key={m} value={m} className="text-[#0A1F5C]">
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="mark-paid-reference"
              className="block text-[12px] font-semibold text-[#0A1F5C]"
            >
              Reference / Transaction number
            </label>
            <input
              id="mark-paid-reference"
              type="text"
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
              placeholder="UTR / UPI Ref #..."
              className="w-full h-[44px] px-3.5 rounded-xl border border-[#DCEBFF] text-[14px] text-[#0A1F5C] bg-white placeholder:text-[#94A3B8] focus:outline-none focus:border-[#1D4ED8] focus:ring-3 focus:ring-[#1D4ED8]/15"
            />
          </div>

          <div className="pt-3 border-t border-[#E5ECF6] flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="tactile-btn-secondary px-4 py-2.5 text-[13px] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="tactile-btn-primary px-5 py-2.5 text-[13px] flex items-center gap-1.5 disabled:opacity-60"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{saving ? 'Saving...' : 'Confirm Payment'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
