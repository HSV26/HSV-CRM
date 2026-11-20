import React, { useEffect, useState } from 'react';
import { Building2, CreditCard, X, Check } from 'lucide-react';
import {
  CompanySettings,
  getCompanySettings,
  saveCompanySettings,
} from '../lib/proposalConfig';
import { useToast } from './Toast';

interface CompanySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (settings: CompanySettings) => void;
}

export default function CompanySettingsModal({
  isOpen,
  onClose,
  onSaved,
}: CompanySettingsModalProps) {
  const { showToast } = useToast();
  const [form, setForm] = useState<CompanySettings>(() => getCompanySettings());

  useEffect(() => {
    if (isOpen) {
      setForm(getCompanySettings());
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const updateField = (key: keyof CompanySettings, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const saved = saveCompanySettings(form);
    showToast('Company & payment settings saved', 'success');
    onSaved?.(saved);
    onClose();
  };

  const inputClass =
    'w-full h-[42px] px-3.5 rounded-xl border border-[#DCEBFF] bg-[#F8FAFF] focus:bg-white text-[13px] text-[#0A1F5C] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#1D4ED8] focus:ring-3 focus:ring-[#1D4ED8]/15 transition-all';

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Company and Payment Settings"
        className="bg-white w-full sm:max-w-[640px] max-h-[92vh] rounded-t-2xl sm:rounded-2xl border border-[#DCEBFF] shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#DCEBFF] flex items-center justify-between bg-white shrink-0">
          <div>
            <h2 className="text-base font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans']">
              Company & Payment Settings
            </h2>
            <p className="text-xs text-slate-500">
              Used in proposal headers, Next Steps, footers, and Payment Details. Empty fields are
              hidden.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="p-2 text-slate-400 hover:text-[#0A1F5C] hover:bg-[#F2F7FF] rounded-xl transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form id="company-settings-form" onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* 1. Company & Tax */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-[#E5ECF6]">
              <Building2 className="w-4 h-4 text-[#1D4ED8]" />
              <h3 className="text-[12px] font-bold uppercase tracking-wider text-[#0A1F5C]">
                1. Company Profile & GSTIN
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <label className="block text-[12px] font-semibold text-[#0A1F5C]">
                  Agency Name
                </label>
                <input
                  type="text"
                  value={form.agencyName}
                  onChange={(e) => updateField('agencyName', e.target.value)}
                  placeholder="HotelStory"
                  className={inputClass}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[12px] font-semibold text-[#0A1F5C]">
                  GSTIN (optional)
                </label>
                <input
                  type="text"
                  value={form.gstin}
                  onChange={(e) => updateField('gstin', e.target.value.toUpperCase())}
                  placeholder="27AABCH1234F1Z5"
                  className={`${inputClass} font-mono uppercase`}
                />
                <p className="text-[11px] text-slate-500">
                  Shown in the proposal header when filled.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[12px] font-semibold text-[#0A1F5C]">
                  Prepared By Name
                </label>
                <input
                  type="text"
                  value={form.preparedByName}
                  onChange={(e) => updateField('preparedByName', e.target.value)}
                  placeholder="Sarvesh Lotankar"
                  className={inputClass}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[12px] font-semibold text-[#0A1F5C]">
                  Prepared By Role
                </label>
                <input
                  type="text"
                  value={form.preparedByRole}
                  onChange={(e) => updateField('preparedByRole', e.target.value)}
                  placeholder="Founder & Brand Strategist"
                  className={inputClass}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[12px] font-semibold text-[#0A1F5C]">
                  Phone / WhatsApp
                </label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => {
                    updateField('phone', e.target.value);
                    updateField('whatsapp', e.target.value);
                  }}
                  placeholder="+91 81044 68397"
                  className={inputClass}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[12px] font-semibold text-[#0A1F5C]">
                  Email (optional)
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  placeholder="hotelstoryindia@gmail.com"
                  className={inputClass}
                />
                <p className="text-[11px] text-slate-500">
                  Leave empty to hide email and show only the phone number.
                </p>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label className="block text-[12px] font-semibold text-[#0A1F5C]">
                  Website (optional)
                </label>
                <input
                  type="text"
                  value={form.website}
                  onChange={(e) => updateField('website', e.target.value)}
                  placeholder="Leave blank to hide website across proposals"
                  className={inputClass}
                />
              </div>
            </div>
          </section>

          {/* 2. Payment Details */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-[#E5ECF6]">
              <CreditCard className="w-4 h-4 text-[#1D4ED8]" />
              <h3 className="text-[12px] font-bold uppercase tracking-wider text-[#0A1F5C]">
                2. Payment Details
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1.5 sm:col-span-2">
                <label className="block text-[12px] font-semibold text-[#0A1F5C]">UPI ID</label>
                <input
                  type="text"
                  value={form.upiId}
                  onChange={(e) => updateField('upiId', e.target.value)}
                  placeholder="e.g. hotelstory@okicici"
                  className={inputClass}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[12px] font-semibold text-[#0A1F5C]">Bank Name</label>
                <input
                  type="text"
                  value={form.bankName}
                  onChange={(e) => updateField('bankName', e.target.value)}
                  placeholder="e.g. HDFC Bank"
                  className={inputClass}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[12px] font-semibold text-[#0A1F5C]">
                  Account Name
                </label>
                <input
                  type="text"
                  value={form.accountName}
                  onChange={(e) => updateField('accountName', e.target.value)}
                  placeholder="e.g. HotelStory Media"
                  className={inputClass}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[12px] font-semibold text-[#0A1F5C]">
                  Account Number
                </label>
                <input
                  type="text"
                  value={form.accountNumber}
                  onChange={(e) => updateField('accountNumber', e.target.value)}
                  placeholder="e.g. 50200012345678"
                  className={`${inputClass} font-mono`}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[12px] font-semibold text-[#0A1F5C]">IFSC Code</label>
                <input
                  type="text"
                  value={form.ifsc}
                  onChange={(e) => updateField('ifsc', e.target.value.toUpperCase())}
                  placeholder="e.g. HDFC0001234"
                  className={`${inputClass} font-mono uppercase`}
                />
              </div>
            </div>
          </section>
        </form>

        {/* Sticky Footer */}
        <div className="px-6 py-4 border-t border-[#DCEBFF] bg-[#F8FAFF] flex items-center justify-end gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white border border-[#DCEBFF] text-[#0A1F5C] rounded-xl text-xs font-semibold hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="company-settings-form"
            className="px-4 py-2 bg-[#1D4ED8] hover:bg-blue-700 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Save Settings</span>
          </button>
        </div>
      </div>
    </div>
  );
}
