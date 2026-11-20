import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  IndianRupee,
  Receipt,
  CalendarClock,
  FileText,
  ChevronDown,
  Search,
  Check,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { safeQuery } from '../lib/db';
import { useToast } from './Toast';
import { formatINR } from '../lib/utils';
import { getTodayLocalDate } from '../lib/taskOptions';
import {
  PAYMENT_TYPE_OPTIONS,
  PAYMENT_STATUS_OPTIONS,
  PAYMENT_METHOD_OPTIONS,
  getCurrentMonthInputValue,
  formatMonthPickerToLabel,
  normalizeMonthKey,
  getQuickPaymentDueDates,
  formatIndianAmountInput,
  parseFormattedAmount,
} from '../lib/paymentOptions';

export interface PaymentClientOption {
  id: string;
  business_name: string | null;
  monthly_fee?: number | null;
}

interface ExistingPaymentSummary {
  id: string;
  client_id: string | null;
  for_month: string | null;
  payment_type?: string | null;
  status?: string | null;
}

interface AddPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultClientId?: string | null;
  clientsList?: PaymentClientOption[];
  onPaymentCreated?: (payment: any) => void;
  onViewClient?: (clientId: string) => void;
}

type SectionKey = 'payment' | 'tax' | 'dates' | 'details';

const STEPS: { key: SectionKey; label: string }[] = [
  { key: 'payment', label: 'Payment' },
  { key: 'tax', label: 'Tax' },
  { key: 'dates', label: 'Dates' },
  { key: 'details', label: 'Details' },
];

function formatRupeesWithDecimals(value: number): string {
  if (!isFinite(value) || isNaN(value)) return '₹0';
  const rounded = Math.round(value * 100) / 100;
  const hasDecimals = Math.abs(rounded % 1) > 0.001;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: hasDecimals ? 2 : 0,
  }).format(rounded);
}

