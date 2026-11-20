import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Building2,
  User,
  CreditCard,
  Layers,
  FileText,
  Check,
  Loader2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';
import {
  extractIndianPhoneDigits,
  formatPhoneInputDisplay,
  formatIndianCurrencyInput,
} from '../lib/leadOptions';
import {
  CLIENT_BUSINESS_TYPES,
  CLIENT_PACKAGE_OPTIONS,
  BILLING_CYCLE_OPTIONS,
  PAYMENT_STATUS_OPTIONS,
  PLATFORM_OPTIONS,
  CLIENT_STATUS_OPTIONS,
  getPackageDefaultFee,
  getTodayInputDate,
  addOneMonthDate,
} from '../lib/clientOptions';

interface AddClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onClientCreated?: (client: any) => void;
  onViewClient?: (clientId: string) => void;
}

type SectionKey = 'business' | 'contact' | 'billing' | 'scope' | 'other';

const STEPS: { key: SectionKey; label: string }[] = [
  { key: 'business', label: 'Business' },
  { key: 'contact', label: 'Contact' },
  { key: 'billing', label: 'Billing' },
  { key: 'scope', label: 'Scope' },
  { key: 'other', label: 'Other' },
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AddClientModal({
  isOpen,
  onClose,
  onClientCreated,
  onViewClient,
}: AddClientModalProps) {
  const { showToast } = useToast();

  // Refs for accessibility, focus restoration, and step scrolling
  const openerRef = useRef<HTMLElement | null>(null);
  const skipRestoreFocusRef = useRef(false);
  const businessNameRef = useRef<HTMLInputElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Record<SectionKey, HTMLElement | null>>({
    business: null,
    contact: null,
    billing: null,
    scope: null,
    other: null,
  });

  // 1. BUSINESS DETAILS
  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');

  // 2. CONTACT
  const [contactPerson, setContactPerson] = useState('');
  const [designation, setDesignation] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [whatsappDigits, setWhatsappDigits] = useState('');
  const [whatsappSameAsPhone, setWhatsappSameAsPhone] = useState(false);
  const [email, setEmail] = useState('');

  // 3. PACKAGE AND BILLING
  const [packageTier, setPackageTier] = useState('Growth');
  const [monthlyFeeDisplay, setMonthlyFeeDisplay] = useState('45,000');
  const [startDate, setStartDate] = useState(() => getTodayInputDate());
  const [renewalDate, setRenewalDate] = useState(() => addOneMonthDate(getTodayInputDate()));
  const [isRenewalManuallyEdited, setIsRenewalManuallyEdited] = useState(false);
  const [billingCycle, setBillingCycle] = useState('');
  const [paymentDueDay, setPaymentDueDay] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [gstNumber, setGstNumber] = useState('');

  // 4. SERVICE SCOPE
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [deliverables, setDeliverables] = useState('');
  const [assignedTo, setAssignedTo] = useState('');

  // 5. OTHER
  const [status, setStatus] = useState('Active');
  const [notes, setNotes] = useState('');

  // Validation & UI state
  const [activeStep, setActiveStep] = useState<SectionKey>('business');
  const [fieldErrors, setFieldErrors] = useState<{
    businessName?: string;
    phone?: string;
    whatsapp?: string;
    email?: string;
    packageTier?: string;
    monthlyFee?: string;
    startDate?: string;
    renewalDate?: string;
    paymentDueDay?: string;
  }>({});
  const [submittingMode, setSubmittingMode] = useState<'close' | 'another' | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [sessionBaseline, setSessionBaseline] = useState(() => {
    const today = getTodayInputDate();
    return {
      packageTier: 'Growth',
      monthlyFeeDisplay: getPackageDefaultFee('Growth'),
      startDate: today,
      renewalDate: addOneMonthDate(today),
      billingCycle: '',
    };
  });

  const resetFormFields = (keepPackageAndCycle = false) => {
    const today = getTodayInputDate();
    const nextRenewal = addOneMonthDate(today);
    const nextPkg = keepPackageAndCycle ? packageTier : 'Growth';
    const nextFee = keepPackageAndCycle ? '' : getPackageDefaultFee('Growth');
    const nextCycle = keepPackageAndCycle ? billingCycle : '';

    setBusinessName('');
    setBusinessType('');
    setCity('');
    setAddress('');
    setContactPerson('');
    setDesignation('');
    setPhoneDigits('');
    setWhatsappDigits('');
    setWhatsappSameAsPhone(false);
    setEmail('');

    setPackageTier(nextPkg);
    setMonthlyFeeDisplay(nextFee);
    setBillingCycle(nextCycle);

    setStartDate(today);
    setRenewalDate(nextRenewal);
    setIsRenewalManuallyEdited(false);
    setPaymentDueDay('');
    setPaymentStatus('');
    setGstNumber('');
    setPlatforms([]);
    setDeliverables('');
    setAssignedTo('');
    setStatus('Active');
    setNotes('');
    setFieldErrors({});
    setShowDiscardConfirm(false);
    setActiveStep('business');
    setSessionBaseline({
      packageTier: nextPkg,
      monthlyFeeDisplay: nextFee,
      startDate: today,
      renewalDate: nextRenewal,
      billingCycle: nextCycle,
    });
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  };

  useEffect(() => {
    if (isOpen) {
      openerRef.current = document.activeElement as HTMLElement | null;
      skipRestoreFocusRef.current = false;
      resetFormFields(false);
      setSubmittingMode(null);

      const timer = setTimeout(() => {
        businessNameRef.current?.focus();
      }, 20);
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
  }, [isOpen]);

  const effectiveWhatsappDigits = whatsappSameAsPhone ? phoneDigits : whatsappDigits;

  const isDirty = useMemo(() => {
    return Boolean(
      businessName.trim() ||
        businessType ||
        city.trim() ||
        address.trim() ||
        contactPerson.trim() ||
        designation.trim() ||
        phoneDigits ||
        whatsappDigits ||
        whatsappSameAsPhone ||
        email.trim() ||
        packageTier !== sessionBaseline.packageTier ||
        monthlyFeeDisplay !== sessionBaseline.monthlyFeeDisplay ||
        startDate !== sessionBaseline.startDate ||
        renewalDate !== sessionBaseline.renewalDate ||
        billingCycle !== sessionBaseline.billingCycle ||
        paymentDueDay.trim() ||
        paymentStatus ||
        gstNumber.trim() ||
        platforms.length > 0 ||
        deliverables.trim() ||
        assignedTo.trim() ||
        status !== 'Active' ||
        notes.trim()
    );
  }, [
    businessName,
    businessType,
    city,
    address,
    contactPerson,
    designation,
    phoneDigits,
    whatsappDigits,
    whatsappSameAsPhone,
    email,
    packageTier,
    monthlyFeeDisplay,
    startDate,
    renewalDate,
    billingCycle,
    paymentDueDay,
    paymentStatus,
    gstNumber,
    platforms,
    deliverables,
    assignedTo,
    status,
    notes,
    sessionBaseline,
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
        if (showDiscardConfirm) {
          setShowDiscardConfirm(false);
        } else {
          attemptClose();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!submittingMode) {
          saveClient('close');
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
      setActiveStep('other');
      return;
    }

    let current: SectionKey = 'business';
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

  const togglePlatform = (chip: string) => {
    setPlatforms((prev) =>
      prev.includes(chip) ? prev.filter((item) => item !== chip) : [...prev, chip]
    );
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = extractIndianPhoneDigits(e.target.value);
    setPhoneDigits(digits);
    if (whatsappSameAsPhone) {
      setWhatsappDigits(digits);
    }
    if (fieldErrors.phone || (whatsappSameAsPhone && fieldErrors.whatsapp)) {
      setFieldErrors((prev) => ({
        ...prev,
        phone: undefined,
        whatsapp: whatsappSameAsPhone ? undefined : prev.whatsapp,
      }));
    }
  };

  const handlePhoneBlur = () => {
    if (phoneDigits.length > 0 && phoneDigits.length !== 10) {
      setFieldErrors((prev) => ({
        ...prev,
        phone: 'Please enter a valid 10-digit Indian phone number.',
      }));
    } else {
      setFieldErrors((prev) => ({ ...prev, phone: undefined }));
    }
  };

  const handleWhatsappChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = extractIndianPhoneDigits(e.target.value);
    setWhatsappDigits(digits);
    if (fieldErrors.whatsapp) {
      setFieldErrors((prev) => ({ ...prev, whatsapp: undefined }));
    }
  };

  const handleWhatsappBlur = () => {
    if (!whatsappSameAsPhone && whatsappDigits.length > 0 && whatsappDigits.length !== 10) {
      setFieldErrors((prev) => ({
        ...prev,
        whatsapp: 'Please enter a valid 10-digit Indian WhatsApp number.',
      }));
    } else {
      setFieldErrors((prev) => ({ ...prev, whatsapp: undefined }));
    }
  };

  const handleEmailBlur = () => {
    const trimmed = email.trim();
    if (trimmed && !EMAIL_REGEX.test(trimmed)) {
      setFieldErrors((prev) => ({
        ...prev,
        email: 'Please enter a valid email address.',
      }));
    } else {
      setFieldErrors((prev) => ({ ...prev, email: undefined }));
    }
  };

  const handleFeeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMonthlyFeeDisplay(formatIndianCurrencyInput(e.target.value));
    if (fieldErrors.monthlyFee) {
      setFieldErrors((prev) => ({ ...prev, monthlyFee: undefined }));
    }
  };

  const handleFeeBlur = () => {
    const digits = monthlyFeeDisplay.replace(/\D/g, '');
    const numeric = digits ? Number(digits) : 0;
    if (!digits || numeric <= 0) {
      setFieldErrors((prev) => ({
        ...prev,
        monthlyFee: 'Monthly Fee must be a positive amount.',
      }));
    } else {
      setFieldErrors((prev) => ({ ...prev, monthlyFee: undefined }));
    }
  };

  const handleStartDateChange = (val: string) => {
    setStartDate(val);
    let nextRenewal = renewalDate;
    if (!isRenewalManuallyEdited && val) {
      nextRenewal = addOneMonthDate(val);
      setRenewalDate(nextRenewal);
    }
    setFieldErrors((prev) => ({
      ...prev,
      startDate: val ? undefined : prev.startDate,
      renewalDate:
        val && nextRenewal && nextRenewal < val
          ? 'Renewal Date cannot be before Start Date.'
          : undefined,
    }));
  };

  const handleRenewalDateChange = (val: string) => {
    setRenewalDate(val);
    setIsRenewalManuallyEdited(Boolean(val));
    if (val && startDate && val < startDate) {
      setFieldErrors((prev) => ({
        ...prev,
        renewalDate: 'Renewal Date cannot be before Start Date.',
      }));
    } else if (val) {
      setFieldErrors((prev) => ({ ...prev, renewalDate: undefined }));
    }
  };

  const handleDueDayBlur = () => {
    const trimmed = paymentDueDay.trim();
    if (!trimmed) {
      setFieldErrors((prev) => ({ ...prev, paymentDueDay: undefined }));
      return;
    }
    const num = Number(trimmed);
    if (!/^\d+$/.test(trimmed) || num < 1 || num > 31) {
      setFieldErrors((prev) => ({
        ...prev,
        paymentDueDay: 'Payment due day must be between 1 and 31.',
      }));
    } else {
      setFieldErrors((prev) => ({ ...prev, paymentDueDay: undefined }));
    }
  };

  const validateAll = (): boolean => {
    const errors: typeof fieldErrors = {};

    if (!businessName.trim()) {
      errors.businessName = 'Please enter a Business Name.';
    }

    if (phoneDigits.length > 0 && phoneDigits.length !== 10) {
      errors.phone = 'Please enter a valid 10-digit Indian phone number.';
    }

    if (!whatsappSameAsPhone && whatsappDigits.length > 0 && whatsappDigits.length !== 10) {
      errors.whatsapp = 'Please enter a valid 10-digit Indian WhatsApp number.';
    }

    const trimmedEmail = email.trim();
    if (trimmedEmail && !EMAIL_REGEX.test(trimmedEmail)) {
      errors.email = 'Please enter a valid email address.';
    }

    if (!packageTier) {
      errors.packageTier = 'Please select a Package Tier.';
    }

    const feeDigits = monthlyFeeDisplay.replace(/\D/g, '');
    const feeNum = feeDigits ? Number(feeDigits) : 0;
    if (!feeDigits || feeNum <= 0) {
      errors.monthlyFee = 'Monthly Fee must be a positive amount.';
    }

    if (!startDate) {
      errors.startDate = 'Please select a Start Date.';
    }

    if (!renewalDate) {
      errors.renewalDate = 'Please select a Renewal Date.';
    } else if (startDate && renewalDate < startDate) {
      errors.renewalDate = 'Renewal Date cannot be before Start Date.';
    }

    const trimmedDueDay = paymentDueDay.trim();
    if (trimmedDueDay) {
      const num = Number(trimmedDueDay);
      if (!/^\d+$/.test(trimmedDueDay) || num < 1 || num > 31) {
        errors.paymentDueDay = 'Payment due day must be between 1 and 31.';
      }
    }

    setFieldErrors(errors);

    if (errors.businessName) {
      jumpToSection('business');
      businessNameRef.current?.focus();
      return false;
    }
    if (errors.phone || errors.whatsapp || errors.email) {
      jumpToSection('contact');
      return false;
    }
    if (
      errors.packageTier ||
      errors.monthlyFee ||
      errors.startDate ||
      errors.renewalDate ||
      errors.paymentDueDay
    ) {
      jumpToSection('billing');
      return false;
    }

    return true;
  };

  const saveClient = async (mode: 'close' | 'another') => {
    if (submittingMode) return;
    if (!validateAll()) return;

    setSubmittingMode(mode);
    try {
      const feeDigits = monthlyFeeDisplay.replace(/\D/g, '');
      const formattedPhone =
        phoneDigits.length === 10 ? `+91 ${formatPhoneInputDisplay(phoneDigits)}` : null;
      const formattedWhatsapp =
        effectiveWhatsappDigits.length === 10
          ? `+91 ${formatPhoneInputDisplay(effectiveWhatsappDigits)}`
          : null;
      const trimmedContact = contactPerson.trim() || null;
      const trimmedDueDay = paymentDueDay.trim();

      const payload = {
        business_name: businessName.trim(),
        business_type: businessType || null,
        city: city.trim() || null,
        address: address.trim() || null,
        contact_person: trimmedContact,
        contact_name: trimmedContact,
        designation: designation.trim() || null,
        phone: formattedPhone,
        whatsapp: formattedWhatsapp,
        email: email.trim() || null,
        package: packageTier,
        monthly_fee: Number(feeDigits),
        start_date: startDate,
        contract_start: startDate,
        renewal_date: renewalDate,
        billing_cycle: billingCycle || null,
        payment_due_day: trimmedDueDay ? Number(trimmedDueDay) : null,
        payment_status: paymentStatus || null,
        gst_number: gstNumber.trim().toUpperCase() || null,
        platforms: platforms.length > 0 ? platforms : null,
        deliverables: deliverables.trim() || null,
        assigned_to: assignedTo.trim() || null,
        status: status || 'Active',
        notes: notes.trim() || null,
      };

      const { data, error } = await supabase.from('clients').insert(payload).select().single();

      if (error || !data) {
        showToast('Could not add client: ' + (error?.message || 'Unknown error'), 'error');
        setSubmittingMode(null);
        return;
      }

      const { error: activityError } = await supabase.from('client_activities').insert({
        client_id: data.id,
        type: 'Client Created',
        note: 'Client added in CRM',
      });

      if (activityError) {
        console.error('Could not insert client_activities row:', activityError);
      }

      showToast('Client added', 'success', {
        label: 'View client',
        onClick: () => {
          skipRestoreFocusRef.current = true;
          onClose();
          onViewClient?.(data.id);
        },
      });

      onClientCreated?.(data);

      if (mode === 'another') {
        resetFormFields(true);
        setSubmittingMode(null);
        setTimeout(() => {
          businessNameRef.current?.focus();
        }, 20);
      } else {
        setSubmittingMode(null);
        onClose();
      }
    } catch (err: any) {
      showToast('Could not add client: ' + (err?.message || 'Unexpected error'), 'error');
      setSubmittingMode(null);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveClient('close');
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

  const prefixedWrapperClass = (filled: boolean, hasError?: boolean, disabled?: boolean) =>
    `flex items-center w-full h-[44px] rounded-xl border overflow-hidden transition-all ${
      disabled ? 'bg-[#EEF2F8]/70 opacity-80' : filled ? 'bg-white shadow-2xs' : 'bg-[#F8FAFF]'
    } ${
      hasError
        ? 'border-rose-500 focus-within:border-rose-500 focus-within:ring-3 focus-within:ring-rose-500/20'
        : 'border-[#DCEBFF] focus-within:bg-white focus-within:border-[#1D4ED8] focus-within:ring-3 focus-within:ring-[#1D4ED8]/15'
    }`;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-end sm:items-center justify-center sm:p-4"
      onClick={attemptClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-client-modal-title"
        className="bg-white w-full sm:max-w-[720px] h-[100dvh] sm:h-auto sm:max-h-[90vh] rounded-none sm:rounded-2xl shadow-2xl border border-[#DCEBFF] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-[#E5ECF6] flex items-center justify-between shrink-0 bg-white">
          <div>
            <h3
              id="add-client-modal-title"
              className="font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans'] text-lg"
            >
              Add New Client
            </h3>
            <p className="text-[12px] text-slate-600">
              Capture client account details, billing schedule, and service scope.
            </p>
          </div>
          <button
            type="button"
            onClick={attemptClose}
            disabled={Boolean(submittingMode)}
            className="p-2 text-slate-500 hover:text-[#0A1F5C] hover:bg-[#F8FAFF] rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] disabled:opacity-50"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Slim Step Indicator */}
        <nav
          aria-label="Client form sections"
          className="px-5 sm:px-6 py-2.5 bg-[#F8FAFF] border-b border-[#E5ECF6] shrink-0"
        >
          <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
            {STEPS.map((step, index) => {
              const isActive = activeStep === step.key;
              return (
                <button
                  key={step.key}
                  type="button"
                  onClick={() => jumpToSection(step.key)}
                  className={`flex items-center justify-center gap-1 sm:gap-1.5 py-1.5 px-1.5 sm:px-2 rounded-lg text-[11px] sm:text-[12px] font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] ${
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
              Discard this client? Unsaved details will be lost.
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
            id="add-client-form"
            onSubmit={handleFormSubmit}
            onKeyDown={handleFormKeyDown}
            noValidate
            className="space-y-6"
          >
            {/* SECTION 1: BUSINESS DETAILS */}
            <section
              ref={(el) => {
                sectionRefs.current.business = el;
              }}
              className="space-y-4 scroll-mt-4"
            >
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#1D4ED8]" />
                <h4 className="text-[12px] font-bold text-[#0A1F5C] uppercase tracking-wider">
                  1. Business Details
                </h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="client-business-name"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Business Name <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id="client-business-name"
                    ref={businessNameRef}
                    type="text"
                    value={businessName}
                    onChange={(e) => {
                      setBusinessName(e.target.value);
                      if (fieldErrors.businessName && e.target.value.trim()) {
                        setFieldErrors((prev) => ({ ...prev, businessName: undefined }));
                      }
                    }}
                    onBlur={() => {
                      if (!businessName.trim()) {
                        setFieldErrors((prev) => ({
                          ...prev,
                          businessName: 'Please enter a Business Name.',
                        }));
                      }
                    }}
                    aria-invalid={Boolean(fieldErrors.businessName)}
                    placeholder="The Oberoi Udaivilas"
                    className={inputBaseClass(
                      Boolean(businessName.trim()),
                      Boolean(fieldErrors.businessName)
                    )}
                  />
                  {fieldErrors.businessName && (
                    <p className="text-[12px] font-medium text-rose-600">
                      {fieldErrors.businessName}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="client-business-type"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Business Type
                  </label>
                  <select
                    id="client-business-type"
                    value={businessType}
                    onChange={(e) => setBusinessType(e.target.value)}
                    className={`${inputBaseClass(Boolean(businessType))} font-medium ${
                      businessType ? 'text-[#0A1F5C]' : 'text-[#94A3B8]'
                    }`}
                  >
                    <option value="">Select business type</option>
                    {CLIENT_BUSINESS_TYPES.map((type) => (
                      <option key={type} value={type} className="text-[#0A1F5C]">
                        {type}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="client-city"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    City
                  </label>
                  <input
                    id="client-city"
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Udaipur"
                    className={inputBaseClass(Boolean(city.trim()))}
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="client-address"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Address
                  </label>
                  <input
                    id="client-address"
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Haridasji Ki Magri, Pichola"
                    className={inputBaseClass(Boolean(address.trim()))}
                  />
                </div>
              </div>
            </section>

            {/* SECTION 2: CONTACT */}
            <section
              ref={(el) => {
                sectionRefs.current.contact = el;
              }}
              className="space-y-4 pt-6 border-t border-[#E5ECF6] scroll-mt-4"
            >
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-[#1D4ED8]" />
                <h4 className="text-[12px] font-bold text-[#0A1F5C] uppercase tracking-wider">
                  2. Contact
                </h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="client-contact-person"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Contact Person
                  </label>
                  <input
                    id="client-contact-person"
                    type="text"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    placeholder="Vikramaditya Singh"
                    className={inputBaseClass(Boolean(contactPerson.trim()))}
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="client-designation"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Designation
                  </label>
                  <input
                    id="client-designation"
                    type="text"
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    placeholder="General Manager"
                    className={inputBaseClass(Boolean(designation.trim()))}
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="client-phone"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Phone
                  </label>
                  <div className={prefixedWrapperClass(Boolean(phoneDigits), Boolean(fieldErrors.phone))}>
                    <span className="h-full px-3 flex items-center bg-[#EEF2F8] border-r border-[#DCEBFF] text-[#0A1F5C] font-semibold text-[14px] tabular-nums select-none">
                      +91
                    </span>
                    <input
                      id="client-phone"
                      type="tel"
                      inputMode="numeric"
                      value={formatPhoneInputDisplay(phoneDigits)}
                      onChange={handlePhoneChange}
                      onBlur={handlePhoneBlur}
                      aria-invalid={Boolean(fieldErrors.phone)}
                      placeholder="98765 43210"
                      className="w-full h-full px-3 bg-transparent text-[16px] sm:text-[14px] text-[#0A1F5C] tabular-nums placeholder:text-[#94A3B8] placeholder:text-[16px] sm:placeholder:text-[14px] focus:outline-none"
                    />
                  </div>
                  {fieldErrors.phone && (
                    <p className="text-[12px] font-medium text-rose-600">{fieldErrors.phone}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor="client-whatsapp"
                      className="block text-[12px] font-semibold text-[#0A1F5C]"
                    >
                      WhatsApp
                    </label>
                    <label
                      htmlFor="client-whatsapp-same"
                      className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-600 cursor-pointer select-none"
                    >
                      <input
                        id="client-whatsapp-same"
                        type="checkbox"
                        checked={whatsappSameAsPhone}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setWhatsappSameAsPhone(checked);
                          if (checked) {
                            setWhatsappDigits(phoneDigits);
                            setFieldErrors((prev) => ({ ...prev, whatsapp: undefined }));
                          }
                        }}
                        className="w-3.5 h-3.5 rounded border-[#DCEBFF] text-[#1D4ED8] focus:ring-[#1D4ED8]"
                      />
                      <span>Same as phone</span>
                    </label>
                  </div>
                  <div
                    className={prefixedWrapperClass(
                      Boolean(effectiveWhatsappDigits),
                      Boolean(fieldErrors.whatsapp),
                      whatsappSameAsPhone
                    )}
                  >
                    <span className="h-full px-3 flex items-center bg-[#EEF2F8] border-r border-[#DCEBFF] text-[#0A1F5C] font-semibold text-[14px] tabular-nums select-none">
                      +91
                    </span>
                    <input
                      id="client-whatsapp"
                      type="tel"
                      inputMode="numeric"
                      disabled={whatsappSameAsPhone}
                      value={formatPhoneInputDisplay(effectiveWhatsappDigits)}
                      onChange={handleWhatsappChange}
                      onBlur={handleWhatsappBlur}
                      aria-invalid={Boolean(fieldErrors.whatsapp)}
                      placeholder="98765 43210"
                      className="w-full h-full px-3 bg-transparent text-[16px] sm:text-[14px] text-[#0A1F5C] tabular-nums placeholder:text-[#94A3B8] placeholder:text-[16px] sm:placeholder:text-[14px] focus:outline-none disabled:cursor-not-allowed"
                    />
                  </div>
                  {fieldErrors.whatsapp && (
                    <p className="text-[12px] font-medium text-rose-600">{fieldErrors.whatsapp}</p>
                  )}
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <label
                    htmlFor="client-email"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Email
                  </label>
                  <input
                    id="client-email"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (fieldErrors.email) {
                        setFieldErrors((prev) => ({ ...prev, email: undefined }));
                      }
                    }}
                    onBlur={handleEmailBlur}
                    aria-invalid={Boolean(fieldErrors.email)}
                    placeholder="gm@oberoiudaivilas.com"
                    className={inputBaseClass(Boolean(email.trim()), Boolean(fieldErrors.email))}
                  />
                  {fieldErrors.email && (
                    <p className="text-[12px] font-medium text-rose-600">{fieldErrors.email}</p>
                  )}
                </div>
              </div>
            </section>

            {/* SECTION 3: PACKAGE AND BILLING */}
            <section
              ref={(el) => {
                sectionRefs.current.billing = el;
              }}
              className="space-y-4 pt-6 border-t border-[#E5ECF6] scroll-mt-4"
            >
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-[#1D4ED8]" />
                <h4 className="text-[12px] font-bold text-[#0A1F5C] uppercase tracking-wider">
                  3. Package and Billing
                </h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="client-package-tier"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Package Tier <span className="text-rose-600">*</span>
                  </label>
                  <select
                    id="client-package-tier"
                    value={packageTier}
                    onChange={(e) => {
                      const nextPkg = e.target.value;
                      setPackageTier(nextPkg);
                      setMonthlyFeeDisplay(getPackageDefaultFee(nextPkg));
                      setFieldErrors((prev) => ({
                        ...prev,
                        packageTier: undefined,
                        monthlyFee: undefined,
                      }));
                    }}
                    aria-invalid={Boolean(fieldErrors.packageTier)}
                    className={`${inputBaseClass(Boolean(packageTier), Boolean(fieldErrors.packageTier))} font-medium`}
                  >
                    {CLIENT_PACKAGE_OPTIONS.map((pkg) => (
                      <option key={pkg.value} value={pkg.value}>
                        {pkg.label}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.packageTier && (
                    <p className="text-[12px] font-medium text-rose-600">
                      {fieldErrors.packageTier}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="client-monthly-fee"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Monthly Fee <span className="text-rose-600">*</span>
                  </label>
                  <div
                    className={prefixedWrapperClass(
                      Boolean(monthlyFeeDisplay.trim()),
                      Boolean(fieldErrors.monthlyFee)
                    )}
                  >
                    <span className="h-full px-3.5 flex items-center bg-[#EEF2F8] border-r border-[#DCEBFF] text-[#0A1F5C] font-semibold text-[14px] select-none">
                      ₹
                    </span>
                    <input
                      id="client-monthly-fee"
                      type="text"
                      inputMode="numeric"
                      value={monthlyFeeDisplay}
                      onChange={handleFeeChange}
                      onBlur={handleFeeBlur}
                      aria-invalid={Boolean(fieldErrors.monthlyFee)}
                      placeholder="45,000"
                      className="w-full h-full px-3 bg-transparent text-[16px] sm:text-[14px] text-[#0A1F5C] font-semibold tabular-nums placeholder:text-[#94A3B8] placeholder:font-normal placeholder:text-[16px] sm:placeholder:text-[14px] focus:outline-none"
                    />
                  </div>
                  {fieldErrors.monthlyFee && (
                    <p className="text-[12px] font-medium text-rose-600">
                      {fieldErrors.monthlyFee}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="client-start-date"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Start Date <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id="client-start-date"
                    type="date"
                    value={startDate}
                    onChange={(e) => handleStartDateChange(e.target.value)}
                    onBlur={() => {
                      if (!startDate) {
                        setFieldErrors((prev) => ({
                          ...prev,
                          startDate: 'Please select a Start Date.',
                        }));
                      }
                    }}
                    aria-invalid={Boolean(fieldErrors.startDate)}
                    className={`${inputBaseClass(Boolean(startDate), Boolean(fieldErrors.startDate))} font-medium ${
                      startDate ? 'text-[#0A1F5C]' : 'text-[#94A3B8]'
                    }`}
                  />
                  {fieldErrors.startDate && (
                    <p className="text-[12px] font-medium text-rose-600">
                      {fieldErrors.startDate}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="client-renewal-date"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Renewal Date <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id="client-renewal-date"
                    type="date"
                    value={renewalDate}
                    min={startDate || undefined}
                    onChange={(e) => handleRenewalDateChange(e.target.value)}
                    onBlur={() => {
                      if (!renewalDate) {
                        setFieldErrors((prev) => ({
                          ...prev,
                          renewalDate: 'Please select a Renewal Date.',
                        }));
                      } else if (startDate && renewalDate < startDate) {
                        setFieldErrors((prev) => ({
                          ...prev,
                          renewalDate: 'Renewal Date cannot be before Start Date.',
                        }));
                      }
                    }}
                    aria-invalid={Boolean(fieldErrors.renewalDate)}
                    className={`${inputBaseClass(Boolean(renewalDate), Boolean(fieldErrors.renewalDate))} font-medium ${
                      renewalDate ? 'text-[#0A1F5C]' : 'text-[#94A3B8]'
                    }`}
                  />
                  {fieldErrors.renewalDate && (
                    <p className="text-[12px] font-medium text-rose-600">
                      {fieldErrors.renewalDate}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="client-billing-cycle"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Billing Cycle
                  </label>
                  <select
                    id="client-billing-cycle"
                    value={billingCycle}
                    onChange={(e) => setBillingCycle(e.target.value)}
                    className={`${inputBaseClass(Boolean(billingCycle))} font-medium ${
                      billingCycle ? 'text-[#0A1F5C]' : 'text-[#94A3B8]'
                    }`}
                  >
                    <option value="">Select billing cycle</option>
                    {BILLING_CYCLE_OPTIONS.map((cycle) => (
                      <option key={cycle} value={cycle} className="text-[#0A1F5C]">
                        {cycle}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="client-payment-due-day"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Payment Due Day (1–31)
                  </label>
                  <input
                    id="client-payment-due-day"
                    type="number"
                    min={1}
                    max={31}
                    inputMode="numeric"
                    value={paymentDueDay}
                    onChange={(e) => {
                      setPaymentDueDay(e.target.value);
                      if (fieldErrors.paymentDueDay) {
                        setFieldErrors((prev) => ({ ...prev, paymentDueDay: undefined }));
                      }
                    }}
                    onBlur={handleDueDayBlur}
                    aria-invalid={Boolean(fieldErrors.paymentDueDay)}
                    placeholder="5"
                    className={inputBaseClass(
                      Boolean(paymentDueDay.trim()),
                      Boolean(fieldErrors.paymentDueDay)
                    )}
                  />
                  {fieldErrors.paymentDueDay && (
                    <p className="text-[12px] font-medium text-rose-600">
                      {fieldErrors.paymentDueDay}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="client-payment-status"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Payment Status
                  </label>
                  <select
                    id="client-payment-status"
                    value={paymentStatus}
                    onChange={(e) => setPaymentStatus(e.target.value)}
                    className={`${inputBaseClass(Boolean(paymentStatus))} font-medium ${
                      paymentStatus ? 'text-[#0A1F5C]' : 'text-[#94A3B8]'
                    }`}
                  >
                    <option value="">Select payment status</option>
                    {PAYMENT_STATUS_OPTIONS.map((ps) => (
                      <option key={ps} value={ps} className="text-[#0A1F5C]">
                        {ps}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="client-gst-number"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    GST Number
                  </label>
                  <input
                    id="client-gst-number"
                    type="text"
                    value={gstNumber}
                    onChange={(e) => setGstNumber(e.target.value.toUpperCase())}
                    placeholder="27AABCU9603R1ZM"
                    className={`${inputBaseClass(Boolean(gstNumber.trim()))} uppercase`}
                  />
                </div>
              </div>
            </section>

            {/* SECTION 4: SERVICE SCOPE */}
            <section
              ref={(el) => {
                sectionRefs.current.scope = el;
              }}
              className="space-y-4 pt-6 border-t border-[#E5ECF6] scroll-mt-4"
            >
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#1D4ED8]" />
                <h4 className="text-[12px] font-bold text-[#0A1F5C] uppercase tracking-wider">
                  4. Service Scope
                </h4>
              </div>

              <div className="space-y-2">
                <span className="block text-[12px] font-semibold text-[#0A1F5C]">
                  Platforms Managed
                </span>
                <div className="flex flex-wrap gap-2">
                  {PLATFORM_OPTIONS.map((chip) => {
                    const selected = platforms.includes(chip);
                    return (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => togglePlatform(chip)}
                        aria-pressed={selected}
                        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-medium border transition-all focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/40 ${
                          selected
                            ? 'bg-[#1D4ED8] border-[#1D4ED8] text-white shadow-xs'
                            : 'bg-white border-[#1D4ED8] text-[#1D4ED8] hover:bg-[#F2F7FF]'
                        }`}
                      >
                        {selected && <Check className="w-3.5 h-3.5 shrink-0" />}
                        <span>{chip}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="client-deliverables"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Deliverables per month
                  </label>
                  <input
                    id="client-deliverables"
                    type="text"
                    value={deliverables}
                    onChange={(e) => setDeliverables(e.target.value)}
                    placeholder="12 posts, 4 reels"
                    className={inputBaseClass(Boolean(deliverables.trim()))}
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="client-assigned-to"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Assigned To
                  </label>
                  <input
                    id="client-assigned-to"
                    type="text"
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                    placeholder="Account Manager name"
                    className={inputBaseClass(Boolean(assignedTo.trim()))}
                  />
                </div>
              </div>
            </section>

            {/* SECTION 5: OTHER */}
            <section
              ref={(el) => {
                sectionRefs.current.other = el;
              }}
              className="space-y-4 pt-6 border-t border-[#E5ECF6] scroll-mt-4"
            >
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#1D4ED8]" />
                <h4 className="text-[12px] font-bold text-[#0A1F5C] uppercase tracking-wider">
                  5. Other
                </h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="client-status"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Status
                  </label>
                  <select
                    id="client-status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className={`${inputBaseClass(Boolean(status))} font-medium`}
                  >
                    {CLIENT_STATUS_OPTIONS.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="client-notes"
                  className="block text-[12px] font-semibold text-[#0A1F5C]"
                >
                  Notes
                </label>
                <textarea
                  id="client-notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Onboarding goals, brand tone, special instructions..."
                  className={`w-full min-h-[88px] p-3.5 rounded-xl border border-[#DCEBFF] text-[16px] sm:text-[14px] text-[#0A1F5C] placeholder:text-[#94A3B8] placeholder:text-[16px] sm:placeholder:text-[14px] transition-all focus:outline-none focus:bg-white focus:border-[#1D4ED8] focus:ring-3 focus:ring-[#1D4ED8]/15 ${
                    notes.trim() ? 'bg-white shadow-2xs' : 'bg-[#F8FAFF]'
                  }`}
                />
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
              onClick={() => saveClient('another')}
              disabled={Boolean(submittingMode)}
              className="px-4 py-2.5 rounded-xl bg-white border border-[#1D4ED8] text-[#1D4ED8] hover:bg-[#F2F7FF] text-[13px] font-semibold transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/40"
            >
              {submittingMode === 'another' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{submittingMode === 'another' ? 'Saving...' : 'Save and add another'}</span>
            </button>
            <button
              type="submit"
              form="add-client-form"
              disabled={Boolean(submittingMode)}
              className="tactile-btn-primary px-5 py-2.5 text-[13px] flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/50"
            >
              {submittingMode === 'close' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{submittingMode === 'close' ? 'Saving...' : 'Create Client'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
