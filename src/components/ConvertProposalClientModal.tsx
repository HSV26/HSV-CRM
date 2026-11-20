import React, { useEffect, useState } from 'react';
import { X, Building2, Loader2, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';
import { addOneMonthDate, getTodayInputDate } from '../lib/clientOptions';
import { formatINRInputDisplay, normalizeDeliverables } from '../lib/proposalConfig';

export interface AcceptedProposalForClient {
  id: string;
  lead_id?: string | null;
  business_name?: string | null;
  contact_name?: string | null;
  business_type?: string | null;
  city?: string | null;
  package?: string | null;
  monthly_fee?: number | null;
  start_date?: string | null;
  deliverables?: unknown;
}

interface ConvertProposalClientModalProps {
  proposal: AcceptedProposalForClient | null;
  onClose: () => void;
  onConverted?: (clientId: string) => void;
}

export default function ConvertProposalClientModal({
  proposal,
  onClose,
  onConverted,
}: ConvertProposalClientModalProps) {
  const { showToast } = useToast();
  const [businessName, setBusinessName] = useState('');
  const [contactName, setContactName] = useState('');
  const [city, setCity] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [packageTier, setPackageTier] = useState('Growth');
  const [monthlyFeeDisplay, setMonthlyFeeDisplay] = useState('');
  const [startDate, setStartDate] = useState(getTodayInputDate());
  const [renewalDate, setRenewalDate] = useState(addOneMonthDate(getTodayInputDate()));
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!proposal) return;
    const initStart = proposal.start_date || getTodayInputDate();
    setBusinessName((proposal.business_name || '').trim());
    setContactName((proposal.contact_name || '').trim());
    setCity((proposal.city || '').trim());
    setBusinessType((proposal.business_type || '').trim());
    setPackageTier(proposal.package || 'Growth');
    setMonthlyFeeDisplay(
      proposal.monthly_fee && Number(proposal.monthly_fee) > 0
        ? formatINRInputDisplay(proposal.monthly_fee)
        : ''
    );
    setStartDate(initStart);
    setRenewalDate(addOneMonthDate(initStart));
    setErrorMsg(null);
  }, [proposal]);

  if (!proposal) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!businessName.trim()) {
      setErrorMsg('Please enter a Business Name.');
      return;
    }
    const feeDigits = monthlyFeeDisplay.replace(/\D/g, '');
    const feeNum = feeDigits ? Number(feeDigits) : 0;
    if (feeNum <= 0) {
      setErrorMsg('Please enter a positive Monthly Fee.');
      return;
    }
    if (!startDate || !renewalDate) {
      setErrorMsg('Please select both Start Date and Renewal Date.');
      return;
    }
    if (renewalDate < startDate) {
      setErrorMsg('Renewal Date cannot be before Start Date.');
      return;
    }

    setSaving(true);
    try {
      const deliverablesList = normalizeDeliverables(proposal.deliverables);
      const payload: Record<string, any> = {
        lead_id: proposal.lead_id || null,
        business_name: businessName.trim(),
        contact_name: contactName.trim() || null,
        contact_person: contactName.trim() || null,
        city: city.trim() || null,
        business_type: businessType.trim() || null,
        package: packageTier,
        monthly_fee: feeNum,
        start_date: startDate,
        contract_start: startDate,
        renewal_date: renewalDate,
        deliverables: deliverablesList.length > 0 ? deliverablesList.join(', ') : null,
        status: 'Active',
      };

      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .insert(payload)
        .select()
        .single();

      if (clientError || !clientData) {
        setErrorMsg(clientError?.message || 'Could not create client.');
        setSaving(false);
        return;
      }

      await supabase
        .from('proposals')
        .update({ client_id: clientData.id })
        .eq('id', proposal.id);

      await supabase.from('client_activities').insert({
        client_id: clientData.id,
        type: 'Client Created',
        note: `Converted from accepted proposal (${packageTier}, ₹${new Intl.NumberFormat('en-IN').format(feeNum)}/mo)`,
      });

      if (proposal.lead_id) {
        const { data: leadRow } = await supabase
          .from('leads')
          .select('id, pipeline_stage')
          .eq('id', proposal.lead_id)
          .maybeSingle();

        const leadUpdate: Record<string, any> = { status: 'Won' };
        if (leadRow && 'pipeline_stage' in leadRow) {
          leadUpdate.pipeline_stage = 'Won';
        }
        await supabase.from('leads').update(leadUpdate).eq('id', proposal.lead_id);
        await supabase.from('lead_activities').insert({
          lead_id: proposal.lead_id,
          type: 'Converted',
          outcome: 'Won',
          note: `Converted to client from accepted proposal`,
        });
      }

      showToast('Client created from accepted proposal', 'success');
      setSaving(false);
      onConverted?.(clientData.id);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unexpected error while converting to client.');
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
      onClick={() => !saving && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="convert-proposal-client-title"
        className="bg-white w-full max-w-lg rounded-2xl border border-[#DCEBFF] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-[#E5ECF6] flex items-center justify-between bg-white">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#F2F7FF] border border-[#DCEBFF] text-[#1D4ED8] flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h3
                id="convert-proposal-client-title"
                className="font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans'] text-base"
              >
                Convert to Client
              </h3>
              <p className="text-[12px] text-slate-500">
                Prefilled from your accepted proposal
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-[#0A1F5C] hover:bg-[#F8FAFF] rounded-xl"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 bg-[#F8FAFF]">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-medium text-rose-700">
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1.5 sm:col-span-2">
              <label className="block text-[12px] font-semibold text-[#0A1F5C]">
                Business Name <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="w-full h-[44px] px-3.5 rounded-xl border border-[#DCEBFF] bg-white text-[14px] text-[#0A1F5C] focus:outline-none focus:border-[#1D4ED8] focus:ring-3 focus:ring-[#1D4ED8]/15"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[12px] font-semibold text-[#0A1F5C]">
                Contact Person
              </label>
              <input
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Optional"
                className="w-full h-[44px] px-3.5 rounded-xl border border-[#DCEBFF] bg-white text-[14px] text-[#0A1F5C] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#1D4ED8] focus:ring-3 focus:ring-[#1D4ED8]/15"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[12px] font-semibold text-[#0A1F5C]">
                City
              </label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Optional"
                className="w-full h-[44px] px-3.5 rounded-xl border border-[#DCEBFF] bg-white text-[14px] text-[#0A1F5C] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#1D4ED8] focus:ring-3 focus:ring-[#1D4ED8]/15"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[12px] font-semibold text-[#0A1F5C]">
                Package Tier <span className="text-rose-600">*</span>
              </label>
              <select
                value={packageTier}
                onChange={(e) => setPackageTier(e.target.value)}
                className="w-full h-[44px] px-3.5 rounded-xl border border-[#DCEBFF] bg-white text-[14px] font-medium text-[#0A1F5C] focus:outline-none focus:border-[#1D4ED8] focus:ring-3 focus:ring-[#1D4ED8]/15"
              >
                <option value="Starter">Starter</option>
                <option value="Growth">Growth</option>
                <option value="Dominator">Dominator</option>
                <option value="Custom">Custom</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[12px] font-semibold text-[#0A1F5C]">
                Monthly Fee (₹) <span className="text-rose-600">*</span>
              </label>
              <div className="flex items-center w-full h-[44px] rounded-xl border border-[#DCEBFF] bg-white overflow-hidden focus-within:border-[#1D4ED8] focus-within:ring-3 focus-within:ring-[#1D4ED8]/15">
                <span className="px-3 text-sm font-semibold text-[#0A1F5C] bg-[#F2F7FF] h-full flex items-center border-r border-[#DCEBFF]">
                  ₹
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={monthlyFeeDisplay}
                  onChange={(e) => setMonthlyFeeDisplay(formatINRInputDisplay(e.target.value))}
                  placeholder="45,000"
                  className="w-full h-full px-3 text-[14px] font-semibold text-[#0A1F5C] placeholder:text-[#94A3B8] focus:outline-none tabular-nums"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[12px] font-semibold text-[#0A1F5C]">
                Start Date <span className="text-rose-600">*</span>
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  const val = e.target.value;
                  setStartDate(val);
                  if (val) setRenewalDate(addOneMonthDate(val));
                }}
                className="w-full h-[44px] px-3.5 rounded-xl border border-[#DCEBFF] bg-white text-[14px] text-[#0A1F5C] focus:outline-none focus:border-[#1D4ED8] focus:ring-3 focus:ring-[#1D4ED8]/15"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[12px] font-semibold text-[#0A1F5C]">
                Renewal Date <span className="text-rose-600">*</span>
              </label>
              <input
                type="date"
                value={renewalDate}
                onChange={(e) => setRenewalDate(e.target.value)}
                className="w-full h-[44px] px-3.5 rounded-xl border border-[#DCEBFF] bg-white text-[14px] text-[#0A1F5C] focus:outline-none focus:border-[#1D4ED8] focus:ring-3 focus:ring-[#1D4ED8]/15"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E5ECF6]">
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="px-4 py-2.5 bg-white border border-[#DCEBFF] hover:bg-slate-50 text-[#0A1F5C] rounded-xl text-xs font-semibold"
            >
              Not now
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 bg-[#1D4ED8] hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              <span>{saving ? 'Creating Client...' : 'Create Client'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
