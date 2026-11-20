import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  AlertTriangle,
  ArrowUpRight,
  Building2,
  User,
  Sparkles,
  CalendarClock,
  Check,
  Loader2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { safeQuery } from '../lib/db';
import { useToast } from './Toast';
import {
  BUSINESS_TYPES,
  OUTLET_OPTIONS,
  DESIGNATION_OPTIONS,
  SOURCE_OPTIONS,
  INTEREST_OPTIONS,
  LEAD_STATUS_OPTIONS,
  FOLLOW_UP_TYPE_OPTIONS,
  cleanInstagramHandle,
  extractIndianPhoneDigits,
  formatPhoneInputDisplay,
  formatIndianCurrencyInput,
  normalizePhoneKey,
  getOffsetDateInput,
} from '../lib/leadOptions';

interface ExistingLeadSummary {
  id: string;
  business_name: string | null;
  full_name: string | null;
  phone: string | null;
  instagram: string | null;
}

interface AddLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingLeads?: ExistingLeadSummary[];
  onLeadCreated?: (lead: any) => void;
  onOpenExistingLead?: (lead: ExistingLeadSummary) => void;
  onViewLead?: (lead: any) => void;
}

type SectionKey = 'business' | 'contact' | 'interest' | 'followup';

const STEPS: { key: SectionKey; label: string }[] = [
  { key: 'business', label: 'Business' },
  { key: 'contact', label: 'Contact' },
  { key: 'interest', label: 'Interest' },
  { key: 'followup', label: 'Follow-up' },
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AddLeadModal({
  isOpen,
  onClose,
  existingLeads,
  onLeadCreated,
  onOpenExistingLead,
  onViewLead,
}: AddLeadModalProps) {
  const { showToast } = useToast();

  // Refs for accessibility, focus restoration, and step scrolling
  const openerRef = useRef<HTMLElement | null>(null);
  const skipRestoreFocusRef = useRef(false);
  const businessNameRef = useRef<HTMLInputElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Record<SectionKey, HTMLElement | null>>({
    business: null,
    contact: null,
    interest: null,
    followup: null,
  });

  // 1. BUSINESS
  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [city, setCity] = useState('');
  const [area, setArea] = useState('');
  const [outlets, setOutlets] = useState('');
  const [instagram, setInstagram] = useState('');

  // 2. CONTACT
  const [fullName, setFullName] = useState('');
  const [designation, setDesignation] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [email, setEmail] = useState('');

  // 3. INTEREST AND SOURCE
  const [source, setSource] = useState('Instagram');
  const [referredBy, setReferredBy] = useState('');
  const [interestedIn, setInterestedIn] = useState<string[]>([]);
  const [budgetDisplay, setBudgetDisplay] = useState('');

  // 4. FOLLOW-UP
  const [status, setStatus] = useState('New');
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpType, setFollowUpType] = useState('Call');
  const [notes, setNotes] = useState('');

  // Validation, Duplicate, & UI State
  const [activeStep, setActiveStep] = useState<SectionKey>('business');
  const [knownLeads, setKnownLeads] = useState<ExistingLeadSummary[]>([]);
  const [fieldErrors, setFieldErrors] = useState<{
    businessName?: string;
    phone?: string;
    email?: string;
    contactGroup?: string;
  }>({});
  const [debouncedPhone, setDebouncedPhone] = useState('');
  const [debouncedInstagram, setDebouncedInstagram] = useState('');
  const [submittingMode, setSubmittingMode] = useState<'close' | 'another' | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const resetFormFields = (keepSourceAndStatus = false) => {
    setBusinessName('');
    setBusinessType('');
    setCity('');
    setArea('');
    setOutlets('');
    setInstagram('');
    setFullName('');
    setDesignation('');
    setPhoneDigits('');
    setEmail('');
    if (!keepSourceAndStatus) {
      setSource('Instagram');
      setStatus('New');
    }
    setReferredBy('');
    setInterestedIn([]);
    setBudgetDisplay('');
    setFollowUpDate('');
    setFollowUpType('Call');
    setNotes('');
    setFieldErrors({});
    setDebouncedPhone('');
    setDebouncedInstagram('');
    setShowDiscardConfirm(false);
    setActiveStep('business');
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  };

  // Handle modal open/close & focus restoration
  useEffect(() => {
    if (isOpen) {
      openerRef.current = document.activeElement as HTMLElement | null;
      skipRestoreFocusRef.current = false;
      resetFormFields(false);
      setSubmittingMode(null);

      if (existingLeads && existingLeads.length > 0) {
        setKnownLeads(existingLeads);
      } else {
        safeQuery(async () => {
          const { data, error } = await supabase
            .from('leads')
            .select('id, business_name, full_name, phone, instagram');
          return { data: data || [], error };
        }, []).then((res) => {
          setKnownLeads(res.data);
        });
      }

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

  // Keep knownLeads updated if existingLeads prop changes while open
  useEffect(() => {
    if (isOpen && existingLeads && existingLeads.length > 0) {
      setKnownLeads(existingLeads);
    }
  }, [isOpen, existingLeads]);

  // Debounce Phone & Instagram duplicate checks by 500ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedPhone(phoneDigits), 500);
    return () => clearTimeout(t);
  }, [phoneDigits]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedInstagram(instagram), 500);
    return () => clearTimeout(t);
  }, [instagram]);

  const isDirty = useMemo(() => {
    return Boolean(
      businessName.trim() ||
        businessType ||
        city.trim() ||
        area.trim() ||
        outlets ||
        instagram.trim() ||
        fullName.trim() ||
        designation ||
        phoneDigits.trim() ||
        email.trim() ||
        source !== 'Instagram' ||
        referredBy.trim() ||
        interestedIn.length > 0 ||
        budgetDisplay.trim() ||
        status !== 'New' ||
        followUpDate ||
        followUpType !== 'Call' ||
        notes.trim()
    );
  }, [
    businessName,
    businessType,
    city,
    area,
    outlets,
    instagram,
    fullName,
    designation,
    phoneDigits,
    email,
    source,
    referredBy,
    interestedIn,
    budgetDisplay,
    status,
    followUpDate,
    followUpType,
    notes,
  ]);

  const phoneDuplicate = useMemo(() => {
    const key = normalizePhoneKey(debouncedPhone);
    if (!key || key.length < 10) return null;
    return (
      knownLeads.find((l) => {
        const existingKey = normalizePhoneKey(l.phone);
        return Boolean(existingKey && existingKey === key);
      }) || null
    );
  }, [debouncedPhone, knownLeads]);

  const instagramDuplicate = useMemo(() => {
    const key = cleanInstagramHandle(debouncedInstagram).toLowerCase();
    if (!key) return null;
    return (
      knownLeads.find((l) => {
        const existingKey = cleanInstagramHandle(l.instagram).toLowerCase();
        return Boolean(existingKey && existingKey === key);
      }) || null
    );
  }, [debouncedInstagram, knownLeads]);

  const tomorrowStr = useMemo(() => getOffsetDateInput(1), [isOpen]);
  const threeDaysStr = useMemo(() => getOffsetDateInput(3), [isOpen]);
  const nextWeekStr = useMemo(() => getOffsetDateInput(7), [isOpen]);

  // Global keyboard handler for Esc and Ctrl+Enter
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
          saveLead('close');
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

    // If scrolled near the bottom, highlight follow-up
    if (container.scrollHeight - container.clientHeight - scrollTop < 24) {
      setActiveStep('followup');
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

  const toggleInterest = (chip: string) => {
    setInterestedIn((prev) =>
      prev.includes(chip) ? prev.filter((item) => item !== chip) : [...prev, chip]
    );
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = extractIndianPhoneDigits(e.target.value);
    setPhoneDigits(digits);
    if (fieldErrors.phone || fieldErrors.contactGroup) {
      setFieldErrors((prev) => ({ ...prev, phone: undefined, contactGroup: undefined }));
    }
  };

  const handlePhoneBlur = () => {
    if (phoneDigits.length > 0 && phoneDigits.length !== 10) {
      setFieldErrors((prev) => ({
        ...prev,
        phone: 'Please enter a valid 10-digit Indian mobile number.',
      }));
    } else {
      setFieldErrors((prev) => ({ ...prev, phone: undefined }));
    }
  };

  const handleInstagramChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const lower = raw.toLowerCase();
    const cleaned =
      raw.includes('@') ||
      lower.includes('instagram.com') ||
      lower.includes('instagr.am') ||
      lower.startsWith('http')
        ? cleanInstagramHandle(raw)
        : raw.replace(/\s+/g, '');
    setInstagram(cleaned);
    if (fieldErrors.contactGroup) {
      setFieldErrors((prev) => ({ ...prev, contactGroup: undefined }));
    }
  };

  const handleInstagramBlur = () => {
    if (instagram.trim()) {
      setInstagram(cleanInstagramHandle(instagram));
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

  const handleBudgetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBudgetDisplay(formatIndianCurrencyInput(e.target.value));
  };

  const validateAll = (): boolean => {
    const errors: typeof fieldErrors = {};

    if (!businessName.trim()) {
      errors.businessName = 'Please enter a Business Name.';
    }

    if (phoneDigits.length > 0 && phoneDigits.length !== 10) {
      errors.phone = 'Please enter a valid 10-digit Indian mobile number.';
    }

    const trimmedEmail = email.trim();
    if (trimmedEmail && !EMAIL_REGEX.test(trimmedEmail)) {
      errors.email = 'Please enter a valid email address.';
    }

    const cleanedInsta = cleanInstagramHandle(instagram);
    if (!phoneDigits && !trimmedEmail && !cleanedInsta) {
      errors.contactGroup = 'Add at least one of Phone, Email or Instagram.';
    }

    setFieldErrors(errors);

    if (errors.businessName) {
      jumpToSection('business');
      businessNameRef.current?.focus();
      return false;
    }
    if (errors.phone || errors.email || errors.contactGroup) {
      jumpToSection('contact');
      return false;
    }

    return true;
  };

  const saveLead = async (mode: 'close' | 'another') => {
    if (submittingMode) return;
    if (!validateAll()) return;

    setSubmittingMode(mode);
    try {
      const cleanedInsta = cleanInstagramHandle(instagram);
      const formattedPhone =
        phoneDigits.length > 0 ? `+91 ${formatPhoneInputDisplay(phoneDigits)}` : '';
      const trimmedEmail = email.trim();
      const budgetDigits = budgetDisplay.replace(/\D/g, '');

      const payload = {
        business_name: businessName.trim(),
        business_type: businessType || null,
        city: city.trim() || null,
        area: area.trim() || null,
        outlets: outlets || null,
        instagram: cleanedInsta || null,
        full_name: fullName.trim() || null,
        designation: designation || null,
        phone: formattedPhone || null,
        email: trimmedEmail || null,
        source: source || null,
        referred_by: source === 'Referral' ? referredBy.trim() || null : null,
        interested_in: interestedIn.length > 0 ? interestedIn.join(', ') : null,
        deal_value: budgetDigits ? Number(budgetDigits) : null,
        status: status || 'New',
        follow_up_date: followUpDate || null,
        next_follow_up_type: followUpType || null,
        notes: notes.trim() || null,
        is_read: true,
      };

      const { data, error } = await supabase.from('leads').insert(payload).select().single();

      if (error || !data) {
        showToast('Could not add lead: ' + (error?.message || 'Unknown error'), 'error');
        setSubmittingMode(null);
        return;
      }

      const { error: activityError } = await supabase.from('lead_activities').insert({
        lead_id: data.id,
        type: 'Lead created',
        outcome: status || 'New',
        note: 'Lead created in CRM',
      });

      if (activityError) {
        console.error('Could not insert lead_activities row:', activityError);
      }

      setKnownLeads((prev) => [
        {
          id: data.id,
          business_name: data.business_name,
          full_name: data.full_name,
          phone: data.phone,
          instagram: data.instagram,
        },
        ...prev,
      ]);

      showToast('Lead added', 'success', {
        label: 'View lead',
        onClick: () => {
          skipRestoreFocusRef.current = true;
          onClose();
          onViewLead?.(data);
        },
      });

      onLeadCreated?.(data);

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
      showToast('Could not add lead: ' + (err?.message || 'Unexpected error'), 'error');
      setSubmittingMode(null);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveLead('close');
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

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-end sm:items-center justify-center sm:p-4"
      onClick={attemptClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-lead-modal-title"
        className="bg-white w-full sm:max-w-[720px] h-[100dvh] sm:h-auto sm:max-h-[90vh] rounded-none sm:rounded-2xl shadow-2xl border border-[#DCEBFF] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-[#E5ECF6] flex items-center justify-between shrink-0 bg-white">
          <div>
            <h3
              id="add-lead-modal-title"
              className="font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans'] text-lg"
            >
              Add New Lead
            </h3>
            <p className="text-[12px] text-slate-600">
              Capture hospitality prospect details, interests, and next follow-up.
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
          aria-label="Lead form sections"
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
                    className={`w-4 h-4 rounded-full text-[11px] flex items-center justify-center font-bold ${
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
              Discard this lead? Unsaved details will be lost.
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
            id="add-lead-form"
            onSubmit={handleFormSubmit}
            onKeyDown={handleFormKeyDown}
            noValidate
            className="space-y-6"
          >
            {/* SECTION 1: BUSINESS */}
            <section
              ref={(el) => {
                sectionRefs.current.business = el;
              }}
              className="space-y-4 scroll-mt-4"
            >
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#1D4ED8]" />
                <h4 className="text-[12px] font-bold text-[#0A1F5C] uppercase tracking-wider">
                  1. Business
                </h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="lead-business-name"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Business Name <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id="lead-business-name"
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
                    placeholder="The Grand Palace Hotel"
                    className={inputBaseClass(Boolean(businessName.trim()), Boolean(fieldErrors.businessName))}
                  />
                  {fieldErrors.businessName && (
                    <p className="text-[12px] font-medium text-rose-600">{fieldErrors.businessName}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="lead-business-type"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Business Type
                  </label>
                  <select
                    id="lead-business-type"
                    value={businessType}
                    onChange={(e) => setBusinessType(e.target.value)}
                    className={`${inputBaseClass(Boolean(businessType))} font-medium ${
                      businessType ? 'text-[#0A1F5C]' : 'text-[#94A3B8]'
                    }`}
                  >
                    <option value="">Select business type</option>
                    {BUSINESS_TYPES.map((type) => (
                      <option key={type} value={type} className="text-[#0A1F5C]">
                        {type}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="lead-city"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    City
                  </label>
                  <input
                    id="lead-city"
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Mumbai"
                    className={inputBaseClass(Boolean(city.trim()))}
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="lead-area"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Area / Locality
                  </label>
                  <input
                    id="lead-area"
                    type="text"
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                    placeholder="Bandra West"
                    className={inputBaseClass(Boolean(area.trim()))}
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="lead-outlets"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Outlets
                  </label>
                  <select
                    id="lead-outlets"
                    value={outlets}
                    onChange={(e) => setOutlets(e.target.value)}
                    className={`${inputBaseClass(Boolean(outlets))} font-medium ${
                      outlets ? 'text-[#0A1F5C]' : 'text-[#94A3B8]'
                    }`}
                  >
                    <option value="">Select outlets</option>
                    {OUTLET_OPTIONS.map((opt) => (
                      <option key={opt} value={opt} className="text-[#0A1F5C]">
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="lead-instagram"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Instagram Handle
                  </label>
                  <div className={prefixedWrapperClass(Boolean(instagram.trim()))}>
                    <span className="h-full px-3 flex items-center bg-[#EEF2F8] border-r border-[#DCEBFF] text-[#0A1F5C] font-semibold text-[14px] select-none">
                      @
                    </span>
                    <input
                      id="lead-instagram"
                      type="text"
                      value={instagram}
                      onChange={handleInstagramChange}
                      onBlur={handleInstagramBlur}
                      placeholder="grandpalacegoa"
                      className="w-full h-full px-3 bg-transparent text-[16px] sm:text-[14px] text-[#0A1F5C] placeholder:text-[#94A3B8] placeholder:text-[16px] sm:placeholder:text-[14px] focus:outline-none"
                    />
                  </div>
                  {instagramDuplicate && (
                    <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-center justify-between gap-2 text-[12px]">
                      <div className="flex items-start gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <span>
                          Already exists for{' '}
                          <strong>{instagramDuplicate.business_name || 'Unnamed'}</strong>.
                        </span>
                      </div>
                      {onOpenExistingLead && (
                        <button
                          type="button"
                          onClick={() => {
                            skipRestoreFocusRef.current = true;
                            onClose();
                            onOpenExistingLead(instagramDuplicate);
                          }}
                          className="text-[#1D4ED8] hover:underline font-semibold flex items-center gap-0.5 shrink-0"
                        >
                          <span>Open existing lead</span>
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
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
              <div>
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-[#1D4ED8]" />
                  <h4 className="text-[12px] font-bold text-[#0A1F5C] uppercase tracking-wider">
                    2. Contact
                  </h4>
                </div>
                <p
                  className={`text-[12px] mt-1 ${
                    fieldErrors.contactGroup ? 'text-rose-600 font-semibold' : 'text-slate-600'
                  }`}
                >
                  Add at least one of Phone, Email or Instagram.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="lead-contact-person"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Contact Person
                  </label>
                  <input
                    id="lead-contact-person"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Rohan Sharma"
                    className={inputBaseClass(Boolean(fullName.trim()))}
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="lead-designation"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Designation
                  </label>
                  <select
                    id="lead-designation"
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    className={`${inputBaseClass(Boolean(designation))} font-medium ${
                      designation ? 'text-[#0A1F5C]' : 'text-[#94A3B8]'
                    }`}
                  >
                    <option value="">Select designation</option>
                    {DESIGNATION_OPTIONS.map((d) => (
                      <option key={d} value={d} className="text-[#0A1F5C]">
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="lead-phone"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Phone / WhatsApp
                  </label>
                  <div className={prefixedWrapperClass(Boolean(phoneDigits), Boolean(fieldErrors.phone))}>
                    <span className="h-full px-3 flex items-center bg-[#EEF2F8] border-r border-[#DCEBFF] text-[#0A1F5C] font-semibold text-[14px] tabular-nums select-none">
                      +91
                    </span>
                    <input
                      id="lead-phone"
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
                  {phoneDuplicate && (
                    <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-center justify-between gap-2 text-[12px]">
                      <div className="flex items-start gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <span>
                          Already exists for{' '}
                          <strong>{phoneDuplicate.business_name || 'Unnamed'}</strong>.
                        </span>
                      </div>
                      {onOpenExistingLead && (
                        <button
                          type="button"
                          onClick={() => {
                            skipRestoreFocusRef.current = true;
                            onClose();
                            onOpenExistingLead(phoneDuplicate);
                          }}
                          className="text-[#1D4ED8] hover:underline font-semibold flex items-center gap-0.5 shrink-0"
                        >
                          <span>Open existing lead</span>
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="lead-email"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Email
                  </label>
                  <input
                    id="lead-email"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (fieldErrors.email || fieldErrors.contactGroup) {
                        setFieldErrors((prev) => ({
                          ...prev,
                          email: undefined,
                          contactGroup: undefined,
                        }));
                      }
                    }}
                    onBlur={handleEmailBlur}
                    aria-invalid={Boolean(fieldErrors.email)}
                    placeholder="info@hotel.com"
                    className={inputBaseClass(Boolean(email.trim()), Boolean(fieldErrors.email))}
                  />
                  {fieldErrors.email && (
                    <p className="text-[12px] font-medium text-rose-600">{fieldErrors.email}</p>
                  )}
                </div>
              </div>
            </section>

            {/* SECTION 3: INTEREST AND SOURCE */}
            <section
              ref={(el) => {
                sectionRefs.current.interest = el;
              }}
              className="space-y-4 pt-6 border-t border-[#E5ECF6] scroll-mt-4"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#1D4ED8]" />
                <h4 className="text-[12px] font-bold text-[#0A1F5C] uppercase tracking-wider">
                  3. Interest and Source
                </h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="lead-source"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Source
                  </label>
                  <select
                    id="lead-source"
                    value={source}
                    onChange={(e) => {
                      const nextSource = e.target.value;
                      setSource(nextSource);
                      if (nextSource !== 'Referral') {
                        setReferredBy('');
                      }
                    }}
                    className={`${inputBaseClass(Boolean(source))} font-medium`}
                  >
                    {SOURCE_OPTIONS.map((src) => (
                      <option key={src} value={src}>
                        {src}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="lead-budget"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Estimated Monthly Budget
                  </label>
                  <div className={prefixedWrapperClass(Boolean(budgetDisplay.trim()))}>
                    <span className="h-full px-3.5 flex items-center bg-[#EEF2F8] border-r border-[#DCEBFF] text-[#0A1F5C] font-semibold text-[14px] select-none">
                      ₹
                    </span>
                    <input
                      id="lead-budget"
                      type="text"
                      inputMode="numeric"
                      value={budgetDisplay}
                      onChange={handleBudgetChange}
                      placeholder="35,000"
                      className="w-full h-full px-3 bg-transparent text-[16px] sm:text-[14px] text-[#0A1F5C] font-semibold tabular-nums placeholder:text-[#94A3B8] placeholder:font-normal placeholder:text-[16px] sm:placeholder:text-[14px] focus:outline-none"
                    />
                  </div>
                </div>

                {source === 'Referral' && (
                  <div className="space-y-1.5 sm:col-span-2">
                    <label
                      htmlFor="lead-referred-by"
                      className="block text-[12px] font-semibold text-[#0A1F5C]"
                    >
                      Referred By
                    </label>
                    <input
                      id="lead-referred-by"
                      type="text"
                      value={referredBy}
                      onChange={(e) => setReferredBy(e.target.value)}
                      placeholder="Name of client, partner, or contact who referred"
                      className={inputBaseClass(Boolean(referredBy.trim()))}
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <span className="block text-[12px] font-semibold text-[#0A1F5C]">
                  Interested In
                </span>
                <div className="flex flex-wrap gap-2">
                  {INTEREST_OPTIONS.map((chip) => {
                    const selected = interestedIn.includes(chip);
                    return (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => toggleInterest(chip)}
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
            </section>

            {/* SECTION 4: FOLLOW-UP */}
            <section
              ref={(el) => {
                sectionRefs.current.followup = el;
              }}
              className="space-y-4 pt-6 border-t border-[#E5ECF6] scroll-mt-4"
            >
              <div className="flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-[#1D4ED8]" />
                <h4 className="text-[12px] font-bold text-[#0A1F5C] uppercase tracking-wider">
                  4. Follow-up
                </h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="lead-status"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Status
                  </label>
                  <select
                    id="lead-status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className={`${inputBaseClass(Boolean(status))} font-medium`}
                  >
                    {LEAD_STATUS_OPTIONS.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="lead-followup-date"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Follow-up Date
                  </label>
                  <input
                    id="lead-followup-date"
                    type="date"
                    value={followUpDate}
                    onChange={(e) => setFollowUpDate(e.target.value)}
                    className={`${inputBaseClass(Boolean(followUpDate))} font-medium ${
                      followUpDate ? 'text-[#0A1F5C]' : 'text-[#94A3B8]'
                    }`}
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="lead-followup-type"
                    className="block text-[12px] font-semibold text-[#0A1F5C]"
                  >
                    Follow-up Type
                  </label>
                  <select
                    id="lead-followup-type"
                    value={followUpType}
                    onChange={(e) => setFollowUpType(e.target.value)}
                    className={`${inputBaseClass(Boolean(followUpType))} font-medium`}
                  >
                    {FOLLOW_UP_TYPE_OPTIONS.map((ft) => (
                      <option key={ft} value={ft}>
                        {ft}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Quick Date Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12px] font-medium text-slate-600 mr-1">Quick set:</span>
                {[
                  { label: 'Tomorrow', value: tomorrowStr },
                  { label: 'In 3 days', value: threeDaysStr },
                  { label: 'Next week', value: nextWeekStr },
                ].map((btn) => {
                  const isActive = followUpDate === btn.value;
                  return (
                    <button
                      key={btn.label}
                      type="button"
                      onClick={() => setFollowUpDate(btn.value)}
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
                {followUpDate && (
                  <button
                    type="button"
                    onClick={() => setFollowUpDate('')}
                    className="px-2 py-1 text-[12px] text-slate-500 hover:text-[#0A1F5C] font-medium"
                  >
                    Clear
                  </button>
                )}
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="lead-notes"
                  className="block text-[12px] font-semibold text-[#0A1F5C]"
                >
                  Notes
                </label>
                <textarea
                  id="lead-notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Initial conversation details, property highlights, current pain points..."
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
            Tip: Press <kbd className="px-1.5 py-0.5 bg-[#F8FAFF] border border-[#DCEBFF] rounded text-[11px] font-semibold text-[#0A1F5C]">Ctrl</kbd> + <kbd className="px-1.5 py-0.5 bg-[#F8FAFF] border border-[#DCEBFF] rounded text-[11px] font-semibold text-[#0A1F5C]">Enter</kbd> to save
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
              onClick={() => saveLead('another')}
              disabled={Boolean(submittingMode)}
              className="px-4 py-2.5 rounded-xl bg-white border border-[#1D4ED8] text-[#1D4ED8] hover:bg-[#F2F7FF] text-[13px] font-semibold transition-all flex items-center gap-1.5 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/40"
            >
              {submittingMode === 'another' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{submittingMode === 'another' ? 'Saving...' : 'Save and add another'}</span>
            </button>
            <button
              type="submit"
              form="add-lead-form"
              disabled={Boolean(submittingMode)}
              className="tactile-btn-primary px-5 py-2.5 text-[13px] flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/50"
            >
              {submittingMode === 'close' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{submittingMode === 'close' ? 'Saving...' : 'Create Lead'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
