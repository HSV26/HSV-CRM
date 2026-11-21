import React, { useEffect, useState } from 'react';
import { FileText, RotateCcw, Check, X } from 'lucide-react';
import {
  ContractTemplateClause,
  getDefaultContractTemplates,
  resetDefaultContractTemplates,
  saveDefaultContractTemplates,
} from '../lib/contractConfig';
import { useToast } from './Toast';

interface ContractTemplatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (templates: ContractTemplateClause[]) => void;
}

export default function ContractTemplatesModal({
  isOpen,
  onClose,
  onSaved,
}: ContractTemplatesModalProps) {
  const { showToast } = useToast();
  const [templates, setTemplates] = useState<ContractTemplateClause[]>(() =>
    getDefaultContractTemplates()
  );

  useEffect(() => {
    if (isOpen) {
      setTemplates(getDefaultContractTemplates());
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const updateClause = (idx: number, patch: Partial<ContractTemplateClause>) => {
    setTemplates((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  };

  const handleReset = () => {
    const fresh = resetDefaultContractTemplates();
    setTemplates(fresh);
    showToast('Default contract clauses restored', 'info');
    onSaved?.(fresh);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const saved = saveDefaultContractTemplates(templates);
    showToast('Contract templates saved for future contracts', 'success');
    onSaved?.(saved);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Contract Templates"
        className="bg-white w-full sm:max-w-[780px] max-h-[92vh] rounded-t-2xl sm:rounded-2xl border border-[#DCEBFF] shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-[#DCEBFF] flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-[#F2F7FF] text-[#1D4ED8] shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans'] truncate">
                Contract Templates
              </h2>
              <p className="text-xs text-slate-500 truncate">
                Edit default clauses for new contracts. Existing saved contracts stay unchanged.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close templates"
            className="p-2 text-slate-400 hover:text-[#0A1F5C] hover:bg-[#F2F7FF] rounded-xl shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form
          id="contract-templates-form"
          onSubmit={handleSave}
          className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4 bg-[#F8FAFF]"
        >
          <div className="bg-white border border-[#DCEBFF] rounded-xl p-3.5 text-[11px] text-slate-600 leading-relaxed">
            <strong className="text-[#0A1F5C]">Dynamic tokens:</strong>{' '}
            <code className="font-mono text-[#1D4ED8]">{'{{agency_name}}'}</code>,{' '}
            <code className="font-mono text-[#1D4ED8]">{'{{agency_representative}}'}</code>,{' '}
            <code className="font-mono text-[#1D4ED8]">{'{{client_name}}'}</code>,{' '}
            <code className="font-mono text-[#1D4ED8]">{'{{package_name}}'}</code>,{' '}
            <code className="font-mono text-[#1D4ED8]">{'{{deliverables_list}}'}</code>,{' '}
            <code className="font-mono text-[#1D4ED8]">{'{{monthly_fee}}'}</code>,{' '}
            <code className="font-mono text-[#1D4ED8]">{'{{start_date}}'}</code>,{' '}
            <code className="font-mono text-[#1D4ED8]">{'{{notice_period_days}}'}</code>,{' '}
            <code className="font-mono text-[#1D4ED8]">{'{{governing_law}}'}</code>.
          </div>

          <div className="space-y-3.5">
            {templates.map((clause, idx) => (
              <div
                key={clause.key}
                className={`bg-white border rounded-2xl p-4 space-y-3 transition-all ${
                  clause.enabled ? 'border-[#DCEBFF]' : 'border-slate-200 opacity-75'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-[11px] font-bold text-[#1D4ED8] bg-[#F2F7FF] border border-[#DCEBFF] px-2 py-0.5 rounded-md shrink-0">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <input
                      type="text"
                      value={clause.title}
                      onChange={(e) => updateClause(idx, { title: e.target.value })}
                      className="flex-1 min-w-0 h-[36px] px-3 rounded-lg border border-[#DCEBFF] bg-[#F8FAFF] focus:bg-white text-xs font-bold text-[#0A1F5C] focus:outline-none focus:border-[#1D4ED8]"
                    />
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={clause.enabled}
                    onClick={() => updateClause(idx, { enabled: !clause.enabled })}
                    className="inline-flex items-center gap-2 text-xs font-semibold text-[#0A1F5C] shrink-0"
                  >
                    <span
                      className={`relative inline-flex h-5 w-9 items-center rounded-full border transition-colors ${
                        clause.enabled
                          ? 'bg-[#1D4ED8] border-[#1D4ED8]'
                          : 'bg-slate-200 border-slate-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                          clause.enabled ? 'translate-x-4.5' : 'translate-x-0.5'
                        }`}
                      />
                    </span>
                    <span>{clause.enabled ? 'Enabled' : 'Hidden'}</span>
                  </button>
                </div>

                <textarea
                  rows={3}
                  value={clause.body}
                  onChange={(e) => updateClause(idx, { body: e.target.value })}
                  className="w-full p-3 rounded-xl border border-[#DCEBFF] bg-[#F8FAFF] focus:bg-white text-xs text-slate-700 leading-relaxed focus:outline-none focus:border-[#1D4ED8]"
                />
              </div>
            ))}
          </div>
        </form>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-4 border-t border-[#DCEBFF] bg-white flex flex-wrap items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={handleReset}
            className="px-3.5 py-2 bg-[#F8FAFF] border border-[#DCEBFF] text-slate-600 hover:text-[#0A1F5C] rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Defaults</span>
          </button>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white border border-[#DCEBFF] text-[#0A1F5C] rounded-xl text-xs font-semibold hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="contract-templates-form"
              className="px-4 py-2 bg-[#1D4ED8] hover:bg-blue-700 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Save Templates</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