export default function AddPaymentModal({
  isOpen,
  onClose,
  defaultClientId = null,
  clientsList,
  onPaymentCreated,
  onViewClient,
}: AddPaymentModalProps) {
  const { showToast } = useToast();

  // Accessibility, focus & section refs
  const openerRef = useRef<HTMLElement | null>(null);
  const skipRestoreFocusRef = useRef(false);
  const clientTriggerRef = useRef<HTMLButtonElement | null>(null);
  const amountInputRef = useRef<HTMLInputElement | null>(null);
  const clientDropdownRef = useRef<HTMLDivElement | null>(null);
  const clientSearchInputRef = useRef<HTMLInputElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Record<SectionKey, HTMLElement | null>>({
    payment: null,
    tax: null,
    dates: null,
    details: null,
  });

  // Lookup state
  const [clients, setClients] = useState<PaymentClientOption[]>(clientsList || []);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [knownPayments, setKnownPayments] = useState<ExistingPaymentSummary[]>([]);

  // 1. PAYMENT
  const [clientId, setClientId] = useState('');
  const [paymentType, setPaymentType] = useState<string>('Monthly retainer');
  const [billingMonth, setBillingMonth] = useState<string>(() => getCurrentMonthInputValue());
  const [amountDisplay, setAmountDisplay] = useState('');

  // 2. TAX
  const [gstEnabled, setGstEnabled] = useState(false);
  const [gstPercentInput, setGstPercentInput] = useState('18');

  // 3. DATES AND STATUS
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState<string>('Due');
  const [paidOn, setPaidOn] = useState('');

  // 4. DETAILS
  const [paymentMethod, setPaymentMethod] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [note, setNote] = useState('');

  // UI & Validation state
  const [activeStep, setActiveStep] = useState<SectionKey>('payment');
  const [fieldErrors, setFieldErrors] = useState<{
    clientId?: string;
    billingMonth?: string;
    amount?: string;
    gstPercent?: string;
    dueDate?: string;
    paidOn?: string;
  }>({});
  const [submittingMode, setSubmittingMode] = useState<'close' | 'another' | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const quickDueDates = useMemo(() => getQuickPaymentDueDates(), [isOpen]);
  const todayStr = useMemo(() => getTodayLocalDate(), [isOpen]);

  const resetForm = (keepClientAndType = false) => {
    if (!keepClientAndType) {
      setClientId(defaultClientId || '');
      setPaymentType('Monthly retainer');
    }
    setBillingMonth(getCurrentMonthInputValue());
    setAmountDisplay(''); // Never prefill any amount automatically
    setGstEnabled(false);
    setGstPercentInput('18');
    setDueDate('');
    setStatus('Due');
    setPaidOn('');
    setPaymentMethod('');
    setReferenceNo('');
    setInvoiceNumber('');
    setNote('');
    setFieldErrors({});
    setClientDropdownOpen(false);
    setClientSearch('');
    setShowDiscardConfirm(false);
    setActiveStep('payment');
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  };

  useEffect(() => {
    if (isOpen) {
      openerRef.current = document.activeElement as HTMLElement | null;
      skipRestoreFocusRef.current = false;
      resetForm(false);
      setSubmittingMode(null);

      if (clientsList && clientsList.length > 0) {
        setClients(clientsList);
      } else {
        setClientsLoading(true);
        safeQuery(async () => {
          const { data, error } = await supabase
            .from('clients')
            .select('id, business_name, monthly_fee')
            .order('business_name', { ascending: true });
          return { data: data || [], error };
        }, []).then((res) => {
          setClients(res.data);
          setClientsLoading(false);
        });
      }

      safeQuery(async () => {
        const { data, error } = await supabase
          .from('client_payments')
          .select('id, client_id, for_month, payment_type, status');
        return { data: data || [], error };
      }, []).then((res) => {
        setKnownPayments(res.data);
      });

      const timer = setTimeout(() => {
        if (defaultClientId) {
          amountInputRef.current?.focus();
        } else {
          clientTriggerRef.current?.focus();
        }
      }, 25);
      return () => clearTimeout(timer);
    } else if (openerRef.current) {
      const toFocus = openerRef.current;
      const shouldSkip = skipRestoreFocusRef.current;
      openerRef.current = null;
      skipRestoreFocusRef.current = false;
      if (!shouldSkip) {
        setTimeout(() => {
          toFocus?.focus?.();
        }, 0);
      }
    }
  }, [isOpen, defaultClientId]);

  useEffect(() => {
    if (isOpen && clientsList && clientsList.length > 0) {
      setClients(clientsList);
    }
  }, [isOpen, clientsList]);

  useEffect(() => {
    if (!clientDropdownOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(e.target as Node)) {
        setClientDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [clientDropdownOpen]);

  useEffect(() => {
    if (clientDropdownOpen) {
      setTimeout(() => {
        clientSearchInputRef.current?.focus();
      }, 15);
    }
  }, [clientDropdownOpen]);

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === clientId) || null,
    [clients, clientId]
  );

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => (c.business_name || '').toLowerCase().includes(q));
  }, [clients, clientSearch]);

  const baseAmount = useMemo(() => parseFormattedAmount(amountDisplay), [amountDisplay]);
  const parsedGstPercent = useMemo(() => {
    const num = Number(gstPercentInput);
    return isNaN(num) || num < 0 ? 0 : num;
  }, [gstPercentInput]);

  const gstAmount = useMemo(() => {
    if (!gstEnabled) return 0;
    return Math.round(baseAmount * (parsedGstPercent / 100) * 100) / 100;
  }, [gstEnabled, baseAmount, parsedGstPercent]);

  const totalAmount = useMemo(() => {
    return Math.round((baseAmount + gstAmount) * 100) / 100;
  }, [baseAmount, gstAmount]);

  const duplicatePayment = useMemo(() => {
    if (!clientId || !billingMonth || !paymentType) return null;
    const targetMonthKey = normalizeMonthKey(billingMonth);
    return (
      knownPayments.find((p) => {
        if (p.client_id !== clientId) return false;
        const pMonthKey = normalizeMonthKey(p.for_month);
        if (pMonthKey !== targetMonthKey) return false;
        const pType = p.payment_type || 'Monthly retainer';
        return pType === paymentType;
      }) || null
    );
  }, [knownPayments, clientId, billingMonth, paymentType]);

  const willDisplayOverdue = Boolean(status !== 'Paid' && dueDate && dueDate < todayStr);

  const isDirty = useMemo(() => {
    return Boolean(
      (clientId && clientId !== (defaultClientId || '')) ||
        paymentType !== 'Monthly retainer' ||
        billingMonth !== getCurrentMonthInputValue() ||
        amountDisplay.trim() ||
        gstEnabled ||
        gstPercentInput !== '18' ||
        dueDate ||
        status !== 'Due' ||
        paymentMethod ||
        referenceNo.trim() ||
        invoiceNumber.trim() ||
        note.trim()
    );
  }, [
    clientId,
    defaultClientId,
    paymentType,
    billingMonth,
    amountDisplay,
    gstEnabled,
    gstPercentInput,
    dueDate,
    status,
    paymentMethod,
    referenceNo,
    invoiceNumber,
    note,
  ]);

  const attemptClose = () => {
    if (submittingMode) return;
    if (isDirty) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (clientDropdownOpen) {
          setClientDropdownOpen(false);
          clientTriggerRef.current?.focus();
          return;
        }
        if (showDiscardConfirm) {
          setShowDiscardConfirm(false);
        } else {
          attemptClose();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!submittingMode) {
          savePayment('close');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  if (!isOpen) return null;

  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const scrollTop = container.scrollTop;
    const containerTop = container.getBoundingClientRect().top;

    if (container.scrollHeight - container.clientHeight - scrollTop < 24) {
      setActiveStep('details');
      return;
    }

    let current: SectionKey = 'payment';
    for (const step of STEPS) {
      const el = sectionRefs.current[step.key];
      if (!el) continue;
      const offsetFromTop = el.getBoundingClientRect().top - containerTop;
      if (offsetFromTop <= 80) {
        current = step.key;
      }
    }
    setActiveStep(current);
  };

  const jumpToSection = (key: SectionKey) => {
    setActiveStep(key);
    const el = sectionRefs.current[key];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleStatusChange = (nextStatus: string) => {
    setStatus(nextStatus);
    if (nextStatus === 'Paid') {
      if (!paidOn) {
        setPaidOn(getTodayLocalDate());
      }
    } else {
      setPaidOn('');
      setPaymentMethod('');
      setFieldErrors((prev) => ({ ...prev, paidOn: undefined }));
    }
  };

  const validateAll = (): boolean => {
    const errors: typeof fieldErrors = {};

    if (!clientId) {
      errors.clientId = 'Please select a Client.';
    }

    if (!billingMonth) {
      errors.billingMonth = 'Please select a Billing month.';
    }

    if (!amountDisplay.trim() || baseAmount <= 0) {
      errors.amount = 'Amount must be a positive number.';
    }

    if (gstEnabled) {
      const rawPct = Number(gstPercentInput);
      if (gstPercentInput.trim() === '' || isNaN(rawPct) || rawPct < 0 || rawPct > 100) {
        errors.gstPercent = 'Enter a valid GST percentage (0 to 100).';
      }
    }

    if (!dueDate) {
      errors.dueDate = 'Please select a Due date.';
    }

    if (status === 'Paid' && !paidOn) {
      errors.paidOn = 'Please select the Paid on date.';
    }

    setFieldErrors(errors);

    if (errors.clientId || errors.billingMonth || errors.amount) {
      jumpToSection('payment');
      if (errors.clientId) clientTriggerRef.current?.focus();
      else if (errors.amount) amountInputRef.current?.focus();
      return false;
    }
    if (errors.gstPercent) {
      jumpToSection('tax');
      return false;
    }
    if (errors.dueDate || errors.paidOn) {
      jumpToSection('dates');
      return false;
    }

    return true;
  };

  const savePayment = async (mode: 'close' | 'another') => {
    if (submittingMode) return;
    if (!validateAll()) return;

    setSubmittingMode(mode);
    try {
      const forMonthLabel = formatMonthPickerToLabel(billingMonth);
      const isPaid = status === 'Paid';

      const payload = {
        client_id: clientId,
        payment_type: paymentType || null,
        for_month: forMonthLabel,
        amount: baseAmount,
        gst_percent: gstEnabled ? parsedGstPercent : null,
        gst_amount: gstEnabled ? gstAmount : null,
        total_amount: totalAmount,
        due_date: dueDate,
        status: status || 'Due',
        paid_on: isPaid ? paidOn : null,
        payment_method: isPaid && paymentMethod ? paymentMethod : null,
        reference_no: referenceNo.trim() || null,
        invoice_number: invoiceNumber.trim() || null,
        note: note.trim() || null,
      };

      const { data, error } = await supabase
        .from('client_payments')
        .insert(payload)
        .select('*, clients(business_name, monthly_fee)')
        .single();

      if (error || !data) {
        showToast('Could not add payment: ' + (error?.message || 'Unknown error'), 'error');
        setSubmittingMode(null);
        return;
      }

      const { error: activityError } = await supabase.from('client_activities').insert({
        client_id: clientId,
        type: 'Payment recorded',
        note: `Payment recorded: ${forMonthLabel} • ${formatRupeesWithDecimals(totalAmount)} (${status})`,
      });
      if (activityError) {
        console.error('Could not insert client_activities row:', activityError);
      }

      setKnownPayments((prev) => [
        {
          id: data.id,
          client_id: data.client_id,
          for_month: data.for_month,
          payment_type: data.payment_type,
          status: data.status,
        },
        ...prev,
      ]);

      const createdClientId = clientId;
      showToast(
        'Payment added',
        'success',
        onViewClient
          ? {
              label: 'View client',
              onClick: () => {
                skipRestoreFocusRef.current = true;
                onClose();
                onViewClient(createdClientId);
              },
            }
          : undefined
      );

      onPaymentCreated?.(data);

      if (mode === 'another') {
        resetForm(true);
        setSubmittingMode(null);
        setTimeout(() => {
          amountInputRef.current?.focus();
        }, 25);
      } else {
        setSubmittingMode(null);
        onClose();
      }
    } catch (err: any) {
      showToast('Could not add payment: ' + (err?.message || 'Unexpected error'), 'error');
      setSubmittingMode(null);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    savePayment('close');
  };

  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT') {
        e.preventDefault();
      }
    }
  };

  const inputBaseClass = (filled: boolean, hasError?: boolean) =>
    `w-full h-[44px] px-3.5 rounded-xl border text-[16px] sm:text-[14px] text-[#0A1F5C] placeholder:text-[#94A3B8] placeholder:text-[16px] sm:placeholder:text-[14px] transition-all focus:outline-none ${
      filled ? 'bg-white shadow-2xs' : 'bg-[#F8FAFF]'
    } ${
      hasError
        ? 'border-rose-500 focus:border-rose-500 focus:ring-3 focus:ring-rose-500/20'
        : 'border-[#DCEBFF] focus:bg-white focus:border-[#1D4ED8] focus:ring-3 focus:ring-[#1D4ED8]/15'
    }`;

  const prefixedWrapperClass = (filled: boolean, hasError?: boolean) =>
    `flex items-center w-full h-[44px] rounded-xl border overflow-hidden transition-all ${
      filled ? 'bg-white shadow-2xs' : 'bg-[#F8FAFF]'
    } ${
      hasError
        ? 'border-rose-500 focus-within:border-rose-500 focus-within:ring-3 focus-within:ring-rose-500/20'
        : 'border-[#DCEBFF] focus-within:bg-white focus-within:border-[#1D4ED8] focus-within:ring-3 focus-within:ring-[#1D4ED8]/15'
    }`;

  const clientMonthlyFee = Number(selectedClient?.monthly_fee) || 0;
  const showUseMonthlyFeeBtn = Boolean(
    selectedClient && clientMonthlyFee > 0 && paymentType === 'Monthly retainer'
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-end sm:items-center justify-center sm:p-4"
      onClick={attemptClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-payment-modal-title"
        className="bg-white w-full sm:max-w-[640px] max-h-[92dvh] sm:max-h-[90vh] rounded-t-2xl sm:rounded-2xl shadow-2xl border border-[#DCEBFF] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-[#E5ECF6] flex items-center justify-between shrink-0 bg-white">
          <div>
            <h3
              id="add-payment-modal-title"
              className="font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans'] text-lg"
            >
              Add New Payment
            </h3>
            <p className="text-[12px] text-slate-600">
              Record a client invoice, GST breakdown, due date, and payment details.
            </p>
          </div>
          <button
            type="button"
            onClick={attemptClose}
            className="p-2 text-slate-500 hover:text-[#0A1F5C] hover:bg-[#F8FAFF] rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Slim Step Indicator */}
        <nav
          aria-label="Payment form sections"
          className="px-5 sm:px-6 py-2.5 bg-[#F8FAFF] border-b border-[#E5ECF6] shrink-0"
        >
          <div className="grid grid-cols-4 gap-2">
            {STEPS.map((step, index) => {
              const isActive = activeStep === step.key;
              return (
                <button
                  key={step.key}
                  type="button"
                  onClick={() => jumpToSection(step.key)}
                  className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-[12px] font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] ${
                    isActive
                      ? 'bg-[#1D4ED8] text-white shadow-xs'
                      : 'bg-white text-slate-600 border border-[#DCEBFF] hover:text-[#1D4ED8] hover:border-[#3B82F6]'
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full text-[11px] flex items-center justify-center font-bold shrink-0 ${
                      isActive ? 'bg-white/20 text-white' : 'bg-[#EEF2F8] text-[#0A1F5C]'
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span className="truncate">{step.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* Discard Confirmation Strip */}
        {showDiscardConfirm && (
          <div
            role="alertdialog"
            aria-label="Discard changes confirmation"
            className="px-5 sm:px-6 py-3 bg-amber-50 border-b border-amber-200 flex flex-wrap items-center justify-between gap-3 shrink-0"
          >
            <p className="text-[13px] font-semibold text-amber-900">
              Discard this payment? Unsaved details will be lost.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowDiscardConfirm(false)}
                className="px-3 py-1.5 bg-white border border-amber-300 text-amber-900 rounded-lg text-xs font-semibold hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                Keep editing
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDiscardConfirm(false);
                  onClose();
                }}
                className="px-3 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-semibold hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500"
              >
                Discard
              </button>
            </div>
          </div>
        )}

        {/* Scrollable Form Body */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 bg-[#F8FAFF]"
        >
          <form
            id="add-payment-form"
            onSubmit={handleFormSubmit}
            onKeyDown={handleFormKeyDown}
            noValidate
            className="space-y-6"
          >
            {/* SECTION 1: PAYMENT */}
            <section
              ref={(el) => {
                sectionRefs.current.payment = el;
              }}
              className="space-y-4 scroll-mt-4"
            >
              <div className="flex items-center gap-2">
                <IndianRupee className="w-4 h-4 text-[#1D4ED8]" />
                <h4 className="text-[12px] font-bold text-[#0A1F5C] uppercase tracking-wider">
                  1. Payment
                </h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Searchable Client Dropdown */}
                <div className="space-y-1.5 sm:col-span-2" ref={clientDropdownRef}>
                  <label
                    htmlFor="payment-client-trigger"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Client <span className="text-rose-600">*</span>
                  </label>
                  <div className="relative">
                    <button
                      id="payment-client-trigger"
                      ref={clientTriggerRef}
                      type="button"
                      onClick={() => setClientDropdownOpen((prev) => !prev)}
                      aria-expanded={clientDropdownOpen}
                      aria-invalid={Boolean(fieldErrors.clientId)}
                      className={`w-full h-[44px] px-3.5 rounded-xl border text-[16px] sm:text-[14px] flex items-center justify-between gap-2 transition-all focus:outline-none ${
                        selectedClient
                          ? 'bg-white shadow-2xs text-[#0A1F5C] font-medium'
                          : 'bg-[#F8FAFF] text-[#94A3B8]'
                      } ${
                        fieldErrors.clientId
                          ? 'border-rose-500 focus:border-rose-500 focus:ring-3 focus:ring-rose-500/20'
                          : 'border-[#DCEBFF] focus:bg-white focus:border-[#1D4ED8] focus:ring-3 focus:ring-[#1D4ED8]/15'
                      }`}
                    >
                      <span className="truncate">
                        {selectedClient
                          ? selectedClient.business_name || 'Unnamed client'
                          : clientsLoading
                          ? 'Loading clients...'
                          : 'Search and select a client...'}
                      </span>
                      <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                    </button>

                    {clientDropdownOpen && (
                      <div className="absolute left-0 right-0 mt-1.5 bg-white border border-[#DCEBFF] rounded-xl shadow-xl z-30 overflow-hidden">
                        <div className="p-2 border-b border-[#E5ECF6] bg-[#F8FAFF] flex items-center gap-2">
                          <Search className="w-4 h-4 text-slate-400 shrink-0 ml-1" />
                          <input
                            ref={clientSearchInputRef}
                            type="text"
                            value={clientSearch}
                            onChange={(e) => setClientSearch(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                if (filteredClients.length > 0) {
                                  const pick = filteredClients[0];
                                  setClientId(pick.id);
                                  setClientDropdownOpen(false);
                                  setClientSearch('');
                                  setFieldErrors((prev) => ({ ...prev, clientId: undefined }));
                                }
                              }
                            }}
                            placeholder="Type client name..."
                            className="w-full py-1.5 pr-2 bg-transparent text-[14px] text-[#0A1F5C] placeholder:text-[#94A3B8] focus:outline-none"
                          />
                        </div>
                        <div className="max-h-52 overflow-y-auto divide-y divide-slate-100">
                          {filteredClients.length === 0 ? (
                            <div className="px-4 py-4 text-center text-[13px] text-slate-500">
                              No clients match "{clientSearch}".
                            </div>
                          ) : (
                            filteredClients.map((c) => {
                              const isSelected = c.id === clientId;
                              return (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => {
                                    setClientId(c.id);
                                    setClientDropdownOpen(false);
                                    setClientSearch('');
                                    setFieldErrors((prev) => ({ ...prev, clientId: undefined }));
                                  }}
                                  className={`w-full px-3.5 py-2.5 text-left text-[13px] flex items-center justify-between gap-2 transition-colors ${
                                    isSelected
                                      ? 'bg-blue-50 text-[#1D4ED8] font-semibold'
                                      : 'text-[#0A1F5C] hover:bg-[#F8FAFF]'
                                  }`}
                                >
                                  <span className="truncate">{c.business_name || 'Unnamed client'}</span>
                                  <div className="flex items-center gap-2 shrink-0">
                                    {Number(c.monthly_fee) > 0 && (
                                      <span className="text-[11px] font-medium text-slate-500 tabular-nums">
                                        {formatINR(c.monthly_fee)}/mo
                                      </span>
                                    )}
                                    {isSelected && <Check className="w-4 h-4 text-[#1D4ED8]" />}
                                  </div>
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  {fieldErrors.clientId && (
                    <p className="text-[12px] font-medium text-rose-600">{fieldErrors.clientId}</p>
                  )}
                </div>

                {/* Payment Type */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="payment-type"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Payment type
                  </label>
                  <select
                    id="payment-type"
                    value={paymentType}
                    onChange={(e) => setPaymentType(e.target.value)}
                    className={`${inputBaseClass(Boolean(paymentType))} font-medium`}
                  >
                    {PAYMENT_TYPE_OPTIONS.map((pt) => (
                      <option key={pt} value={pt} className="text-[#0A1F5C]">
                        {pt}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Billing Month */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="payment-billing-month"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Billing month <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id="payment-billing-month"
                    type="month"
                    value={billingMonth}
                    onChange={(e) => {
                      setBillingMonth(e.target.value);
                      if (fieldErrors.billingMonth && e.target.value) {
                        setFieldErrors((prev) => ({ ...prev, billingMonth: undefined }));
                      }
                    }}
                    onBlur={() => {
                      if (!billingMonth) {
                        setFieldErrors((prev) => ({
                          ...prev,
                          billingMonth: 'Please select a Billing month.',
                        }));
                      }
                    }}
                    aria-invalid={Boolean(fieldErrors.billingMonth)}
                    className={`${inputBaseClass(Boolean(billingMonth), Boolean(fieldErrors.billingMonth))} font-medium`}
                  />
                  {fieldErrors.billingMonth && (
                    <p className="text-[12px] font-medium text-rose-600">{fieldErrors.billingMonth}</p>
                  )}
                </div>

                {/* Amount in ₹ */}
                <div className="space-y-1.5 sm:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label
                      htmlFor="payment-amount"
                      className="block text-[12px] font-semibold text-[#0A1F5C]"
                    >
                      Amount in ₹ <span className="text-rose-600">*</span>
                    </label>
                    {showUseMonthlyFeeBtn && (
                      <button
                        type="button"
                        onClick={() => {
                          setAmountDisplay(formatIndianAmountInput(String(clientMonthlyFee)));
                          setFieldErrors((prev) => ({ ...prev, amount: undefined }));
                        }}
                        className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 border border-[#DCEBFF] text-[#1D4ED8] text-[12px] font-semibold transition-colors"
                      >
                        Use monthly fee {formatINR(clientMonthlyFee)}
                      </button>
                    )}
                  </div>

                  <div className={prefixedWrapperClass(Boolean(amountDisplay.trim()), Boolean(fieldErrors.amount))}>
                    <span className="h-full px-3.5 flex items-center bg-[#EEF2F8] border-r border-[#DCEBFF] text-[#0A1F5C] font-semibold text-[14px] select-none">
                      ₹
                    </span>
                    <input
                      id="payment-amount"
                      ref={amountInputRef}
                      type="text"
                      inputMode="decimal"
                      value={amountDisplay}
                      onChange={(e) => {
                        const formatted = formatIndianAmountInput(e.target.value);
                        setAmountDisplay(formatted);
                        if (fieldErrors.amount && parseFormattedAmount(formatted) > 0) {
                          setFieldErrors((prev) => ({ ...prev, amount: undefined }));
                        }
                      }}
                      onBlur={() => {
                        if (!amountDisplay.trim() || baseAmount <= 0) {
                          setFieldErrors((prev) => ({
                            ...prev,
                            amount: 'Amount must be a positive number.',
                          }));
                        }
                      }}
                      aria-invalid={Boolean(fieldErrors.amount)}
                      placeholder="45,000"
                      className="w-full h-full px-3 bg-transparent text-[16px] sm:text-[14px] text-[#0A1F5C] font-semibold tabular-nums placeholder:text-[#94A3B8] placeholder:font-normal placeholder:text-[16px] sm:placeholder:text-[14px] focus:outline-none"
                    />
                  </div>
                  {fieldErrors.amount && (
                    <p className="text-[12px] font-medium text-rose-600">{fieldErrors.amount}</p>
                  )}
                </div>

                {/* Duplicate Payment Warning (non-blocking) */}
                {duplicatePayment && (
                  <div className="sm:col-span-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-2 text-[12px]">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>
                      A <strong>{paymentType}</strong> payment for{' '}
                      <strong>{formatMonthPickerToLabel(billingMonth)}</strong> already exists for{' '}
                      <strong>{selectedClient?.business_name || 'this client'}</strong>. You can still save if intentional.
                    </span>
                  </div>
                )}
              </div>
            </section>

            {/* SECTION 2: TAX */}
            <section
              ref={(el) => {
                sectionRefs.current.tax = el;
              }}
              className="space-y-4 pt-6 border-t border-[#E5ECF6] scroll-mt-4"
            >
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-[#1D4ED8]" />
                <h4 className="text-[12px] font-bold text-[#0A1F5C] uppercase tracking-wider">
                  2. Tax
                </h4>
              </div>

              <div className="bg-white rounded-xl border border-[#DCEBFF] p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={gstEnabled}
                      aria-label="Enable GST"
                      onClick={() => {
                        const next = !gstEnabled;
                        setGstEnabled(next);
                        if (!next) {
                          setFieldErrors((prev) => ({ ...prev, gstPercent: undefined }));
                        }
                      }}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/40 ${
                        gstEnabled ? 'bg-[#1D4ED8]' : 'bg-slate-200'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition-transform ${
                          gstEnabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                    <div>
                      <span className="block text-[13px] font-semibold text-[#0A1F5C]">
                        Add GST
                      </span>
                      <span className="block text-[12px] text-slate-500">
                        {gstEnabled ? 'Tax included in total amount' : 'No GST applied to this payment'}
                      </span>
                    </div>
                  </div>

                  {gstEnabled && (
                    <div className="w-36 space-y-1">
                      <label
                        htmlFor="payment-gst-percent"
                        className="block text-[12px] font-semibold text-[#0A1F5C]"
                      >
                        GST %
                      </label>
                      <div className={prefixedWrapperClass(Boolean(gstPercentInput), Boolean(fieldErrors.gstPercent))}>
                        <input
                          id="payment-gst-percent"
                          type="number"
                          min="0"
                          max="100"
                          step="0.5"
                          value={gstPercentInput}
                          onChange={(e) => {
                            setGstPercentInput(e.target.value);
                            if (fieldErrors.gstPercent) {
                              setFieldErrors((prev) => ({ ...prev, gstPercent: undefined }));
                            }
                          }}
                          className="w-full h-full px-3 bg-transparent text-[14px] font-semibold text-[#0A1F5C] tabular-nums focus:outline-none"
                        />
                        <span className="h-full px-3 flex items-center bg-[#EEF2F8] border-l border-[#DCEBFF] text-[#0A1F5C] font-semibold text-[13px] select-none">
                          %
                        </span>
                      </div>
                      {fieldErrors.gstPercent && (
                        <p className="text-[11px] font-medium text-rose-600">{fieldErrors.gstPercent}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Live Summary */}
                <div className="bg-[#F8FAFF] rounded-xl border border-[#E5ECF6] p-3.5 space-y-2 text-[13px]">
                  <div className="flex items-center justify-between text-slate-600">
                    <span>Amount</span>
                    <span className="font-semibold text-[#0A1F5C] tabular-nums">
                      {formatRupeesWithDecimals(baseAmount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-600">
                    <span>GST {gstEnabled ? `(${parsedGstPercent}%)` : '(Off)'}</span>
                    <span className="font-semibold text-[#0A1F5C] tabular-nums">
                      {formatRupeesWithDecimals(gstAmount)}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-[#DCEBFF] flex items-center justify-between">
                    <span className="font-bold text-[#0A1F5C]">Total</span>
                    <span className="text-base font-bold text-[#1D4ED8] tabular-nums">
                      {formatRupeesWithDecimals(totalAmount)}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            {/* SECTION 3: DATES AND STATUS */}
            <section
              ref={(el) => {
                sectionRefs.current.dates = el;
              }}
              className="space-y-4 pt-6 border-t border-[#E5ECF6] scroll-mt-4"
            >
              <div className="flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-[#1D4ED8]" />
                <h4 className="text-[12px] font-bold text-[#0A1F5C] uppercase tracking-wider">
                  3. Dates and status
                </h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Due Date */}
                <div className="space-y-1.5 sm:col-span-2">
                  <label
                    htmlFor="payment-due-date"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Due date <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id="payment-due-date"
                    type="date"
                    value={dueDate}
                    onChange={(e) => {
                      setDueDate(e.target.value);
                      if (fieldErrors.dueDate && e.target.value) {
                        setFieldErrors((prev) => ({ ...prev, dueDate: undefined }));
                      }
                    }}
                    onBlur={() => {
                      if (!dueDate) {
                        setFieldErrors((prev) => ({
                          ...prev,
                          dueDate: 'Please select a Due date.',
                        }));
                      }
                    }}
                    aria-invalid={Boolean(fieldErrors.dueDate)}
                    className={`${inputBaseClass(Boolean(dueDate), Boolean(fieldErrors.dueDate))} font-medium ${
                      dueDate ? 'text-[#0A1F5C]' : 'text-[#94A3B8]'
                    }`}
                  />
                  {fieldErrors.dueDate && (
                    <p className="text-[12px] font-medium text-rose-600">{fieldErrors.dueDate}</p>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-[12px] font-medium text-slate-600 mr-1">Quick set:</span>
                    {quickDueDates.map((btn) => {
                      const isActive = dueDate === btn.value;
                      return (
                        <button
                          key={btn.label}
                          type="button"
                          onClick={() => {
                            setDueDate(btn.value);
                            setFieldErrors((prev) => ({ ...prev, dueDate: undefined }));
                          }}
                          className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-all focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/40 ${
                            isActive
                              ? 'bg-[#1D4ED8] text-white border-[#1D4ED8]'
                              : 'bg-white text-[#0A1F5C] border-[#DCEBFF] hover:border-[#1D4ED8] hover:text-[#1D4ED8]'
                          }`}
                        >
                          {btn.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Status */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="payment-status"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Status
                  </label>
                  <select
                    id="payment-status"
                    value={status}
                    onChange={(e) => handleStatusChange(e.target.value)}
                    className={`${inputBaseClass(Boolean(status))} font-medium`}
                  >
                    {PAYMENT_STATUS_OPTIONS.map((st) => (
                      <option key={st} value={st} className="text-[#0A1F5C]">
                        {st}
                      </option>
                    ))}
                  </select>
                  {willDisplayOverdue && (
                    <p className="text-[12px] font-medium text-rose-600">
                      Due date has passed — this invoice will display as Overdue.
                    </p>
                  )}
                </div>

                {/* Paid On (shown & required only when status === 'Paid') */}
                {status === 'Paid' && (
                  <div className="space-y-1.5">
                    <label
                      htmlFor="payment-paid-on"
                      className="block text-[12px] font-semibold text-[#0A1F5C]"
                    >
                      Paid on <span className="text-rose-600">*</span>
                    </label>
                    <input
                      id="payment-paid-on"
                      type="date"
                      value={paidOn}
                      onChange={(e) => {
                        setPaidOn(e.target.value);
                        if (fieldErrors.paidOn && e.target.value) {
                          setFieldErrors((prev) => ({ ...prev, paidOn: undefined }));
                        }
                      }}
                      onBlur={() => {
                        if (status === 'Paid' && !paidOn) {
                          setFieldErrors((prev) => ({
                            ...prev,
                            paidOn: 'Please select the Paid on date.',
                          }));
                        }
                      }}
                      aria-invalid={Boolean(fieldErrors.paidOn)}
                      className={`${inputBaseClass(Boolean(paidOn), Boolean(fieldErrors.paidOn))} font-medium`}
                    />
                    {fieldErrors.paidOn && (
                      <p className="text-[12px] font-medium text-rose-600">{fieldErrors.paidOn}</p>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* SECTION 4: DETAILS */}
            <section
              ref={(el) => {
                sectionRefs.current.details = el;
              }}
              className="space-y-4 pt-6 border-t border-[#E5ECF6] scroll-mt-4"
            >
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#1D4ED8]" />
                <h4 className="text-[12px] font-bold text-[#0A1F5C] uppercase tracking-wider">
                  4. Details
                </h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {status === 'Paid' && (
                  <div className="space-y-1.5 sm:col-span-2">
                    <label
                      htmlFor="payment-method"
                      className="block text-[12px] font-semibold text-[#0A1F5C]"
                    >
                      Payment method
                    </label>
                    <select
                      id="payment-method"
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className={`${inputBaseClass(Boolean(paymentMethod))} font-medium ${
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
                )}

                <div className="space-y-1.5">
                  <label
                    htmlFor="payment-reference-no"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Reference or transaction number
                  </label>
                  <input
                    id="payment-reference-no"
                    type="text"
                    value={referenceNo}
                    onChange={(e) => setReferenceNo(e.target.value)}
                    placeholder="UTR / UPI Ref #432198..."
                    className={inputBaseClass(Boolean(referenceNo.trim()))}
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="payment-invoice-number"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Invoice number
                  </label>
                  <input
                    id="payment-invoice-number"
                    type="text"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="INV-2026-042"
                    className={inputBaseClass(Boolean(invoiceNumber.trim()))}
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <label
                    htmlFor="payment-note"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Note
                  </label>
                  <textarea
                    id="payment-note"
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Billing instructions, split payment context, or internal remarks..."
                    className={`w-full min-h-[76px] p-3.5 rounded-xl border border-[#DCEBFF] text-[16px] sm:text-[14px] text-[#0A1F5C] placeholder:text-[#94A3B8] placeholder:text-[16px] sm:placeholder:text-[14px] transition-all focus:outline-none focus:bg-white focus:border-[#1D4ED8] focus:ring-3 focus:ring-[#1D4ED8]/15 ${
                      note.trim() ? 'bg-white shadow-2xs' : 'bg-[#F8FAFF]'
                    }`}
                  />
                </div>
              </div>
            </section>
          </form>
        </div>

        {/* Sticky Footer */}
        <div className="px-5 sm:px-6 py-4 border-t border-[#E5ECF6] bg-white flex flex-wrap items-center justify-between gap-3 shrink-0">
          <span className="hidden sm:inline text-[12px] text-slate-500">
            Tip: Press{' '}
            <kbd className="px-1.5 py-0.5 bg-[#F8FAFF] border border-[#DCEBFF] rounded text-[11px] font-semibold text-[#0A1F5C]">
              Ctrl
            </kbd>{' '}
            +{' '}
            <kbd className="px-1.5 py-0.5 bg-[#F8FAFF] border border-[#DCEBFF] rounded text-[11px] font-semibold text-[#0A1F5C]">
              Enter
            </kbd>{' '}
            to save
          </span>
          <div className="flex items-center justify-end gap-2.5 ml-auto w-full sm:w-auto">
            <button
              type="button"
              onClick={attemptClose}
              disabled={Boolean(submittingMode)}
              className="tactile-btn-secondary px-4 py-2.5 text-[13px] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => savePayment('another')}
              disabled={Boolean(submittingMode)}
              className="px-4 py-2.5 rounded-xl bg-white border border-[#1D4ED8] text-[#1D4ED8] hover:bg-[#F2F7FF] text-[13px] font-semibold transition-all flex items-center gap-1.5 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/40"
            >
              {submittingMode === 'another' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{submittingMode === 'another' ? 'Saving...' : 'Save and add another'}</span>
            </button>
            <button
              type="submit"
              form="add-payment-form"
              disabled={Boolean(submittingMode)}
              className="tactile-btn-primary px-5 py-2.5 text-[13px] flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/50"
            >
              {submittingMode === 'close' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{submittingMode === 'close' ? 'Saving...' : 'Save Payment'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
