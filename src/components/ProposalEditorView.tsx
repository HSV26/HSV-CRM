import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Building2,
  Calendar,
  Check,
  ChevronDown,
  Copy,
  Download,
  Edit3,
  Eye,
  FileText,
  IndianRupee,
  Loader2,
  Lock,
  Mail,
  MessageCircle,
  MoreVertical,
  Package,
  Plus,
  Search,
  Send,
  Settings,
  Trash2,
  X,
  AlertCircle,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';
import { formatINR, formatInputDate } from '../lib/utils';
import {
  BUSINESS_TYPES,
  getLeadContactName,
  getLeadHotelName,
  getLeadLocation,
} from '../lib/leadOptions';
import {
  PACKAGE_TIERS,
  PACKAGE_DEFAULT_FEES,
  PACKAGE_DELIVERABLE_DEFAULTS,
  PackageTier,
  DEFAULT_PAYMENT_TERMS,
  DEFAULT_TERMS_TEXT,
  addDaysToDateInput,
  getProposalBaseDateInput,
  getDefaultStartDate,
  getDefaultValidUntilDate,
  getPackageDefaultFeeAmount,
  buildDefaultIntroText,
  formatINRInputDisplay,
  parseNumericInput,
  normalizeDeliverables,
  calculateProposalTotals,
  getEffectiveProposalStatus,
  getProposalStatusBadgeStyle,
  fetchNextProposalNumber,
  buildWhatsAppProposalMessage,
  buildEmailProposalText,
  syncLinkedLeadOnProposalSent,
  syncLinkedLeadOnProposalDeclined,
} from '../lib/proposalConfig';
import { downloadProposalPdf } from '../lib/proposalPdf';
import ProposalPreviewDocument from './ProposalPreviewDocument';
import CompanySettingsModal from './CompanySettingsModal';
import ConvertProposalClientModal, {
  AcceptedProposalForClient,
} from './ConvertProposalClientModal';

interface ProposalEditorViewProps {
  proposalId?: string | null;
  prefillType?: 'lead' | 'client' | null;
  prefillId?: string | null;
  onBack: () => void;
  onOpenProposal?: (proposalId: string) => void;
  onOpenClientProfile?: (clientId: string) => void;
  onProposalSaved?: () => void;
}

const BUSINESS_TYPE_CHOICES = Array.from(
  new Set([...BUSINESS_TYPES, 'Homestay/Airbnb', 'Clinic/Doctor'])
);

export default function ProposalEditorView({
  proposalId,
  prefillType,
  prefillId,
  onBack,
  onOpenProposal,
  onOpenClientProfile,
  onProposalSaved,
}: ProposalEditorViewProps) {
  const { showToast } = useToast();

  // Loading & inline error state
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<'edit' | 'preview'>('edit');

  // Persisted ID (becomes populated once auto-saved or opened)
  const [currentProposalId, setCurrentProposalId] = useState<string | null>(proposalId || null);

  // Leads & Clients for searchable picker
  const [leads, setLeads] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceQuery, setSourceQuery] = useState('');
  const sourcePickerRef = useRef<HTMLDivElement | null>(null);

  // Linked entities
  const [linkedLeadId, setLinkedLeadId] = useState<string | null>(null);
  const [linkedClientId, setLinkedClientId] = useState<string | null>(null);

  // 1. Client fields
  const [proposalNumber, setProposalNumber] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [contactName, setContactName] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [city, setCity] = useState('');
  const [businessNameError, setBusinessNameError] = useState<string | null>(null);

  // 2. Package & Deliverables
  const [packageTier, setPackageTier] = useState<PackageTier>('Growth');
  const [deliverables, setDeliverables] = useState<string[]>([
    ...PACKAGE_DELIVERABLE_DEFAULTS.Growth,
  ]);
  const [newDeliverable, setNewDeliverable] = useState('');

  // 3. Investment
  const [monthlyFeeDisplay, setMonthlyFeeDisplay] = useState(() =>
    formatINRInputDisplay(PACKAGE_DEFAULT_FEES.Growth)
  );
  const [monthlyFeeError, setMonthlyFeeError] = useState<string | null>(null);
  const [setupFeeDisplay, setSetupFeeDisplay] = useState('');
  const [discountDisplay, setDiscountDisplay] = useState('');
  const [gstEnabled, setGstEnabled] = useState(true);
  const [gstPercent, setGstPercent] = useState('18');

  // 4. Timeline (Valid Until = +7 days, Proposed Start = 3 days after Valid Until)
  const [validUntil, setValidUntil] = useState(() => getDefaultValidUntilDate());
  const [startDate, setStartDate] = useState(() =>
    getDefaultStartDate(undefined, getDefaultValidUntilDate())
  );
  const [startDateError, setStartDateError] = useState<string | null>(null);

  // 5. Text & optional sample work
  const [introText, setIntroText] = useState(() => buildDefaultIntroText('', '', '', ''));
  const [introManuallyEdited, setIntroManuallyEdited] = useState(false);
  const [paymentTerms, setPaymentTerms] = useState(DEFAULT_PAYMENT_TERMS);
  const [termsText, setTermsText] = useState(DEFAULT_TERMS_TEXT);
  const [showSampleWork, setShowSampleWork] = useState(false);
  const [sampleWorkNote, setSampleWorkNote] = useState('');

  // 6. Private Notes
  const [notes, setNotes] = useState('');

  // Lifecycle metadata
  const [status, setStatus] = useState('Draft');
  const [sentAt, setSentAt] = useState<string | null>(null);
  const [acceptedAt, setAcceptedAt] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);

  // Auto-save state
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);

  // Modals for Company Settings / Decline / Convert prompt
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [declineModalOpen, setDeclineModalOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [acceptOfferConvert, setAcceptOfferConvert] = useState(false);
  const [convertModalProposal, setConvertModalProposal] =
    useState<AcceptedProposalForClient | null>(null);

  // Track initialization to avoid auto-save loop on initial load
  const initializedRef = useRef(false);
  const isDirtySinceInitRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (sourcePickerRef.current && !sourcePickerRef.current.contains(e.target as Node)) {
        setSourceOpen(false);
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const loadEditorData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setSaveError(null);
    initializedRef.current = false;
    isDirtySinceInitRef.current = false;

    try {
      const [leadsRes, clientsRes] = await Promise.all([
        supabase.from('leads').select('*').order('created_at', { ascending: false }),
        supabase.from('clients').select('*').order('created_at', { ascending: false }),
      ]);

      if (leadsRes.error) {
        console.warn('Could not load leads for picker:', leadsRes.error.message);
      }
      if (clientsRes.error) {
        console.warn('Could not load clients for picker:', clientsRes.error.message);
      }

      const loadedLeads = leadsRes.data || [];
      const loadedClients = clientsRes.data || [];
      setLeads(loadedLeads);
      setClients(loadedClients);

      if (proposalId) {
        const { data, error } = await supabase
          .from('proposals')
          .select('*')
          .eq('id', proposalId)
          .single();

        if (error || !data) {
          setLoadError(error?.message || 'Could not load proposal.');
          setLoading(false);
          return;
        }

        setCurrentProposalId(data.id);
        setProposalNumber(data.proposal_number || (await fetchNextProposalNumber()));
        setLinkedLeadId(data.lead_id || null);
        setLinkedClientId(data.client_id || null);
        setBusinessName(data.business_name || '');
        setContactName(data.contact_name || '');
        setBusinessType(data.business_type || '');
        setCity(data.city || '');

        const pkg = PACKAGE_TIERS.includes(data.package as PackageTier)
          ? (data.package as PackageTier)
          : 'Custom';
        setPackageTier(pkg);
        const existingDeliverables = normalizeDeliverables(data.deliverables);
        setDeliverables(
          existingDeliverables.length > 0
            ? existingDeliverables
            : [...(PACKAGE_DELIVERABLE_DEFAULTS[pkg] || [])]
        );

        const fallbackPkgFee = pkg !== 'Custom' ? getPackageDefaultFeeAmount(pkg) : 0;
        const loadedMonthly =
          data.monthly_fee !== null && data.monthly_fee !== undefined && Number(data.monthly_fee) > 0
            ? Number(data.monthly_fee)
            : fallbackPkgFee;
        setMonthlyFeeDisplay(loadedMonthly > 0 ? formatINRInputDisplay(loadedMonthly) : '');
        setMonthlyFeeError(null);

        setSetupFeeDisplay(
          data.setup_fee !== null && data.setup_fee !== undefined && Number(data.setup_fee) > 0
            ? formatINRInputDisplay(data.setup_fee)
            : ''
        );
        setDiscountDisplay(
          data.discount !== null && data.discount !== undefined && Number(data.discount) > 0
            ? formatINRInputDisplay(data.discount)
            : ''
        );
        setGstEnabled(data.gst_enabled ?? true);
        setGstPercent(
          data.gst_percent !== null && data.gst_percent !== undefined
            ? String(data.gst_percent)
            : '18'
        );

        const baseProposalDate = getProposalBaseDateInput(data.created_at);
        const loadedValidUntil = data.valid_until || getDefaultValidUntilDate(baseProposalDate);
        const loadedStartDate =
          data.start_date || getDefaultStartDate(baseProposalDate, loadedValidUntil);
        setValidUntil(loadedValidUntil);
        setStartDate(loadedStartDate);
        setStartDateError(null);
        setIntroText(
          data.intro_text ??
            buildDefaultIntroText(
              data.business_name,
              data.business_type,
              data.city,
              data.contact_name
            )
        );
        setIntroManuallyEdited(Boolean(data.intro_text));
        setPaymentTerms(data.payment_terms || DEFAULT_PAYMENT_TERMS);
        setTermsText(data.terms_text || DEFAULT_TERMS_TEXT);
        setNotes(data.notes || '');
        setStatus(data.status || 'Draft');
        setSentAt(data.sent_at || null);
        setAcceptedAt(data.accepted_at || null);
        setCreatedAt(data.created_at || null);
        setSaveState('saved');
      } else {
        const nextNum = await fetchNextProposalNumber();
        setCurrentProposalId(null);
        setProposalNumber(nextNum);
        setStatus('Draft');
        setSentAt(null);
        setAcceptedAt(null);
        setCreatedAt(null);
        setPackageTier('Growth');
        setDeliverables([...PACKAGE_DELIVERABLE_DEFAULTS.Growth]);
        setMonthlyFeeDisplay(formatINRInputDisplay(PACKAGE_DEFAULT_FEES.Growth));
        setMonthlyFeeError(null);
        setSetupFeeDisplay('');
        setDiscountDisplay('');
        setGstEnabled(true);
        setGstPercent('18');
        const defaultValid = getDefaultValidUntilDate();
        setValidUntil(defaultValid);
        setStartDate(getDefaultStartDate(undefined, defaultValid));
        setStartDateError(null);
        setPaymentTerms(DEFAULT_PAYMENT_TERMS);
        setTermsText(DEFAULT_TERMS_TEXT);
        setNotes('');
        setIntroManuallyEdited(false);

        if (prefillType === 'lead' && prefillId) {
          const lead = loadedLeads.find((l: any) => l.id === prefillId);
          if (lead) {
            const bName = getLeadHotelName(lead);
            const cName = getLeadContactName(lead);
            const bType = lead.business_type || '';
            const lCity = getLeadLocation(lead);
            setLinkedLeadId(lead.id);
            setLinkedClientId(null);
            setBusinessName(bName === 'Unnamed Property' ? '' : bName);
            setContactName(cName);
            setBusinessType(bType);
            setCity(lCity);
            setIntroText(buildDefaultIntroText(bName, bType, lCity, cName));
            isDirtySinceInitRef.current = Boolean(bName && bName !== 'Unnamed Property');
          } else {
            setIntroText(buildDefaultIntroText('', '', '', ''));
          }
        } else if (prefillType === 'client' && prefillId) {
          const client = loadedClients.find((c: any) => c.id === prefillId);
          if (client) {
            const bName = client.business_name || '';
            const cName = client.contact_name || client.contact_person || '';
            const bType = client.business_type || '';
            const cCity = client.city || '';
            setLinkedClientId(client.id);
            setLinkedLeadId(null);
            setBusinessName(bName);
            setContactName(cName);
            setBusinessType(bType);
            setCity(cCity);
            const pkg = PACKAGE_TIERS.includes(client.package as PackageTier)
              ? (client.package as PackageTier)
              : 'Growth';
            setPackageTier(pkg);
            setDeliverables([...(PACKAGE_DELIVERABLE_DEFAULTS[pkg] || [])]);
            const clientMonthly =
              Number(client.monthly_fee) > 0
                ? Number(client.monthly_fee)
                : getPackageDefaultFeeAmount(pkg);
            setMonthlyFeeDisplay(clientMonthly > 0 ? formatINRInputDisplay(clientMonthly) : '');
            setIntroText(buildDefaultIntroText(bName, bType, cCity, cName));
            isDirtySinceInitRef.current = Boolean(bName);
          } else {
            setIntroText(buildDefaultIntroText('', '', '', ''));
          }
        } else {
          setLinkedLeadId(null);
          setLinkedClientId(null);
          setBusinessName('');
          setContactName('');
          setBusinessType('');
          setCity('');
          setIntroText(buildDefaultIntroText('', '', '', ''));
        }
      }

      initializedRef.current = true;
      setLoading(false);
    } catch (err: any) {
      setLoadError(err?.message || 'Unexpected error while loading proposal editor.');
      setLoading(false);
    }
  }, [proposalId, prefillType, prefillId]);

  useEffect(() => {
    loadEditorData();
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [loadEditorData]);

  // Keep default intro template in sync if user has not manually customized it
  useEffect(() => {
    if (!initializedRef.current || introManuallyEdited) return;
    setIntroText(buildDefaultIntroText(businessName, businessType, city, contactName));
  }, [businessName, businessType, city, contactName, introManuallyEdited]);

  const buildPayload = useCallback(
    (overrideStatus?: string, extraFields?: Record<string, any>) => {
      const mFee = parseNumericInput(monthlyFeeDisplay);
      const sFee = parseNumericInput(setupFeeDisplay);
      const disc = parseNumericInput(discountDisplay);
      const gstPct = gstPercent.trim() === '' ? 18 : Math.max(0, Math.min(100, Number(gstPercent) || 0));

      return {
        proposal_number: proposalNumber.trim() || `HS-${new Date().getFullYear()}-001`,
        lead_id: linkedLeadId || null,
        client_id: linkedClientId || null,
        business_name: businessName.trim(),
        contact_name: contactName.trim() || null,
        business_type: businessType.trim() || null,
        city: city.trim() || null,
        package: packageTier,
        intro_text: introText.trim() || null,
        deliverables: deliverables.map((d) => d.trim()).filter(Boolean),
        monthly_fee: monthlyFeeDisplay.trim() ? mFee : null,
        setup_fee: setupFeeDisplay.trim() ? sFee : null,
        discount: discountDisplay.trim() ? disc : null,
        gst_enabled: gstEnabled,
        gst_percent: gstPct,
        start_date: startDate || null,
        valid_until: validUntil || null,
        payment_terms: paymentTerms.trim() || null,
        terms_text: termsText.trim() || null,
        notes: notes.trim() || null,
        status: overrideStatus ?? status ?? 'Draft',
        ...extraFields,
      };
    },
    [
      proposalNumber,
      linkedLeadId,
      linkedClientId,
      businessName,
      contactName,
      businessType,
      city,
      packageTier,
      introText,
      deliverables,
      monthlyFeeDisplay,
      setupFeeDisplay,
      discountDisplay,
      gstEnabled,
      gstPercent,
      startDate,
      validUntil,
      paymentTerms,
      termsText,
      notes,
      status,
    ]
  );

  const persistProposal = useCallback(
    async (overrideStatus?: string, extraFields?: Record<string, any>): Promise<any | null> => {
      if (!businessName.trim()) {
        return null;
      }
      if (saveInFlightRef.current) return null;

      saveInFlightRef.current = true;
      setSaveState('saving');
      setSaveError(null);

      try {
        const targetStatus = overrideStatus ?? status ?? 'Draft';
        const payload = buildPayload(targetStatus, extraFields);

        if (currentProposalId) {
          const { data, error } = await supabase
            .from('proposals')
            .update(payload)
            .eq('id', currentProposalId)
            .select()
            .single();

          if (error) {
            setSaveState('error');
            setSaveError(error.message);
            saveInFlightRef.current = false;
            return null;
          }

          setSaveState('saved');
          onProposalSaved?.();
          saveInFlightRef.current = false;
          return data;
        } else {
          // Ensure unique proposal_number before initial insert
          const { data, error } = await supabase
            .from('proposals')
            .insert(payload)
            .select()
            .single();

          if (error || !data) {
            setSaveState('error');
            setSaveError(error?.message || 'Could not save proposal.');
            saveInFlightRef.current = false;
            return null;
          }

          setCurrentProposalId(data.id);
          if (data.created_at) setCreatedAt(data.created_at);
          setSaveState('saved');
          onProposalSaved?.();
          saveInFlightRef.current = false;
          return data;
        }
      } catch (err: any) {
        setSaveState('error');
        setSaveError(err?.message || 'Unexpected error saving proposal.');
        saveInFlightRef.current = false;
        return null;
      }
    },
    [businessName, status, buildPayload, currentProposalId, onProposalSaved]
  );

  // Auto-save while editing (debounced 750ms)
  useEffect(() => {
    if (!initializedRef.current || loading) return;
    if (!isDirtySinceInitRef.current) return;
    if (!businessName.trim()) return;

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    setSaveState('saving');

    debounceTimerRef.current = setTimeout(() => {
      // Auto-save keeps Draft for drafts, or updates existing proposal status
      const autoStatus = status || 'Draft';
      persistProposal(autoStatus);
    }, 750);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [
    proposalNumber,
    linkedLeadId,
    linkedClientId,
    businessName,
    contactName,
    businessType,
    city,
    packageTier,
    deliverables,
    monthlyFeeDisplay,
    setupFeeDisplay,
    discountDisplay,
    gstEnabled,
    gstPercent,
    startDate,
    validUntil,
    introText,
    paymentTerms,
    termsText,
    notes,
    loading,
    status,
    persistProposal,
  ]);

  const markDirty = () => {
    isDirtySinceInitRef.current = true;
  };

  // Searchable lead/client filtering
  const filteredPickerLeads = useMemo(() => {
    const q = sourceQuery.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((l) => {
      const h = getLeadHotelName(l).toLowerCase();
      const c = getLeadContactName(l).toLowerCase();
      const loc = getLeadLocation(l).toLowerCase();
      return h.includes(q) || c.includes(q) || loc.includes(q);
    });
  }, [leads, sourceQuery]);

  const filteredPickerClients = useMemo(() => {
    const q = sourceQuery.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => {
      const b = (c.business_name || '').toLowerCase();
      const p = (c.contact_name || c.contact_person || '').toLowerCase();
      const ct = (c.city || '').toLowerCase();
      return b.includes(q) || p.includes(q) || ct.includes(q);
    });
  }, [clients, sourceQuery]);

  const selectedSourceLabel = useMemo(() => {
    if (linkedLeadId) {
      const found = leads.find((l) => l.id === linkedLeadId);
      return found ? `Lead: ${getLeadHotelName(found)}` : 'Linked Lead';
    }
    if (linkedClientId) {
      const found = clients.find((c) => c.id === linkedClientId);
      return found ? `Client: ${found.business_name}` : 'Linked Client';
    }
    return 'Select existing lead or client (or type manually below)';
  }, [linkedLeadId, linkedClientId, leads, clients]);

  const handleSelectLeadSource = (lead: any) => {
    markDirty();
    const bName = getLeadHotelName(lead);
    const cName = getLeadContactName(lead);
    const bType = lead.business_type || '';
    const loc = getLeadLocation(lead);

    setLinkedLeadId(lead.id);
    setLinkedClientId(null);
    setBusinessName(bName === 'Unnamed Property' ? '' : bName);
    setContactName(cName);
    setBusinessType(bType);
    setCity(loc);
    setBusinessNameError(null);
    if (!introManuallyEdited) {
      setIntroText(buildDefaultIntroText(bName, bType, loc, cName));
    }
    setSourceOpen(false);
    setSourceQuery('');
  };

  const handleSelectClientSource = (client: any) => {
    markDirty();
    const bName = client.business_name || '';
    const cName = client.contact_name || client.contact_person || '';
    const bType = client.business_type || '';
    const cCity = client.city || '';

    setLinkedClientId(client.id);
    setLinkedLeadId(null);
    setBusinessName(bName);
    setContactName(cName);
    setBusinessType(bType);
    setCity(cCity);
    setBusinessNameError(null);
    if (client.package && PACKAGE_TIERS.includes(client.package as PackageTier)) {
      const nextPkg = client.package as PackageTier;
      setPackageTier(nextPkg);
      setDeliverables([...(PACKAGE_DELIVERABLE_DEFAULTS[nextPkg] || [])]);
      const fee =
        Number(client.monthly_fee) > 0
          ? Number(client.monthly_fee)
          : getPackageDefaultFeeAmount(nextPkg);
      if (fee > 0) {
        setMonthlyFeeDisplay(formatINRInputDisplay(fee));
        setMonthlyFeeError(null);
      }
    } else if (Number(client.monthly_fee) > 0) {
      setMonthlyFeeDisplay(formatINRInputDisplay(Number(client.monthly_fee)));
      setMonthlyFeeError(null);
    }
    if (!introManuallyEdited) {
      setIntroText(buildDefaultIntroText(bName, bType, cCity, cName));
    }
    setSourceOpen(false);
    setSourceQuery('');
  };

  const handleClearSourceLink = () => {
    markDirty();
    setLinkedLeadId(null);
    setLinkedClientId(null);
    setSourceOpen(false);
    setSourceQuery('');
  };

  const handlePackageSelect = (pkg: PackageTier) => {
    markDirty();
    setPackageTier(pkg);
    if (pkg !== 'Custom') {
      setDeliverables([...PACKAGE_DELIVERABLE_DEFAULTS[pkg]]);
      const defaultFee = PACKAGE_DEFAULT_FEES[pkg];
      setMonthlyFeeDisplay(formatINRInputDisplay(defaultFee));
      setMonthlyFeeError(null);
    } else {
      const currentNum = parseNumericInput(monthlyFeeDisplay);
      const isPresetFee =
        currentNum === PACKAGE_DEFAULT_FEES.Starter ||
        currentNum === PACKAGE_DEFAULT_FEES.Growth ||
        currentNum === PACKAGE_DEFAULT_FEES.Dominator;
      if (isPresetFee) {
        setMonthlyFeeDisplay('');
      }
    }
  };

  const handleDeliverableChange = (idx: number, val: string) => {
    markDirty();
    setDeliverables((prev) => prev.map((item, i) => (i === idx ? val : item)));
  };

  const handleMoveDeliverable = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= deliverables.length) return;
    markDirty();
    setDeliverables((prev) => {
      const copy = [...prev];
      const temp = copy[idx];
      copy[idx] = copy[target];
      copy[target] = temp;
      return copy;
    });
  };

  const handleRemoveDeliverable = (idx: number) => {
    markDirty();
    setDeliverables((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleAddDeliverable = () => {
    const trimmed = newDeliverable.trim();
    if (!trimmed) return;
    markDirty();
    setDeliverables((prev) => [...prev, trimmed]);
    setNewDeliverable('');
  };

  const previewData = useMemo(
    () => ({
      proposal_number: proposalNumber,
      business_name: businessName,
      contact_name: contactName,
      business_type: businessType,
      city,
      package: packageTier,
      intro_text: introText,
      deliverables,
      monthly_fee: parseNumericInput(monthlyFeeDisplay),
      setup_fee: parseNumericInput(setupFeeDisplay),
      discount: parseNumericInput(discountDisplay),
      gst_enabled: gstEnabled,
      gst_percent: gstPercent.trim() === '' ? 18 : Number(gstPercent) || 0,
      start_date: startDate,
      valid_until: validUntil,
      payment_terms: paymentTerms,
      terms_text: termsText,
      created_at: createdAt,
      show_sample_work: showSampleWork,
      sample_work_note: sampleWorkNote,
    }),
    [
      proposalNumber,
      businessName,
      contactName,
      businessType,
      city,
      packageTier,
      introText,
      deliverables,
      monthlyFeeDisplay,
      setupFeeDisplay,
      discountDisplay,
      gstEnabled,
      gstPercent,
      startDate,
      validUntil,
      paymentTerms,
      termsText,
      createdAt,
      showSampleWork,
      sampleWorkNote,
    ]
  );

  const totals = useMemo(() => calculateProposalTotals(previewData), [previewData]);
  const effectiveStatus = getEffectiveProposalStatus({ status, valid_until: validUntil });
  const proposalBaseDate = useMemo(() => getProposalBaseDateInput(createdAt), [createdAt]);

  const timelineOrderWarning = useMemo(() => {
    if (validUntil && validUntil < proposalBaseDate) {
      return 'Valid Until cannot be earlier than the proposal date.';
    }
    if (validUntil && startDate && validUntil >= startDate) {
      return 'Valid Until must be earlier than Proposed Start.';
    }
    if (startDate && startDate < proposalBaseDate) {
      return 'Proposed Start cannot be earlier than the proposal date.';
    }
    return null;
  }, [validUntil, startDate, proposalBaseDate]);

  const validateBeforeAction = (requirePrice = false): boolean => {
    if (!businessName.trim()) {
      setBusinessNameError('Please enter a Business Name.');
      setMobileTab('edit');
      showToast('Business Name is required', 'error');
      return false;
    }
    setBusinessNameError(null);

    if (timelineOrderWarning) {
      setStartDateError(timelineOrderWarning);
      setMobileTab('edit');
      showToast(timelineOrderWarning, 'error');
      return false;
    }
    setStartDateError(null);

    if (requirePrice && totals.monthlyFee <= 0) {
      setMonthlyFeeError('Please enter a price for this proposal first.');
      setMobileTab('edit');
      showToast('Please enter the monthly price first before downloading the PDF', 'error');
      return false;
    }
    setMonthlyFeeError(null);
    return true;
  };

  const handleDownloadPdf = async () => {
    if (actionBusy !== null) return;
    if (!validateBeforeAction(true)) return;
    setActionBusy('pdf');
    try {
      const filename = await downloadProposalPdf(previewData);
      showToast(`Downloaded ${filename}`, 'success');
    } catch (err: any) {
      showToast('Could not generate PDF: ' + (err?.message || 'Unknown error'), 'error');
    } finally {
      setActionBusy(null);
    }
  };

  const handleCopyWhatsApp = async () => {
    try {
      const text = buildWhatsAppProposalMessage(previewData);
      await navigator.clipboard.writeText(text);
      showToast('WhatsApp message copied', 'success');
    } catch {
      showToast('Could not copy to clipboard', 'error');
    }
  };

  const handleCopyEmail = async () => {
    try {
      const text = buildEmailProposalText(previewData);
      await navigator.clipboard.writeText(text);
      showToast('Email text copied', 'success');
    } catch {
      showToast('Could not copy to clipboard', 'error');
    }
  };

  const handleMarkAsSent = async () => {
    if (!validateBeforeAction() || actionBusy) return;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    setActionBusy('sent');
    try {
      const nowIso = new Date().toISOString();
      const saved = await persistProposal('Sent', { sent_at: nowIso });
      if (!saved) {
        showToast('Could not mark proposal as Sent', 'error');
        setActionBusy(null);
        return;
      }

      setStatus('Sent');
      setSentAt(nowIso);

      if (linkedLeadId) {
        await syncLinkedLeadOnProposalSent(linkedLeadId);
      }

      showToast(
        linkedLeadId
          ? 'Proposal marked as Sent and linked lead updated'
          : 'Proposal marked as Sent',
        'success'
      );
    } catch (err: any) {
      showToast(err?.message || 'Error marking proposal as Sent', 'error');
    } finally {
      setActionBusy(null);
    }
  };

  const handleMarkAsAccepted = async () => {
    if (!validateBeforeAction() || actionBusy) return;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    setActionBusy('accepted');
    try {
      const nowIso = new Date().toISOString();
      const saved = await persistProposal('Accepted', { accepted_at: nowIso });
      if (!saved) {
        showToast('Could not mark proposal as Accepted', 'error');
        setActionBusy(null);
        return;
      }

      setStatus('Accepted');
      setAcceptedAt(nowIso);
      setAcceptOfferConvert(true);
      showToast('Proposal marked as Accepted', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Error marking proposal as Accepted', 'error');
    } finally {
      setActionBusy(null);
    }
  };

  const handleConfirmDeclined = async () => {
    if (!validateBeforeAction() || actionBusy) return;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    setActionBusy('declined');
    try {
      const trimmedReason = declineReason.trim();
      const nextNotes = trimmedReason
        ? notes.trim()
          ? `${notes.trim()}\nDeclined reason: ${trimmedReason}`
          : `Declined reason: ${trimmedReason}`
        : notes.trim();

      if (trimmedReason) setNotes(nextNotes);

      const saved = await persistProposal('Declined', {
        notes: nextNotes || null,
      });

      if (!saved) {
        showToast('Could not mark proposal as Declined', 'error');
        setActionBusy(null);
        return;
      }

      setStatus('Declined');
      if (linkedLeadId) {
        await syncLinkedLeadOnProposalDeclined(linkedLeadId, trimmedReason);
      }

      setDeclineModalOpen(false);
      setDeclineReason('');
      showToast(
        linkedLeadId
          ? 'Proposal marked as Declined and linked lead set to Lost'
          : 'Proposal marked as Declined',
        'success'
      );
    } catch (err: any) {
      showToast(err?.message || 'Error marking proposal as Declined', 'error');
    } finally {
      setActionBusy(null);
    }
  };

  const handleDuplicate = async () => {
    if (!validateBeforeAction() || actionBusy) return;
    setActionBusy('duplicate');
    try {
      const nextNum = await fetchNextProposalNumber();
      const payload = buildPayload('Draft', {
        proposal_number: nextNum,
        business_name: `${businessName.trim()} (Copy)`,
        sent_at: null,
        accepted_at: null,
      });
      const { data, error } = await supabase
        .from('proposals')
        .insert(payload)
        .select()
        .single();

      if (error || !data) {
        showToast('Could not duplicate proposal: ' + (error?.message || 'Unknown error'), 'error');
        setActionBusy(null);
        return;
      }

      showToast(`Duplicated as ${nextNum}`, 'success');
      onProposalSaved?.();
      if (onOpenProposal) {
        onOpenProposal(data.id);
      }
    } catch (err: any) {
      showToast(err?.message || 'Unexpected error duplicating proposal', 'error');
    } finally {
      setActionBusy(null);
    }
  };

  const inputClass = (filled: boolean, hasError?: boolean) =>
    `w-full h-[44px] px-3.5 rounded-xl border text-[14px] text-[#0A1F5C] placeholder:text-[#94A3B8] placeholder:text-[14px] transition-all focus:outline-none ${
      filled ? 'bg-white shadow-2xs' : 'bg-[#F8FAFF]'
    } ${
      hasError
        ? 'border-rose-500 focus:border-rose-500 focus:ring-3 focus:ring-rose-500/20'
        : 'border-[#DCEBFF] focus:bg-white focus:border-[#1D4ED8] focus:ring-3 focus:ring-[#1D4ED8]/15'
    }`;

  const prefixedInputWrapperClass = (filled: boolean) =>
    `flex items-center w-full h-[44px] rounded-xl border overflow-hidden transition-all ${
      filled ? 'bg-white shadow-2xs' : 'bg-[#F8FAFF]'
    } border-[#DCEBFF] focus-within:bg-white focus-within:border-[#1D4ED8] focus-within:ring-3 focus-within:ring-[#1D4ED8]/15`;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F6F8FC] flex items-center justify-center p-8">
        <div className="bg-white border border-[#DCEBFF] rounded-2xl px-6 py-5 flex items-center gap-3 text-sm font-semibold text-[#0A1F5C] shadow-xs">
          <Loader2 className="w-4 h-4 animate-spin text-[#1D4ED8]" />
          <span>Loading Proposal Generator...</span>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-[#F6F8FC] flex items-center justify-center p-6">
        <div className="bg-white border border-rose-200 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-xs">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-base font-bold text-[#0A1F5C]">Could not load proposal</h2>
              <p className="text-xs text-slate-600 mt-1">{loadError}</p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onBack}
              className="px-4 py-2 bg-white border border-[#DCEBFF] text-[#0A1F5C] rounded-xl text-xs font-semibold hover:bg-[#F8FAFF]"
            >
              Back
            </button>
            <button
              type="button"
              onClick={loadEditorData}
              className="px-4 py-2 bg-[#1D4ED8] text-white rounded-xl text-xs font-semibold hover:bg-blue-700"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F6F8FC] flex flex-col">
      {/* STICKY TOP BAR */}
      <header className="sticky top-0 z-30 bg-white border-b border-[#DCEBFF] px-4 sm:px-6 py-3 shadow-2xs print:hidden">
        <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Left: Back, Number, Status Pill, Auto-save Indicator */}
          <div className="flex items-center flex-wrap gap-2.5 sm:gap-3">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-[#DCEBFF] hover:bg-[#F8FAFF] text-[#0A1F5C] rounded-xl text-xs font-semibold transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>

            <span className="font-mono text-xs sm:text-sm font-bold text-[#0A1F5C] bg-[#F8FAFF] border border-[#DCEBFF] px-2.5 py-1.5 rounded-lg">
              {proposalNumber || 'HS-2026-001'}
            </span>

            <span
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${getProposalStatusBadgeStyle(
                effectiveStatus
              )}`}
            >
              {effectiveStatus}
            </span>

            {/* Auto-save status indicator */}
            <div className="text-xs font-medium flex items-center gap-1.5">
              {saveState === 'saving' && (
                <span className="text-slate-500 flex items-center gap-1">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#1D4ED8]" />
                  <span>Saving...</span>
                </span>
              )}
              {saveState === 'saved' && (
                <span className="text-emerald-700 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  <span>Saved</span>
                </span>
              )}
              {saveState === 'error' && (
                <span className="text-rose-600 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Save failed</span>
                </span>
              )}
              {saveState === 'idle' && !businessName.trim() && (
                <span className="text-slate-400 hidden xl:inline">
                  Enter business name to auto-save
                </span>
              )}
            </div>
          </div>

          {/* Right: Action Buttons */}
          <div className="flex items-center flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSettingsModalOpen(true)}
              title="Company Settings (GSTIN, Bank & UPI)"
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-[#DCEBFF] hover:bg-[#F2F7FF] text-[#0A1F5C] rounded-xl text-xs font-semibold transition-colors whitespace-nowrap"
            >
              <Settings className="w-3.5 h-3.5 text-[#1D4ED8]" />
              <span className="hidden xl:inline">Company Settings</span>
            </button>

            <button
              type="button"
              disabled={actionBusy !== null}
              onClick={handleDownloadPdf}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-[#DCEBFF] hover:bg-[#F2F7FF] text-[#0A1F5C] rounded-xl text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-60"
            >
              {actionBusy === 'pdf' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#1D4ED8]" />
              ) : (
                <Download className="w-3.5 h-3.5 text-[#1D4ED8]" />
              )}
              <span>Download PDF</span>
            </button>

            <button
              type="button"
              onClick={handleCopyWhatsApp}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-[#DCEBFF] hover:bg-[#F2F7FF] text-[#0A1F5C] rounded-xl text-xs font-semibold transition-colors whitespace-nowrap"
            >
              <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden sm:inline">Copy WhatsApp</span>
              <span className="sm:hidden">WhatsApp</span>
            </button>

            <button
              type="button"
              onClick={handleCopyEmail}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-[#DCEBFF] hover:bg-[#F2F7FF] text-[#0A1F5C] rounded-xl text-xs font-semibold transition-colors whitespace-nowrap"
            >
              <Copy className="w-3.5 h-3.5 text-[#1D4ED8]" />
              <span className="hidden sm:inline">Copy email</span>
              <span className="sm:hidden">Email</span>
            </button>

            <button
              type="button"
              disabled={actionBusy !== null}
              onClick={handleMarkAsSent}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#1D4ED8] hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors whitespace-nowrap disabled:opacity-60"
            >
              {actionBusy === 'sent' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              <span>Mark as Sent</span>
            </button>

            {/* Lifecycle status menu (Accepted / Declined / Duplicate) */}
            <div className="relative" ref={moreMenuRef}>
              <button
                type="button"
                onClick={() => setMoreMenuOpen((prev) => !prev)}
                aria-label="More proposal actions"
                className="p-2 bg-white border border-[#DCEBFF] hover:bg-[#F8FAFF] text-[#0A1F5C] rounded-xl"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              {moreMenuOpen && (
                <div className="absolute right-0 mt-1.5 w-48 bg-white rounded-xl border border-[#DCEBFF] shadow-xl py-1.5 z-40 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setMoreMenuOpen(false);
                      handleMarkAsAccepted();
                    }}
                    className="w-full text-left px-3.5 py-2 hover:bg-emerald-50 text-emerald-700 font-semibold flex items-center gap-2"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Mark as Accepted</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMoreMenuOpen(false);
                      if (validateBeforeAction()) setDeclineModalOpen(true);
                    }}
                    className="w-full text-left px-3.5 py-2 hover:bg-rose-50 text-rose-600 font-semibold flex items-center gap-2"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Mark as Declined</span>
                  </button>
                  <div className="my-1 border-t border-[#E5ECF6]" />
                  <button
                    type="button"
                    onClick={() => {
                      setMoreMenuOpen(false);
                      handleDuplicate();
                    }}
                    className="w-full text-left px-3.5 py-2 hover:bg-[#F8FAFF] text-[#0A1F5C] font-medium flex items-center gap-2"
                  >
                    <Copy className="w-3.5 h-3.5 text-[#1D4ED8]" />
                    <span>Duplicate as Draft</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Edit / Preview Tabs */}
        <div className="lg:hidden mt-3 grid grid-cols-2 gap-1.5 bg-[#F2F7FF] p-1 rounded-xl border border-[#DCEBFF]">
          <button
            type="button"
            onClick={() => setMobileTab('edit')}
            className={`py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
              mobileTab === 'edit'
                ? 'bg-white text-[#0A1F5C] shadow-2xs border border-[#DCEBFF]'
                : 'text-slate-600'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Edit</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('preview')}
            className={`py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
              mobileTab === 'preview'
                ? 'bg-white text-[#0A1F5C] shadow-2xs border border-[#DCEBFF]'
                : 'text-slate-600'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Preview</span>
          </button>
        </div>
      </header>

      {/* Inline Save Error or Accepted -> Convert to Client Banner */}
      {saveError && (
        <div className="bg-rose-50 border-b border-rose-200 px-6 py-2.5 text-xs text-rose-700 font-medium flex items-center justify-between gap-3 print:hidden">
          <span className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            Could not save changes: {saveError}
          </span>
          <button
            type="button"
            onClick={() => persistProposal(status)}
            className="px-3 py-1 bg-white border border-rose-300 rounded-lg font-semibold hover:bg-rose-100"
          >
            Retry Save
          </button>
        </div>
      )}

      {acceptOfferConvert && (
        <div className="bg-[#F2F7FF] border-b border-[#DCEBFF] px-6 py-3 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <p className="text-xs font-semibold text-[#0A1F5C]">
              Proposal accepted! Convert <span className="text-[#1D4ED8]">{businessName}</span> to a
              client?
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAcceptOfferConvert(false)}
              className="px-3 py-1.5 bg-white border border-[#DCEBFF] text-slate-600 rounded-lg text-xs font-semibold hover:bg-slate-50"
            >
              Not now
            </button>
            <button
              type="button"
              onClick={() => {
                setAcceptOfferConvert(false);
                if (currentProposalId) {
                  setConvertModalProposal({
                    id: currentProposalId,
                    lead_id: linkedLeadId,
                    business_name: businessName,
                    contact_name: contactName,
                    business_type: businessType,
                    city,
                    package: packageTier,
                    monthly_fee: parseNumericInput(monthlyFeeDisplay),
                    start_date: startDate,
                    deliverables,
                  });
                }
              }}
              className="px-3.5 py-1.5 bg-[#1D4ED8] text-white rounded-lg text-xs font-semibold hover:bg-blue-700"
            >
              Convert to Client
            </button>
          </div>
        </div>
      )}

      {/* TWO-COLUMN DESKTOP WORKSPACE */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0">
        {/* LEFT COLUMN: NUMBERED FORM */}
        <div
          className={`lg:col-span-5 xl:col-span-5 bg-[#F8FAFF] border-r border-[#DCEBFF] lg:h-[calc(100vh-61px)] lg:overflow-y-auto p-5 sm:p-6 space-y-6 print:hidden ${
            mobileTab === 'preview' ? 'hidden lg:block' : ''
          }`}
        >
          {/* 1. CLIENT */}
          <section className="bg-white rounded-2xl border border-[#DCEBFF] p-5 space-y-4 shadow-2xs">
            <div className="flex items-center gap-2 pb-3 border-b border-[#E5ECF6]">
              <Building2 className="w-4 h-4 text-[#1D4ED8]" />
              <h2 className="text-[12px] font-bold text-[#0A1F5C] uppercase tracking-wider">
                1. Client
              </h2>
            </div>

            {/* Searchable Lead/Client Dropdown */}
            <div className="space-y-1.5 relative" ref={sourcePickerRef}>
              <label className="block text-[12px] font-semibold text-[#0A1F5C]">
                Pick existing lead or client
              </label>
              <button
                type="button"
                onClick={() => setSourceOpen((prev) => !prev)}
                className="w-full h-[44px] px-3.5 rounded-xl border border-[#DCEBFF] bg-[#F8FAFF] hover:bg-white text-left flex items-center justify-between gap-2 text-[14px] focus:outline-none focus:border-[#1D4ED8] focus:ring-3 focus:ring-[#1D4ED8]/15"
              >
                <span
                  className={`truncate ${
                    linkedLeadId || linkedClientId ? 'text-[#0A1F5C] font-medium' : 'text-[#94A3B8]'
                  }`}
                >
                  {selectedSourceLabel}
                </span>
                <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
              </button>

              {sourceOpen && (
                <div className="absolute left-0 right-0 mt-1.5 bg-white border border-[#DCEBFF] rounded-xl shadow-xl z-30 overflow-hidden">
                  <div className="p-2.5 border-b border-[#E5ECF6] bg-[#F8FAFF]">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                      <input
                        type="text"
                        autoFocus
                        value={sourceQuery}
                        onChange={(e) => setSourceQuery(e.target.value)}
                        placeholder="Search lead or client by name or city..."
                        className="w-full h-[36px] pl-8 pr-3 rounded-lg border border-[#DCEBFF] bg-white text-xs text-[#0A1F5C] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#1D4ED8]"
                      />
                    </div>
                  </div>
                  <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 text-xs">
                    <button
                      type="button"
                      onClick={handleClearSourceLink}
                      className="w-full text-left px-3.5 py-2.5 hover:bg-[#F8FAFF] text-slate-600 font-medium"
                    >
                      Manual entry (clear selection)
                    </button>

                    {filteredPickerLeads.length > 0 && (
                      <div>
                        <div className="px-3.5 py-1.5 bg-[#F2F7FF] text-[10px] font-bold uppercase tracking-wider text-[#1D4ED8]">
                          Leads
                        </div>
                        {filteredPickerLeads.map((l) => (
                          <button
                            key={l.id}
                            type="button"
                            onClick={() => handleSelectLeadSource(l)}
                            className="w-full text-left px-3.5 py-2.5 hover:bg-[#F8FAFF] flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <p className="font-semibold text-[#0A1F5C] truncate">
                                {getLeadHotelName(l)}
                              </p>
                              <p className="text-[11px] text-slate-500 truncate">
                                {[getLeadContactName(l), getLeadLocation(l)]
                                  .filter(Boolean)
                                  .join(' · ') || 'Lead'}
                              </p>
                            </div>
                            <span className="text-[10px] font-semibold text-slate-500 shrink-0">
                              {l.status || l.pipeline_stage || 'Lead'}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    {filteredPickerClients.length > 0 && (
                      <div>
                        <div className="px-3.5 py-1.5 bg-[#F2F7FF] text-[10px] font-bold uppercase tracking-wider text-[#1D4ED8]">
                          Clients
                        </div>
                        {filteredPickerClients.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => handleSelectClientSource(c)}
                            className="w-full text-left px-3.5 py-2.5 hover:bg-[#F8FAFF] flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <p className="font-semibold text-[#0A1F5C] truncate">
                                {c.business_name}
                              </p>
                              <p className="text-[11px] text-slate-500 truncate">
                                {[c.contact_name || c.contact_person, c.city]
                                  .filter(Boolean)
                                  .join(' · ') || 'Client'}
                              </p>
                            </div>
                            <span className="text-[10px] font-semibold text-emerald-700 shrink-0">
                              {c.status || 'Client'}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    {filteredPickerLeads.length === 0 && filteredPickerClients.length === 0 && (
                      <p className="px-3.5 py-4 text-center text-slate-400">
                        No matching leads or clients found.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1.5 sm:col-span-2">
                <label className="block text-[12px] font-semibold text-[#0A1F5C]">
                  Business Name <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => {
                    markDirty();
                    setBusinessName(e.target.value);
                    if (businessNameError && e.target.value.trim()) {
                      setBusinessNameError(null);
                    }
                  }}
                  onBlur={() => {
                    if (!businessName.trim()) {
                      setBusinessNameError('Please enter a Business Name.');
                    }
                  }}
                  placeholder="The Grand Palace Hotel"
                  className={inputClass(Boolean(businessName.trim()), Boolean(businessNameError))}
                />
                {businessNameError && (
                  <p className="text-[12px] font-medium text-rose-600">{businessNameError}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="block text-[12px] font-semibold text-[#0A1F5C]">
                  Contact Person
                </label>
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => {
                    markDirty();
                    setContactName(e.target.value);
                  }}
                  placeholder="Vikram Sharma"
                  className={inputClass(Boolean(contactName.trim()))}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[12px] font-semibold text-[#0A1F5C]">
                  Business Type
                </label>
                <select
                  value={
                    BUSINESS_TYPE_CHOICES.includes(businessType)
                      ? businessType
                      : businessType
                      ? '__custom__'
                      : ''
                  }
                  onChange={(e) => {
                    markDirty();
                    if (e.target.value !== '__custom__') {
                      setBusinessType(e.target.value);
                    }
                  }}
                  className={`${inputClass(Boolean(businessType))} ${
                    businessType ? 'text-[#0A1F5C]' : 'text-[#94A3B8]'
                  }`}
                >
                  <option value="">Select type</option>
                  {BUSINESS_TYPE_CHOICES.map((bt) => (
                    <option key={bt} value={bt} className="text-[#0A1F5C]">
                      {bt}
                    </option>
                  ))}
                  {businessType && !BUSINESS_TYPE_CHOICES.includes(businessType) && (
                    <option value="__custom__" className="text-[#0A1F5C]">
                      {businessType}
                    </option>
                  )}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[12px] font-semibold text-[#0A1F5C]">City</label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => {
                    markDirty();
                    setCity(e.target.value);
                  }}
                  placeholder="Mumbai"
                  className={inputClass(Boolean(city.trim()))}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[12px] font-semibold text-[#0A1F5C]">
                  Proposal Number
                </label>
                <input
                  type="text"
                  value={proposalNumber}
                  onChange={(e) => {
                    markDirty();
                    setProposalNumber(e.target.value);
                  }}
                  placeholder="HS-2026-001"
                  className={`${inputClass(Boolean(proposalNumber.trim()))} font-mono font-semibold`}
                />
              </div>
            </div>
          </section>

          {/* 2. PACKAGE */}
          <section className="bg-white rounded-2xl border border-[#DCEBFF] p-5 space-y-4 shadow-2xs">
            <div className="flex items-center gap-2 pb-3 border-b border-[#E5ECF6]">
              <Package className="w-4 h-4 text-[#1D4ED8]" />
              <h2 className="text-[12px] font-bold text-[#0A1F5C] uppercase tracking-wider">
                2. Package
              </h2>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {PACKAGE_TIERS.map((pkg) => {
                const active = packageTier === pkg;
                return (
                  <button
                    key={pkg}
                    type="button"
                    onClick={() => handlePackageSelect(pkg)}
                    className={`h-[42px] rounded-xl text-xs font-semibold border transition-colors ${
                      active
                        ? 'bg-[#1D4ED8] text-white border-[#1D4ED8]'
                        : 'bg-[#F8FAFF] text-[#0A1F5C] border-[#DCEBFF] hover:bg-white hover:border-[#3B82F6]'
                    }`}
                  >
                    {pkg}
                  </button>
                );
              })}
            </div>

            <div className="space-y-2.5">
              <label className="block text-[12px] font-semibold text-[#0A1F5C]">
                Deliverables checklist
              </label>

              {deliverables.length === 0 ? (
                <p className="text-xs text-slate-500 bg-[#F8FAFF] border border-dashed border-[#DCEBFF] rounded-xl p-3">
                  No deliverables added yet. Use the field below to add lines.
                </p>
              ) : (
                <div className="space-y-2">
                  {deliverables.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={item}
                        onChange={(e) => handleDeliverableChange(idx, e.target.value)}
                        className="flex-1 h-[40px] px-3 rounded-xl border border-[#DCEBFF] bg-white text-[13px] text-[#0A1F5C] focus:outline-none focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/15"
                      />
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => handleMoveDeliverable(idx, -1)}
                        aria-label="Move deliverable up"
                        className="p-2 rounded-lg border border-[#DCEBFF] bg-[#F8FAFF] text-slate-600 hover:bg-white hover:text-[#1D4ED8] disabled:opacity-35"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === deliverables.length - 1}
                        onClick={() => handleMoveDeliverable(idx, 1)}
                        aria-label="Move deliverable down"
                        className="p-2 rounded-lg border border-[#DCEBFF] bg-[#F8FAFF] text-slate-600 hover:bg-white hover:text-[#1D4ED8] disabled:opacity-35"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveDeliverable(idx)}
                        aria-label="Remove deliverable"
                        className="p-2 rounded-lg border border-[#DCEBFF] bg-[#F8FAFF] text-slate-500 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  value={newDeliverable}
                  onChange={(e) => setNewDeliverable(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddDeliverable();
                    }
                  }}
                  placeholder="Add a deliverable line..."
                  className={inputClass(Boolean(newDeliverable.trim()))}
                />
                <button
                  type="button"
                  onClick={handleAddDeliverable}
                  className="h-[44px] px-4 rounded-xl bg-[#F2F7FF] border border-[#DCEBFF] hover:bg-[#DCEBFF] text-[#1D4ED8] text-xs font-semibold inline-flex items-center gap-1 shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add</span>
                </button>
              </div>

              <p className="text-[11px] text-slate-500">Defaults are editable.</p>
            </div>
          </section>

          {/* 3. INVESTMENT */}
          <section className="bg-white rounded-2xl border border-[#DCEBFF] p-5 space-y-4 shadow-2xs">
            <div className="flex items-center gap-2 pb-3 border-b border-[#E5ECF6]">
              <IndianRupee className="w-4 h-4 text-[#1D4ED8]" />
              <h2 className="text-[12px] font-bold text-[#0A1F5C] uppercase tracking-wider">
                3. Investment
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div className="space-y-1.5">
                <label className="block text-[12px] font-semibold text-[#0A1F5C]">
                  Monthly fee (₹) <span className="text-rose-600">*</span>
                </label>
                <div
                  className={`flex items-center w-full h-[44px] rounded-xl border overflow-hidden transition-all ${
                    monthlyFeeDisplay ? 'bg-white shadow-2xs' : 'bg-[#F8FAFF]'
                  } ${
                    monthlyFeeError
                      ? 'border-rose-500 focus-within:border-rose-500 focus-within:ring-3 focus-within:ring-rose-500/20'
                      : 'border-[#DCEBFF] focus-within:bg-white focus-within:border-[#1D4ED8] focus-within:ring-3 focus-within:ring-[#1D4ED8]/15'
                  }`}
                >
                  <span className="px-3 text-sm font-semibold text-[#0A1F5C] bg-[#F2F7FF] h-full flex items-center border-r border-[#DCEBFF]">
                    ₹
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={monthlyFeeDisplay}
                    onChange={(e) => {
                      markDirty();
                      const formatted = formatINRInputDisplay(e.target.value);
                      setMonthlyFeeDisplay(formatted);
                      if (monthlyFeeError && parseNumericInput(formatted) > 0) {
                        setMonthlyFeeError(null);
                      }
                    }}
                    placeholder="Enter fee"
                    className="w-full h-full px-3 text-[14px] font-semibold text-[#0A1F5C] placeholder:text-[#94A3B8] placeholder:font-normal focus:outline-none tabular-nums"
                  />
                </div>
                {monthlyFeeError && (
                  <p className="text-[11px] font-medium text-rose-600">{monthlyFeeError}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="block text-[12px] font-semibold text-[#0A1F5C]">
                  One-time setup fee (₹)
                </label>
                <div className={prefixedInputWrapperClass(Boolean(setupFeeDisplay))}>
                  <span className="px-3 text-sm font-semibold text-[#0A1F5C] bg-[#F2F7FF] h-full flex items-center border-r border-[#DCEBFF]">
                    ₹
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={setupFeeDisplay}
                    onChange={(e) => {
                      markDirty();
                      setSetupFeeDisplay(formatINRInputDisplay(e.target.value));
                    }}
                    placeholder="Optional"
                    className="w-full h-full px-3 text-[14px] text-[#0A1F5C] placeholder:text-[#94A3B8] focus:outline-none tabular-nums"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[12px] font-semibold text-[#0A1F5C]">
                  Discount (₹)
                </label>
                <div className={prefixedInputWrapperClass(Boolean(discountDisplay))}>
                  <span className="px-3 text-sm font-semibold text-[#0A1F5C] bg-[#F2F7FF] h-full flex items-center border-r border-[#DCEBFF]">
                    ₹
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={discountDisplay}
                    onChange={(e) => {
                      markDirty();
                      setDiscountDisplay(formatINRInputDisplay(e.target.value));
                    }}
                    placeholder="Optional"
                    className="w-full h-full px-3 text-[14px] text-[#0A1F5C] placeholder:text-[#94A3B8] focus:outline-none tabular-nums"
                  />
                </div>
              </div>
            </div>

            {/* GST Toggle + Editable % */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={gstEnabled}
                  onClick={() => {
                    markDirty();
                    setGstEnabled((prev) => !prev);
                  }}
                  className="inline-flex items-center gap-2.5 cursor-pointer select-none focus:outline-none"
                >
                  <span
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors ${
                      gstEnabled
                        ? 'bg-[#1D4ED8] border-[#1D4ED8]'
                        : 'bg-slate-200 border-slate-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-xs transition-transform ${
                        gstEnabled ? 'translate-x-4.5' : 'translate-x-0.5'
                      }`}
                    />
                  </span>
                  <span className="text-xs font-semibold text-[#0A1F5C]">
                    Apply GST {gstEnabled ? 'On' : 'Off'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setSettingsModalOpen(true)}
                  className="text-[11px] font-semibold text-[#1D4ED8] hover:underline"
                >
                  Edit GSTIN &amp; Payment Details
                </button>
              </div>

              {gstEnabled && (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-600 font-medium">GST %</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={gstPercent}
                    onChange={(e) => {
                      markDirty();
                      setGstPercent(e.target.value);
                    }}
                    className="w-20 h-[38px] px-2.5 rounded-xl border border-[#DCEBFF] bg-[#F8FAFF] focus:bg-white text-center text-xs font-semibold text-[#0A1F5C] tabular-nums focus:outline-none focus:border-[#1D4ED8]"
                  />
                </div>
              )}
            </div>

            {/* Calculation Summary */}
            <div className="bg-[#F8FAFF] border border-[#DCEBFF] rounded-xl p-4 space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span className="font-semibold text-[#0A1F5C] tabular-nums">
                  {formatINR(totals.subtotal)}
                </span>
              </div>
              {totals.gstEnabled && (
                <div className="flex justify-between text-slate-600">
                  <span>GST ({totals.gstPercent}%)</span>
                  <span className="font-semibold text-[#0A1F5C] tabular-nums">
                    {formatINR(totals.gstAmount)}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2 border-t border-[#DCEBFF] text-sm font-bold text-[#0A1F5C]">
                <span>Total payable in first month</span>
                <span className="text-[#1D4ED8] tabular-nums">
                  {formatINR(totals.firstMonthTotal)}
                </span>
              </div>
            </div>
          </section>

          {/* 4. TIMELINE */}
          <section className="bg-white rounded-2xl border border-[#DCEBFF] p-5 space-y-4 shadow-2xs">
            <div className="flex items-center gap-2 pb-3 border-b border-[#E5ECF6]">
              <Calendar className="w-4 h-4 text-[#1D4ED8]" />
              <h2 className="text-[12px] font-bold text-[#0A1F5C] uppercase tracking-wider">
                4. Timeline
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <label className="block text-[12px] font-semibold text-[#0A1F5C]">
                  Valid until
                </label>
                <input
                  type="date"
                  min={proposalBaseDate}
                  value={validUntil}
                  onChange={(e) => {
                    markDirty();
                    setValidUntil(e.target.value);
                    setStartDateError(null);
                  }}
                  className={inputClass(
                    Boolean(validUntil),
                    Boolean(timelineOrderWarning && validUntil)
                  )}
                />
                <p className="text-[11px] text-slate-500">
                  Defaults to 7 days from the proposal date.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[12px] font-semibold text-[#0A1F5C]">
                  Proposed start
                </label>
                <input
                  type="date"
                  min={
                    validUntil && validUntil >= proposalBaseDate
                      ? addDaysToDateInput(validUntil, 1)
                      : proposalBaseDate
                  }
                  value={startDate}
                  onChange={(e) => {
                    markDirty();
                    setStartDate(e.target.value);
                    setStartDateError(null);
                  }}
                  className={inputClass(
                    Boolean(startDate),
                    Boolean(timelineOrderWarning || startDateError)
                  )}
                />
                <p className="text-[11px] text-slate-500">
                  Defaults to 3 days after Valid until.
                </p>
              </div>
            </div>

            {(timelineOrderWarning || startDateError) && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs text-rose-700">
                <div className="flex items-center gap-2 font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{timelineOrderWarning || startDateError}</span>
                </div>
                {validUntil && (
                  <button
                    type="button"
                    onClick={() => {
                      markDirty();
                      const safeValid =
                        validUntil < proposalBaseDate
                          ? getDefaultValidUntilDate(proposalBaseDate)
                          : validUntil;
                      if (safeValid !== validUntil) setValidUntil(safeValid);
                      setStartDate(getDefaultStartDate(proposalBaseDate, safeValid));
                      setStartDateError(null);
                    }}
                    className="px-2.5 py-1 bg-white border border-rose-300 rounded-lg text-[11px] font-semibold text-rose-700 hover:bg-rose-100"
                  >
                    Set Start to 3 days after Valid Until
                  </button>
                )}
              </div>
            )}
          </section>

          {/* 5. TEXT */}
          <section className="bg-white rounded-2xl border border-[#DCEBFF] p-5 space-y-4 shadow-2xs">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5ECF6]">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#1D4ED8]" />
                <h2 className="text-[12px] font-bold text-[#0A1F5C] uppercase tracking-wider">
                  5. Text
                </h2>
              </div>
              {introManuallyEdited && (
                <button
                  type="button"
                  onClick={() => {
                    markDirty();
                    setIntroManuallyEdited(false);
                    setIntroText(
                      buildDefaultIntroText(businessName, businessType, city, contactName)
                    );
                  }}
                  className="text-[11px] font-semibold text-[#1D4ED8] hover:underline"
                >
                  Reset intro template
                </button>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="block text-[12px] font-semibold text-[#0A1F5C]">
                Intro paragraph
              </label>
              <textarea
                rows={4}
                value={introText}
                onChange={(e) => {
                  markDirty();
                  setIntroManuallyEdited(true);
                  setIntroText(e.target.value);
                }}
                className="w-full p-3.5 rounded-xl border border-[#DCEBFF] bg-white text-[14px] text-[#0A1F5C] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#1D4ED8] focus:ring-3 focus:ring-[#1D4ED8]/15"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[12px] font-semibold text-[#0A1F5C]">
                Payment terms
              </label>
              <textarea
                rows={2}
                value={paymentTerms}
                onChange={(e) => {
                  markDirty();
                  setPaymentTerms(e.target.value);
                }}
                className="w-full p-3.5 rounded-xl border border-[#DCEBFF] bg-white text-[14px] text-[#0A1F5C] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#1D4ED8] focus:ring-3 focus:ring-[#1D4ED8]/15"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[12px] font-semibold text-[#0A1F5C]">Terms</label>
              <textarea
                rows={5}
                value={termsText}
                onChange={(e) => {
                  markDirty();
                  setTermsText(e.target.value);
                }}
                className="w-full p-3.5 rounded-xl border border-[#DCEBFF] bg-white text-[13px] text-[#0A1F5C] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#1D4ED8] focus:ring-3 focus:ring-[#1D4ED8]/15"
              />
            </div>

            {/* Optional Sample Work toggle (hidden by default) */}
            <div className="pt-2 border-t border-[#E5ECF6] space-y-2.5">
              <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showSampleWork}
                  onChange={(e) => setShowSampleWork(e.target.checked)}
                  className="w-4 h-4 rounded border-[#DCEBFF] text-[#1D4ED8] focus:ring-[#1D4ED8]"
                />
                <span className="text-xs font-semibold text-[#0A1F5C]">
                  Include optional Sample work section (labelled "Sample concept")
                </span>
              </label>

              {showSampleWork && (
                <textarea
                  rows={3}
                  value={sampleWorkNote}
                  onChange={(e) => setSampleWorkNote(e.target.value)}
                  placeholder="Describe a sample concept idea for this property (no invented client results or testimonials)..."
                  className="w-full p-3 rounded-xl border border-[#DCEBFF] bg-[#F8FAFF] focus:bg-white text-xs text-[#0A1F5C] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#1D4ED8]"
                />
              )}
            </div>
          </section>

          {/* 6. PRIVATE NOTES */}
          <section className="bg-white rounded-2xl border border-[#DCEBFF] p-5 space-y-3 shadow-2xs">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5ECF6]">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#1D4ED8]" />
                <h2 className="text-[12px] font-bold text-[#0A1F5C] uppercase tracking-wider">
                  6. Private notes
                </h2>
              </div>
              <span className="text-[11px] font-medium text-slate-500">
                Never shown in the proposal
              </span>
            </div>

            <textarea
              rows={3}
              value={notes}
              onChange={(e) => {
                markDirty();
                setNotes(e.target.value);
              }}
              placeholder="Internal reminders, negotiation context, shoot logistics..."
              className="w-full p-3.5 rounded-xl border border-[#DCEBFF] bg-[#F8FAFF] focus:bg-white text-[14px] text-[#0A1F5C] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#1D4ED8] focus:ring-3 focus:ring-[#1D4ED8]/15"
            />
          </section>
        </div>

        {/* RIGHT COLUMN: LIVE A4 PREVIEW */}
        <div
          className={`lg:col-span-7 xl:col-span-7 bg-[#EEF2F8] lg:h-[calc(100vh-61px)] lg:overflow-y-auto p-4 sm:p-6 lg:p-8 print:block print:p-0 print:bg-white ${
            mobileTab === 'edit' ? 'hidden lg:block' : ''
          }`}
        >
          <ProposalPreviewDocument proposal={previewData} />
        </div>
      </div>

      {/* DECLINE REASON MODAL */}
      {declineModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
          onClick={() => actionBusy === null && setDeclineModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white w-full max-w-md rounded-2xl border border-[#DCEBFF] shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans']">
                Mark Proposal as Declined
              </h3>
              <button
                type="button"
                onClick={() => setDeclineModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-[#0A1F5C] rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              {linkedLeadId
                ? 'This will mark the proposal as Declined and update the linked lead status to Lost.'
                : 'This will mark the proposal as Declined.'}
            </p>

            <div className="space-y-1.5">
              <label className="block text-[12px] font-semibold text-[#0A1F5C]">
                Reason (optional)
              </label>
              <textarea
                rows={3}
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="Budget mismatch, paused plans, chose another direction..."
                className="w-full p-3 rounded-xl border border-[#DCEBFF] bg-[#F8FAFF] focus:bg-white text-xs text-[#0A1F5C] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#1D4ED8]"
              />
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={actionBusy !== null}
                onClick={() => setDeclineModalOpen(false)}
                className="px-4 py-2 bg-white border border-[#DCEBFF] text-[#0A1F5C] rounded-xl text-xs font-semibold hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionBusy !== null}
                onClick={handleConfirmDeclined}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 disabled:opacity-60"
              >
                {actionBusy === 'declined' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Mark as Declined</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONVERT TO CLIENT MODAL */}
      <ConvertProposalClientModal
        proposal={convertModalProposal}
        onClose={() => setConvertModalProposal(null)}
        onConverted={(clientId) => {
          onProposalSaved?.();
          onOpenClientProfile?.(clientId);
        }}
      />

      {/* COMPANY & PAYMENT SETTINGS MODAL */}
      <CompanySettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
      />
    </div>
  );
}
