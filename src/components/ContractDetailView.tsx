import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  FileSignature,
  FileText,
  Loader2,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { safeQuery } from '../lib/db';
import { formatDate, formatINR, formatInputDate } from '../lib/utils';
import { useToast } from './Toast';
import {
  DEFAULT_PAYMENT_TERMS,
  PACKAGE_DEFAULT_FEES,
  PACKAGE_DELIVERABLE_DEFAULTS,
  PACKAGE_TIERS,
  PackageTier,
  calculateProposalTotals,
  formatINRInputDisplay,
  getPackageDefaultFeeAmount,
  normalizeDeliverables,
  parseNumericInput,
} from '../lib/proposalConfig';
import {
  ContractClause,
  ContractRenderContext,
  ContractTermType,
  DEFAULT_GOVERNING_LAW,
  DEFAULT_NOTICE_PERIOD_DAYS,
  buildClausesForContract,
  buildContractDraftFromProposal,
  buildWhatsAppContractMessage,
  computeContractRenewalDate,
  fetchNextContractNumber,
  getContractStatusBadgeStyle,
  getDefaultContractTemplates,
  getEffectiveContractStatus,
  hydrateClauseBody,
  normalizeContractClauses,
} from '../lib/contractConfig';
import { downloadContractPdf } from '../lib/contractPdf';
import AddClientModal from './AddClientModal';
import ContractTemplatesModal from './ContractTemplatesModal';
import CompanySettingsModal from './CompanySettingsModal';

interface ContractDetailViewProps {
  contractId?: string | null;
  prefillClientId?: string | null;
  prefillProposalId?: string | null;
  onBack: () => void;
  onContractSaved?: () => void;
  onOpenClientProfile?: (clientId: string) => void;
  onOpenContract?: (contractId: string) => void;
}

type MobileSectionKey = 'source' | 'parties' | 'commercial' | 'deliverables' | 'clauses';

export default function ContractDetailView({
  contractId,
  prefillClientId,
  prefillProposalId,
  onBack,
  onContractSaved,
  onOpenClientProfile,
  onOpenContract,
}: ContractDetailViewProps) {
  const { showToast } = useToast();
  const isNewContract = !contractId;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [currentContractId, setCurrentContractId] = useState<string | null>(contractId || null);

  // Reference lists
  const [clients, setClients] = useState<any[]>([]);
  const [proposals, setProposals] = useState<any[]>([]);

  // Source mode (when creating)
  const [createMode, setCreateMode] = useState<'scratch' | 'proposal'>(
    prefillProposalId ? 'proposal' : 'scratch'
  );
  const [proposalSearch, setProposalSearch] = useState('');
  const [proposalPickerOpen, setProposalPickerOpen] = useState(false);
  const proposalPickerRef = useRef<HTMLDivElement | null>(null);

  const [clientSearch, setClientSearch] = useState('');
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const clientPickerRef = useRef<HTMLDivElement | null>(null);

  // Linked entities
  const [linkedClientId, setLinkedClientId] = useState<string | null>(prefillClientId || null);
  const [linkedProposalId, setLinkedProposalId] = useState<string | null>(
    prefillProposalId || null
  );
  const [contractNumber, setContractNumber] = useState('');

  // Client & Parties
  const [businessName, setBusinessName] = useState('');
  const [contactName, setContactName] = useState('');
  const [clientDesignation, setClientDesignation] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [businessType, setBusinessType] = useState('');

  // Schedule & Terms
  const [contractDate, setContractDate] = useState(() => formatInputDate(new Date()));
  const [startDate, setStartDate] = useState(() => formatInputDate(new Date()));
  const [termType, setTermType] = useState<ContractTermType>('month-to-month');
  const [termMonths, setTermMonths] = useState('6');
  const [renewalDate, setRenewalDate] = useState('');
  const [renewalManuallyEdited, setRenewalManuallyEdited] = useState(false);

  // Package & Deliverables
  const [packageName, setPackageName] = useState<string>('Growth');
  const [deliverables, setDeliverables] = useState<string[]>([
    ...PACKAGE_DELIVERABLE_DEFAULTS.Growth,
  ]);
  const [newDeliverable, setNewDeliverable] = useState('');

  // Pricing & Legal terms
  const [monthlyFeeDisplay, setMonthlyFeeDisplay] = useState(() =>
    formatINRInputDisplay(PACKAGE_DEFAULT_FEES.Growth)
  );
  const [setupFeeDisplay, setSetupFeeDisplay] = useState('');
  const [discountDisplay, setDiscountDisplay] = useState('');
  const [gstEnabled, setGstEnabled] = useState(true);
  const [gstPercent, setGstPercent] = useState('18');
  const [paymentTerms, setPaymentTerms] = useState(DEFAULT_PAYMENT_TERMS);
  const [noticePeriodDays, setNoticePeriodDays] = useState(String(DEFAULT_NOTICE_PERIOD_DAYS));
  const [governingLaw, setGoverningLaw] = useState(DEFAULT_GOVERNING_LAW);
  const [notes, setNotes] = useState('');

  // Clauses
  const [clauses, setClauses] = useState<ContractClause[]>([]);
  const [expandedClauseIds, setExpandedClauseIds] = useState<Record<string, boolean>>({});

  // Lifecycle metadata
  const [status, setStatus] = useState('Draft');
  const [sentAt, setSentAt] = useState<string | null>(null);
  const [signedAt, setSignedAt] = useState<string | null>(null);
  const [terminatedAt, setTerminatedAt] = useState<string | null>(null);

  // Validation errors
  const [fieldErrors, setFieldErrors] = useState<{
    businessName?: string;
    startDate?: string;
    monthlyFee?: string;
    termMonths?: string;
  }>({});

  // Mobile collapsible sections (< lg)
  const [mobileSections, setMobileSections] = useState<Record<MobileSectionKey, boolean>>({
    source: true,
    parties: true,
    commercial: true,
    deliverables: true,
    clauses: false,
  });

  // Modals
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [signModalOpen, setSignModalOpen] = useState(false);
  const [signDateInput, setSignDateInput] = useState(() => formatInputDate(new Date()));
  const [terminateModalOpen, setTerminateModalOpen] = useState(false);
  const [terminateDateInput, setTerminateDateInput] = useState(() => formatInputDate(new Date()));
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Track outside clicks for pickers
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (clientPickerRef.current && !clientPickerRef.current.contains(e.target as Node)) {
        setClientPickerOpen(false);
      }
      if (proposalPickerRef.current && !proposalPickerRef.current.contains(e.target as Node)) {
        setProposalPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const buildCurrentContext = useCallback(
    (overrides?: Partial<ContractRenderContext>): ContractRenderContext => ({
      business_name: overrides?.business_name ?? businessName,
      contact_name: overrides?.contact_name ?? contactName,
      client_address: overrides?.client_address ?? clientAddress,
      contract_date: overrides?.contract_date ?? contractDate,
      start_date: overrides?.start_date ?? startDate,
      term_type: overrides?.term_type ?? termType,
      term_months: overrides?.term_months ?? termMonths,
      renewal_date: overrides?.renewal_date ?? renewalDate,
      package: overrides?.package ?? packageName,
      deliverables: overrides?.deliverables ?? deliverables,
      monthly_fee: overrides?.monthly_fee ?? parseNumericInput(monthlyFeeDisplay),
      setup_fee: overrides?.setup_fee ?? parseNumericInput(setupFeeDisplay),
      discount: overrides?.discount ?? parseNumericInput(discountDisplay),
      gst_enabled: overrides?.gst_enabled ?? gstEnabled,
      gst_percent: overrides?.gst_percent ?? (gstPercent === '' ? 18 : Number(gstPercent) || 0),
      payment_terms: overrides?.payment_terms ?? paymentTerms,
      notice_period_days: overrides?.notice_period_days ?? noticePeriodDays,
      governing_law: overrides?.governing_law ?? governingLaw,
    }),
    [
      businessName,
      contactName,
      clientAddress,
      contractDate,
      startDate,
      termType,
      termMonths,
      renewalDate,
      packageName,
      deliverables,
      monthlyFeeDisplay,
      setupFeeDisplay,
      discountDisplay,
      gstEnabled,
      gstPercent,
      paymentTerms,
      noticePeriodDays,
      governingLaw,
    ]
  );

  const applyClientToForm = useCallback(
    (client: any, alsoUpdateCommercial = false) => {
      if (!client) return;
      const bName = client.business_name || '';
      const cName = client.contact_name || client.contact_person || '';
      const cDesig = client.designation || '';
      const cEmail = client.email || '';
      const cPhone = client.phone || client.whatsapp || '';
      const cAddr = [client.address, client.city].filter(Boolean).join(', ');
      const bType = client.business_type || '';

      setLinkedClientId(client.id);
      setBusinessName(bName);
      setContactName(cName);
      setClientDesignation(cDesig);
      setClientEmail(cEmail);
      setClientPhone(cPhone);
      setClientAddress(cAddr);
      setBusinessType(bType);
      setFieldErrors((prev) => ({ ...prev, businessName: undefined }));

      if (alsoUpdateCommercial) {
        const pkg = PACKAGE_TIERS.includes(client.package as PackageTier)
          ? (client.package as PackageTier)
          : 'Growth';
        setPackageName(pkg);
        const delivs = client.deliverables
          ? normalizeDeliverables(client.deliverables)
          : [...(PACKAGE_DELIVERABLE_DEFAULTS[pkg] || [])];
        setDeliverables(
          delivs.length > 0 ? delivs : [...(PACKAGE_DELIVERABLE_DEFAULTS[pkg] || [])]
        );
        const mFee =
          Number(client.monthly_fee) > 0
            ? Number(client.monthly_fee)
            : getPackageDefaultFeeAmount(pkg);
        setMonthlyFeeDisplay(mFee > 0 ? formatINRInputDisplay(mFee) : '');

        if (!currentContractId) {
          setClauses(
            buildClausesForContract({
              business_name: bName,
              contact_name: cName,
              client_address: cAddr,
              contract_date: contractDate,
              start_date: startDate,
              term_type: termType,
              term_months: termMonths,
              renewal_date: renewalDate,
              package: pkg,
              deliverables:
                delivs.length > 0 ? delivs : [...(PACKAGE_DELIVERABLE_DEFAULTS[pkg] || [])],
              monthly_fee: mFee,
              setup_fee: parseNumericInput(setupFeeDisplay),
              discount: parseNumericInput(discountDisplay),
              gst_enabled: gstEnabled,
              gst_percent: gstPercent === '' ? 18 : Number(gstPercent) || 0,
              payment_terms: paymentTerms,
              notice_period_days: noticePeriodDays,
              governing_law: governingLaw,
            })
          );
        }
      } else if (!currentContractId) {
        setClauses(
          buildClausesForContract(
            buildCurrentContext({
              business_name: bName,
              contact_name: cName,
              client_address: cAddr,
            })
          )
        );
      }
    },
    [
      currentContractId,
      contractDate,
      startDate,
      termType,
      termMonths,
      renewalDate,
      setupFeeDisplay,
      discountDisplay,
      gstEnabled,
      gstPercent,
      paymentTerms,
      noticePeriodDays,
      governingLaw,
      buildCurrentContext,
    ]
  );

  const applyProposalDraft = useCallback(
    (proposal: any, loadedClients: any[], num: string) => {
      if (!proposal) return;
      const draft = buildContractDraftFromProposal(proposal, num, loadedClients);
      setCreateMode('proposal');
      setLinkedProposalId(proposal.id);
      setLinkedClientId(draft.client_id || null);
      setBusinessName(draft.business_name || '');
      setContactName(draft.contact_name || '');
      setClientDesignation('');
      setClientEmail(draft.client_email || '');
      setClientPhone(draft.client_phone || '');
      setClientAddress(draft.client_address || '');
      setBusinessType(draft.business_type || '');

      const todayStr = formatInputDate(new Date());
      setContractDate(draft.contract_date || todayStr);
      setStartDate(draft.start_date || todayStr);
      setTermType((draft.term_type as ContractTermType) || 'month-to-month');
      setTermMonths(draft.term_months ? String(draft.term_months) : '6');
      setRenewalDate(draft.renewal_date || '');
      setRenewalManuallyEdited(false);

      setPackageName(draft.package || 'Growth');
      setDeliverables(draft.deliverables || [...PACKAGE_DELIVERABLE_DEFAULTS.Growth]);
      setMonthlyFeeDisplay(
        draft.monthly_fee && draft.monthly_fee > 0
          ? formatINRInputDisplay(draft.monthly_fee)
          : ''
      );
      setSetupFeeDisplay(
        draft.setup_fee && draft.setup_fee > 0 ? formatINRInputDisplay(draft.setup_fee) : ''
      );
      setDiscountDisplay(
        draft.discount && draft.discount > 0 ? formatINRInputDisplay(draft.discount) : ''
      );
      setGstEnabled(draft.gst_enabled ?? true);
      setGstPercent(String(draft.gst_percent ?? 18));
      setPaymentTerms(draft.payment_terms || DEFAULT_PAYMENT_TERMS);
      setNoticePeriodDays(String(draft.notice_period_days ?? DEFAULT_NOTICE_PERIOD_DAYS));
      setGoverningLaw(draft.governing_law || DEFAULT_GOVERNING_LAW);
      setClauses(draft.clauses || []);
      setFieldErrors({});
    },
    []
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setSaveError(null);

    try {
      const [clientsRes, proposalsRes] = await Promise.all([
        safeQuery(async () => {
          const { data, error } = await supabase
            .from('clients')
            .select('*')
            .order('business_name', { ascending: true });
          return { data: data || [], error };
        }, []),
        safeQuery(async () => {
          const { data, error } = await supabase
            .from('proposals')
            .select('*')
            .order('created_at', { ascending: false });
          return { data: data || [], error };
        }, []),
      ]);

      const loadedClients = clientsRes.data;
      const loadedProposals = proposalsRes.data;
      setClients(loadedClients);
      setProposals(loadedProposals);

      if (contractId) {
        const { data, error } = await supabase
          .from('contracts')
          .select('*')
          .eq('id', contractId)
          .single();

        if (error || !data) {
          setLoadError(error?.message || 'Could not load contract details.');
          setLoading(false);
          return;
        }

        setCurrentContractId(data.id);
        setContractNumber(data.contract_number || (await fetchNextContractNumber()));
        setLinkedClientId(data.client_id || null);
        setLinkedProposalId(data.proposal_id || null);
        setBusinessName(data.business_name || '');
        setContactName(data.contact_name || '');
        setClientDesignation(data.client_designation || '');
        setClientEmail(data.client_email || '');
        setClientPhone(data.client_phone || '');
        setClientAddress(data.client_address || '');
        setBusinessType(data.business_type || '');

        const todayStr = formatInputDate(new Date());
        setContractDate(data.contract_date || todayStr);
        setStartDate(data.start_date || todayStr);
        const tType: ContractTermType = data.term_type === 'fixed' ? 'fixed' : 'month-to-month';
        setTermType(tType);
        setTermMonths(data.term_months ? String(data.term_months) : '6');
        setRenewalDate(data.renewal_date || '');
        setRenewalManuallyEdited(Boolean(data.renewal_date));

        const pkg = data.package || 'Growth';
        setPackageName(pkg);
        const normDeliv = normalizeDeliverables(data.deliverables);
        setDeliverables(
          normDeliv.length > 0
            ? normDeliv
            : [...(PACKAGE_DELIVERABLE_DEFAULTS[pkg as PackageTier] || [])]
        );
        setMonthlyFeeDisplay(
          Number(data.monthly_fee) > 0 ? formatINRInputDisplay(data.monthly_fee) : ''
        );
        setSetupFeeDisplay(
          Number(data.setup_fee) > 0 ? formatINRInputDisplay(data.setup_fee) : ''
        );
        setDiscountDisplay(
          Number(data.discount) > 0 ? formatINRInputDisplay(data.discount) : ''
        );
        setGstEnabled(data.gst_enabled ?? true);
        setGstPercent(
          data.gst_percent !== null && data.gst_percent !== undefined
            ? String(data.gst_percent)
            : '18'
        );
        setPaymentTerms(data.payment_terms || DEFAULT_PAYMENT_TERMS);
        setNoticePeriodDays(
          data.notice_period_days !== null && data.notice_period_days !== undefined
            ? String(data.notice_period_days)
            : String(DEFAULT_NOTICE_PERIOD_DAYS)
        );
        setGoverningLaw(data.governing_law || DEFAULT_GOVERNING_LAW);
        setNotes(data.notes || '');
        setStatus(data.status || 'Draft');
        setSentAt(data.sent_at || null);
        setSignedAt(data.signed_at || null);
        setTerminatedAt(data.terminated_at || null);

        const loadedClauses = normalizeContractClauses(data.clauses);
        if (loadedClauses.length > 0) {
          setClauses(loadedClauses);
        } else {
          setClauses(
            buildClausesForContract({
              business_name: data.business_name,
              contact_name: data.contact_name,
              client_address: data.client_address,
              contract_date: data.contract_date,
              start_date: data.start_date,
              term_type: tType,
              term_months: data.term_months,
              renewal_date: data.renewal_date,
              package: pkg,
              deliverables: normDeliv,
              monthly_fee: data.monthly_fee,
              setup_fee: data.setup_fee,
              discount: data.discount,
              gst_enabled: data.gst_enabled ?? true,
              gst_percent: data.gst_percent ?? 18,
              payment_terms: data.payment_terms || DEFAULT_PAYMENT_TERMS,
              notice_period_days: data.notice_period_days ?? DEFAULT_NOTICE_PERIOD_DAYS,
              governing_law: data.governing_law || DEFAULT_GOVERNING_LAW,
            })
          );
        }
      } else {
        const nextNum = await fetchNextContractNumber();
        setCurrentContractId(null);
        setContractNumber(nextNum);
        setStatus('Draft');
        setSentAt(null);
        setSignedAt(null);
        setTerminatedAt(null);
        setNotes('');

        if (prefillProposalId) {
          const foundProposal = loadedProposals.find((p: any) => p.id === prefillProposalId);
          if (foundProposal) {
            applyProposalDraft(foundProposal, loadedClients, nextNum);
            setLoading(false);
            return;
          }
        }

        const todayStr = formatInputDate(new Date());
        setContractDate(todayStr);
        setStartDate(todayStr);
        setTermType('month-to-month');
        setTermMonths('6');
        setRenewalDate('');
        setRenewalManuallyEdited(false);

        if (prefillClientId) {
          const foundClient = loadedClients.find((c: any) => c.id === prefillClientId);
          if (foundClient) {
            const pkg = PACKAGE_TIERS.includes(foundClient.package as PackageTier)
              ? (foundClient.package as PackageTier)
              : 'Growth';
            const delivs = foundClient.deliverables
              ? normalizeDeliverables(foundClient.deliverables)
              : [...(PACKAGE_DELIVERABLE_DEFAULTS[pkg] || [])];
            const finalDelivs =
              delivs.length > 0 ? delivs : [...(PACKAGE_DELIVERABLE_DEFAULTS[pkg] || [])];
            const mFee =
              Number(foundClient.monthly_fee) > 0
                ? Number(foundClient.monthly_fee)
                : getPackageDefaultFeeAmount(pkg);
            const addr = [foundClient.address, foundClient.city].filter(Boolean).join(', ');
            const cName = foundClient.contact_name || foundClient.contact_person || '';

            setLinkedClientId(foundClient.id);
            setBusinessName(foundClient.business_name || '');
            setContactName(cName);
            setClientDesignation(foundClient.designation || '');
            setClientEmail(foundClient.email || '');
            setClientPhone(foundClient.phone || foundClient.whatsapp || '');
            setClientAddress(addr);
            setBusinessType(foundClient.business_type || '');
            setPackageName(pkg);
            setDeliverables(finalDelivs);
            setMonthlyFeeDisplay(mFee > 0 ? formatINRInputDisplay(mFee) : '');
            setSetupFeeDisplay('');
            setDiscountDisplay('');
            setGstEnabled(true);
            setGstPercent('18');
            setPaymentTerms(DEFAULT_PAYMENT_TERMS);
            setNoticePeriodDays(String(DEFAULT_NOTICE_PERIOD_DAYS));
            setGoverningLaw(DEFAULT_GOVERNING_LAW);
            setClauses(
              buildClausesForContract({
                business_name: foundClient.business_name,
                contact_name: cName,
                client_address: addr,
                contract_date: todayStr,
                start_date: todayStr,
                term_type: 'month-to-month',
                package: pkg,
                deliverables: finalDelivs,
                monthly_fee: mFee,
                gst_enabled: true,
                gst_percent: 18,
                payment_terms: DEFAULT_PAYMENT_TERMS,
                notice_period_days: DEFAULT_NOTICE_PERIOD_DAYS,
                governing_law: DEFAULT_GOVERNING_LAW,
              })
            );
            setLoading(false);
            return;
          }
        }

        // Blank contract from scratch
        setLinkedClientId(null);
        setLinkedProposalId(null);
        setBusinessName('');
        setContactName('');
        setClientDesignation('');
        setClientEmail('');
        setClientPhone('');
        setClientAddress('');
        setBusinessType('');
        setPackageName('Growth');
        setDeliverables([...PACKAGE_DELIVERABLE_DEFAULTS.Growth]);
        setMonthlyFeeDisplay(formatINRInputDisplay(PACKAGE_DEFAULT_FEES.Growth));
        setSetupFeeDisplay('');
        setDiscountDisplay('');
        setGstEnabled(true);
        setGstPercent('18');
        setPaymentTerms(DEFAULT_PAYMENT_TERMS);
        setNoticePeriodDays(String(DEFAULT_NOTICE_PERIOD_DAYS));
        setGoverningLaw(DEFAULT_GOVERNING_LAW);
        setClauses(
          buildClausesForContract({
            contract_date: todayStr,
            start_date: todayStr,
            term_type: 'month-to-month',
            package: 'Growth',
            deliverables: [...PACKAGE_DELIVERABLE_DEFAULTS.Growth],
            monthly_fee: PACKAGE_DEFAULT_FEES.Growth,
            gst_enabled: true,
            gst_percent: 18,
            payment_terms: DEFAULT_PAYMENT_TERMS,
            notice_period_days: DEFAULT_NOTICE_PERIOD_DAYS,
            governing_law: DEFAULT_GOVERNING_LAW,
          })
        );
      }

      setLoading(false);
    } catch (err: any) {
      setLoadError(err?.message || 'Could not load contract.');
      setLoading(false);
    }
  }, [contractId, prefillClientId, prefillProposalId, applyProposalDraft]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-update computed renewal_date when fixed term changes (unless manually overridden)
  useEffect(() => {
    if (termType !== 'fixed') {
      if (renewalDate !== '') setRenewalDate('');
      return;
    }
    if (!renewalManuallyEdited) {
      const computed = computeContractRenewalDate(startDate, 'fixed', termMonths);
      setRenewalDate(computed);
    }
  }, [termType, startDate, termMonths, renewalManuallyEdited, renewalDate]);

  const totals = useMemo(
    () =>
      calculateProposalTotals({
        monthly_fee: parseNumericInput(monthlyFeeDisplay),
        setup_fee: parseNumericInput(setupFeeDisplay),
        discount: parseNumericInput(discountDisplay),
        gst_enabled: gstEnabled,
        gst_percent: gstPercent === '' ? 18 : Number(gstPercent) || 0,
      }),
    [monthlyFeeDisplay, setupFeeDisplay, discountDisplay, gstEnabled, gstPercent]
  );

  const effectiveStatus = useMemo(
    () =>
      getEffectiveContractStatus({
        status,
        term_type: termType,
        renewal_date: renewalDate,
      }),
    [status, termType, renewalDate]
  );

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        (c.business_name || '').toLowerCase().includes(q) ||
        (c.contact_name || c.contact_person || '').toLowerCase().includes(q) ||
        (c.city || '').toLowerCase().includes(q)
    );
  }, [clients, clientSearch]);

  const filteredProposals = useMemo(() => {
    const q = proposalSearch.trim().toLowerCase();
    if (!q) return proposals;
    return proposals.filter(
      (p) =>
        (p.proposal_number || '').toLowerCase().includes(q) ||
        (p.business_name || '').toLowerCase().includes(q) ||
        (p.package || '').toLowerCase().includes(q)
    );
  }, [proposals, proposalSearch]);

  const validateForm = (): boolean => {
    const errs: typeof fieldErrors = {};
    if (!businessName.trim()) {
      errs.businessName = 'Please choose a client or enter a client business name.';
    }
    if (!startDate) {
      errs.startDate = 'Start date is required.';
    }
    if (parseNumericInput(monthlyFeeDisplay) <= 0) {
      errs.monthlyFee = 'Monthly fee must be greater than ₹0.';
    }
    if (termType === 'fixed' && (!termMonths || Number(termMonths) <= 0)) {
      errs.termMonths = 'Please enter contract duration in months.';
    }
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) {
      if (errs.businessName) {
        setMobileSections((s) => ({ ...s, parties: true }));
      }
      if (errs.startDate || errs.monthlyFee || errs.termMonths) {
        setMobileSections((s) => ({ ...s, commercial: true }));
      }
      showToast('Please fix the highlighted fields before saving.', 'error');
      return false;
    }
    return true;
  };

  const buildPayload = (overrideStatus?: string, extraFields?: Record<string, any>) => {
    const parsedTermMonths =
      termType === 'fixed' ? Math.max(1, Math.round(Number(termMonths) || 6)) : null;
    const computedRenewal =
      termType === 'fixed'
        ? renewalDate || computeContractRenewalDate(startDate, 'fixed', parsedTermMonths) || null
        : null;
    const gstPct = gstPercent.trim() === '' ? 18 : Math.max(0, Math.min(100, Number(gstPercent) || 0));
    const noticeDays = Math.max(0, Math.round(Number(noticePeriodDays) || 0));

    return {
      contract_number: contractNumber.trim() || `HS-C-${new Date().getFullYear()}-001`,
      client_id: linkedClientId || null,
      proposal_id: linkedProposalId || null,
      business_name: businessName.trim(),
      contact_name: contactName.trim() || null,
      client_designation: clientDesignation.trim() || null,
      client_email: clientEmail.trim() || null,
      client_phone: clientPhone.trim() || null,
      client_address: clientAddress.trim() || null,
      business_type: businessType.trim() || null,
      contract_date: contractDate || formatInputDate(new Date()),
      start_date: startDate,
      term_type: termType,
      term_months: parsedTermMonths,
      renewal_date: computedRenewal,
      package: packageName.trim() || 'Growth',
      deliverables: deliverables.map((d) => d.trim()).filter(Boolean),
      monthly_fee: parseNumericInput(monthlyFeeDisplay),
      setup_fee: setupFeeDisplay.trim() ? parseNumericInput(setupFeeDisplay) : 0,
      discount: discountDisplay.trim() ? parseNumericInput(discountDisplay) : 0,
      gst_enabled: gstEnabled,
      gst_percent: gstPct,
      payment_terms: paymentTerms.trim() || DEFAULT_PAYMENT_TERMS,
      notice_period_days: noticeDays,
      governing_law: governingLaw.trim() || DEFAULT_GOVERNING_LAW,
      clauses: clauses.map((c) => ({
        id: c.id,
        key: c.key,
        title: c.title.trim() || 'Clause',
        body: c.body,
        enabled: c.enabled !== false,
      })),
      status: overrideStatus ?? status ?? 'Draft',
      sent_at: extraFields?.sent_at !== undefined ? extraFields.sent_at : sentAt,
      signed_at: extraFields?.signed_at !== undefined ? extraFields.signed_at : signedAt,
      terminated_at:
        extraFields?.terminated_at !== undefined ? extraFields.terminated_at : terminatedAt,
      notes: notes.trim() || null,
    };
  };

  const persistContract = async (
    overrideStatus?: string,
    extraFields?: Record<string, any>
  ): Promise<any | null> => {
    if (!validateForm()) return null;

    setSaving(true);
    setSaveError(null);
    try {
      const payload = buildPayload(overrideStatus, extraFields);

      if (currentContractId) {
        const { data, error } = await supabase
          .from('contracts')
          .update(payload)
          .eq('id', currentContractId)
          .select()
          .single();

        if (error || !data) {
          setSaveError(error?.message || 'Could not update contract.');
          setSaving(false);
          return null;
        }
        setSaving(false);
        onContractSaved?.();
        return data;
      } else {
        // Insert new contract; retry once with refreshed number if unique key collides
        let attemptPayload = { ...payload };
        let { data, error } = await supabase
          .from('contracts')
          .insert(attemptPayload)
          .select()
          .single();

        if (error && /duplicate|unique/i.test(error.message || '')) {
          const freshNum = await fetchNextContractNumber();
          setContractNumber(freshNum);
          attemptPayload = { ...payload, contract_number: freshNum };
          const retryRes = await supabase
            .from('contracts')
            .insert(attemptPayload)
            .select()
            .single();
          data = retryRes.data;
          error = retryRes.error;
        }

        if (error || !data) {
          setSaveError(error?.message || 'Could not create contract.');
          setSaving(false);
          return null;
        }

        setCurrentContractId(data.id);
        setContractNumber(data.contract_number);
        setSaving(false);
        onContractSaved?.();
        onOpenContract?.(data.id);
        return data;
      }
    } catch (err: any) {
      setSaveError(err?.message || 'Unexpected error while saving contract.');
      setSaving(false);
      return null;
    }
  };

  const handleSaveDraftOrChanges = async () => {
    const saved = await persistContract();
    if (saved) {
      showToast(`Saved ${saved.contract_number}`, 'success');
    }
  };

  const handleDownloadPdf = async () => {
    setBusyAction('pdf');
    try {
      const snapshot = buildPayload();
      const filename = await downloadContractPdf(snapshot);
      showToast(`Downloaded ${filename}`, 'success');
    } catch (err: any) {
      showToast('Could not generate PDF: ' + (err?.message || 'Unknown error'), 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const handleShareWhatsApp = () => {
    const msg = buildWhatsAppContractMessage({
      contract_number: contractNumber,
      business_name: businessName,
      contact_name: contactName,
      package: packageName,
      monthly_fee: parseNumericInput(monthlyFeeDisplay),
      start_date: startDate,
      term_type: termType,
      term_months: termType === 'fixed' ? Number(termMonths) || null : null,
    });
    const cleanDigits = clientPhone.replace(/\D/g, '');
    const waDigits =
      cleanDigits.length === 10
        ? `91${cleanDigits}`
        : cleanDigits.length >= 11
        ? cleanDigits
        : '';
    const url = waDigits
      ? `https://wa.me/${waDigits}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const logClientActivity = async (clientId: string | null, type: string, note: string) => {
    if (!clientId) return;
    try {
      await supabase.from('client_activities').insert({
        client_id: clientId,
        type,
        note,
      });
    } catch {
      // Best-effort timeline log
    }
  };

  const handleMarkAsSent = async () => {
    setBusyAction('sent');
    const nowIso = new Date().toISOString();
    const saved = await persistContract('Sent', { sent_at: nowIso });
    if (saved) {
      setStatus('Sent');
      setSentAt(nowIso);
      await logClientActivity(
        saved.client_id,
        'Contract Sent',
        `Service agreement ${saved.contract_number} marked as Sent`
      );
      showToast(`${saved.contract_number} marked as Sent`, 'success');
    }
    setBusyAction(null);
  };

  const handleConfirmSigned = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signDateInput) return;
    setBusyAction('signed');
    const saved = await persistContract('Signed', { signed_at: signDateInput });
    if (saved) {
      setStatus('Signed');
      setSignedAt(signDateInput);
      setSignModalOpen(false);
      await logClientActivity(
        saved.client_id,
        'Contract Signed',
        `Service agreement ${saved.contract_number} signed on ${formatDate(signDateInput)}`
      );
      showToast(`${saved.contract_number} marked as Signed`, 'success');
    }
    setBusyAction(null);
  };

  const handleConfirmTerminate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!terminateDateInput) return;
    setBusyAction('terminate');
    const saved = await persistContract('Terminated', { terminated_at: terminateDateInput });
    if (saved) {
      setStatus('Terminated');
      setTerminatedAt(terminateDateInput);
      setTerminateModalOpen(false);
      await logClientActivity(
        saved.client_id,
        'Contract Terminated',
        `Service agreement ${saved.contract_number} terminated on ${formatDate(terminateDateInput)}`
      );
      showToast(`${saved.contract_number} marked as Terminated`, 'info');
    }
    setBusyAction(null);
  };

  const handleDeleteContract = async () => {
    if (!currentContractId) {
      onBack();
      return;
    }
    setBusyAction('delete');
    const { error } = await supabase.from('contracts').delete().eq('id', currentContractId);
    setBusyAction(null);
    if (error) {
      showToast('Could not delete contract: ' + error.message, 'error');
      return;
    }
    showToast(`Deleted ${contractNumber}`, 'success');
    onContractSaved?.();
    onBack();
  };

  const handleResyncAllClauses = () => {
    const fresh = buildClausesForContract(buildCurrentContext());
    setClauses(fresh);
    showToast('All clauses refreshed from current contract details', 'success');
  };

  const handleResetSingleClause = (idx: number) => {
    const clause = clauses[idx];
    if (!clause) return;
    const tpls = getDefaultContractTemplates();
    const matched = tpls.find((t) => t.key === clause.key);
    if (!matched) return;
    const updatedBody = hydrateClauseBody(matched.body, buildCurrentContext());
    setClauses((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, title: matched.title, body: updatedBody } : c))
    );
    showToast(`Refreshed "${matched.title}" from current details`, 'info');
  };

  const handleAddDeliverable = () => {
    const trimmed = newDeliverable.trim();
    if (!trimmed) return;
    setDeliverables((prev) => [...prev, trimmed]);
    setNewDeliverable('');
  };

  const handlePackageSelect = (pkg: string) => {
    setPackageName(pkg);
    if (pkg in PACKAGE_DEFAULT_FEES) {
      const fee = PACKAGE_DEFAULT_FEES[pkg as PackageTier];
      if (fee > 0) setMonthlyFeeDisplay(formatINRInputDisplay(fee));
      const defs = PACKAGE_DELIVERABLE_DEFAULTS[pkg as PackageTier];
      if (defs && defs.length > 0) {
        setDeliverables([...defs]);
      }
    }
  };

  const toggleMobileSection = (key: MobileSectionKey) => {
    setMobileSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const inputClass = (hasError?: boolean) =>
    `w-full h-[42px] px-3.5 rounded-xl border text-sm lg:text-xs text-[#0A1F5C] placeholder:text-[#94A3B8] transition-colors focus:outline-none ${
      hasError
        ? 'border-rose-500 bg-white focus:ring-2 focus:ring-rose-500/20'
        : 'border-[#DCEBFF] bg-[#F8FAFF] focus:bg-white focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/15'
    }`;

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-[1200px] mx-auto space-y-4">
        <div className="bg-white rounded-2xl border border-[#DCEBFF] p-8 flex items-center justify-center gap-3 text-sm text-[#0A1F5C] font-semibold">
          <Loader2 className="w-5 h-5 animate-spin text-[#1D4ED8]" />
          <span>Loading contract editor...</span>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-6 lg:p-8 max-w-[900px] mx-auto space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-[#1D4ED8] bg-white px-3.5 py-2 rounded-xl border border-[#DCEBFF]"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Contracts</span>
        </button>
        <div className="bg-white rounded-2xl border border-rose-200 p-6 space-y-3">
          <div className="flex items-center gap-2 text-rose-700 font-bold text-sm">
            <AlertCircle className="w-4 h-4" />
            <span>Could not load contract</span>
          </div>
          <p className="text-xs text-slate-600">{loadError}</p>
          <button
            type="button"
            onClick={loadData}
            className="px-4 py-2 bg-[#1D4ED8] text-white rounded-xl text-xs font-semibold"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const enabledClauseCount = clauses.filter((c) => c.enabled).length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1280px] mx-auto pb-36 lg:pb-12 space-y-5">
      {/* Top Action Header */}
      <div className="bg-white rounded-2xl border border-[#DCEBFF] p-4 sm:p-5 shadow-2xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="p-2.5 rounded-xl bg-[#F8FAFF] hover:bg-[#F2F7FF] border border-[#DCEBFF] text-[#0A1F5C] shrink-0"
              title="Back to Contracts"
              aria-label="Back to Contracts"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-bold text-[#1D4ED8] bg-[#F2F7FF] border border-[#DCEBFF] px-2.5 py-0.5 rounded-md">
                  {contractNumber}
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded-full font-semibold border text-[11px] ${getContractStatusBadgeStyle(
                    effectiveStatus
                  )}`}
                >
                  {effectiveStatus}
                </span>
                {termType === 'fixed' && renewalDate && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
                    <Calendar className="w-3 h-3" />
                    Renews {formatDate(renewalDate)}
                  </span>
                )}
              </div>
              <h1 className="text-lg sm:text-xl font-bold text-[#0A1F5C] font-['Plus_Jakarta_Sans'] mt-1 truncate">
                {businessName.trim() || (isNewContract ? 'New Service Contract' : 'Service Contract')}
              </h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 mt-0.5">
                {signedAt && (
                  <span className="text-emerald-700 font-semibold">
                    Signed on {formatDate(signedAt)}
                  </span>
                )}
                {sentAt && status === 'Sent' && (
                  <span>Sent {formatDate(sentAt)}</span>
                )}
                {terminatedAt && status === 'Terminated' && (
                  <span className="text-rose-600 font-semibold">
                    Terminated {formatDate(terminatedAt)}
                  </span>
                )}
                {linkedClientId && onOpenClientProfile && (
                  <button
                    type="button"
                    onClick={() => onOpenClientProfile(linkedClientId)}
                    className="text-[#1D4ED8] hover:underline font-semibold"
                  >
                    Open Client Profile →
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Desktop Action Buttons */}
          <div className="hidden lg:flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setTemplatesOpen(true)}
              className="px-3 py-2 bg-white border border-[#DCEBFF] hover:bg-[#F2F7FF] text-[#0A1F5C] rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <FileText className="w-3.5 h-3.5 text-[#1D4ED8]" />
              <span>Templates</span>
            </button>

            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="px-3 py-2 bg-white border border-[#DCEBFF] hover:bg-[#F2F7FF] text-[#0A1F5C] rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <Settings className="w-3.5 h-3.5 text-[#1D4ED8]" />
              <span>Company Settings</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={busyAction === 'pdf'}
              className="px-3.5 py-2 bg-white border border-[#DCEBFF] hover:bg-[#F2F7FF] text-[#0A1F5C] rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
            >
              {busyAction === 'pdf' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#1D4ED8]" />
              ) : (
                <Download className="w-3.5 h-3.5 text-[#1D4ED8]" />
              )}
              <span>Download PDF</span>
            </button>

            <button
              type="button"
              onClick={handleShareWhatsApp}
              className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>Share on WhatsApp</span>
            </button>

            {status !== 'Signed' && status !== 'Terminated' && (
              <button
                type="button"
                onClick={handleMarkAsSent}
                disabled={saving || busyAction === 'sent'}
                className="px-3.5 py-2 bg-[#F2F7FF] hover:bg-blue-100 border border-[#BFDBFE] text-[#1D4ED8] rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Mark as Sent</span>
              </button>
            )}

            {status !== 'Signed' && status !== 'Terminated' && (
              <button
                type="button"
                onClick={() => {
                  setSignDateInput(signedAt || formatInputDate(new Date()));
                  setSignModalOpen(true);
                }}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Mark as Signed</span>
              </button>
            )}

            {status !== 'Terminated' && currentContractId && (
              <button
                type="button"
                onClick={() => {
                  setTerminateDateInput(formatInputDate(new Date()));
                  setTerminateModalOpen(true);
                }}
                className="px-3 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>Terminate</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleSaveDraftOrChanges}
              disabled={saving}
              className="px-4 py-2 bg-[#1D4ED8] hover:bg-blue-700 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              <span>{currentContractId ? 'Save Changes' : 'Save Contract'}</span>
            </button>
          </div>
        </div>

        {/* Inline Save Error */}
        {saveError && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start justify-between gap-3 text-xs text-rose-800">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{saveError}</span>
            </div>
            <button
              type="button"
              onClick={() => setSaveError(null)}
              className="text-rose-500 hover:text-rose-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Mobile Sticky Live Summary Pill */}
      <div className="lg:hidden sticky top-[57px] z-20 bg-white border border-[#DCEBFF] rounded-xl px-3.5 py-2.5 shadow-sm flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            First Month Total {totals.gstEnabled ? `(incl. ${totals.gstPercent}% GST)` : '(No GST)'}
          </p>
          <p className="text-sm font-bold text-[#0A1F5C] tabular-nums">
            {formatINR(totals.firstMonthTotal)}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Monthly Fee
          </p>
          <p className="text-xs font-bold text-[#1D4ED8] tabular-nums">
            {formatINR(totals.monthlyFee)}/mo
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT MAIN EDITOR COLUMN */}
        <div className="lg:col-span-8 space-y-5">
          {/* SECTION 0: CREATE SOURCE (From Scratch vs From Proposal) */}
          <section className="bg-white rounded-2xl border border-[#DCEBFF] shadow-2xs overflow-visible">
            <button
              type="button"
              onClick={() => toggleMobileSection('source')}
              className="w-full px-5 py-4 flex items-center justify-between text-left lg:cursor-default border-b border-[#E5ECF6]"
            >
              <div className="flex items-center gap-2">
                <FileSignature className="w-4 h-4 text-[#1D4ED8]" />
                <h2 className="text-xs font-bold text-[#0A1F5C] uppercase tracking-wider">
                  1. Source &amp; Client
                </h2>
              </div>
              <span className="lg:hidden text-slate-400">
                {mobileSections.source ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </span>
            </button>

            <div
              className={`p-5 space-y-4 ${
                mobileSections.source ? 'block' : 'hidden lg:block'
              }`}
            >
              {/* Mode selector: From scratch vs From proposal */}
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setCreateMode('scratch')}
                  className={`py-2.5 px-3 rounded-xl border text-xs font-semibold transition-all ${
                    createMode === 'scratch'
                      ? 'bg-[#1D4ED8] text-white border-[#1D4ED8] shadow-xs'
                      : 'bg-[#F8FAFF] text-[#0A1F5C] border-[#DCEBFF] hover:bg-white'
                  }`}
                >
                  From Scratch
                </button>
                <button
                  type="button"
                  onClick={() => setCreateMode('proposal')}
                  className={`py-2.5 px-3 rounded-xl border text-xs font-semibold transition-all ${
                    createMode === 'proposal'
                      ? 'bg-[#1D4ED8] text-white border-[#1D4ED8] shadow-xs'
                      : 'bg-[#F8FAFF] text-[#0A1F5C] border-[#DCEBFF] hover:bg-white'
                  }`}
                >
                  From Proposal
                </button>
              </div>

              {/* Proposal Picker when From Proposal is selected */}
              {createMode === 'proposal' && (
                <div className="space-y-1.5" ref={proposalPickerRef}>
                  <label className="block text-[11px] font-semibold text-[#0A1F5C] uppercase">
                    Import from Existing Proposal
                  </label>
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      type="text"
                      value={proposalSearch}
                      onFocus={() => setProposalPickerOpen(true)}
                      onChange={(e) => {
                        setProposalSearch(e.target.value);
                        setProposalPickerOpen(true);
                      }}
                      placeholder="Search proposal # or client name to auto-fill..."
                      className={`${inputClass()} pl-10`}
                    />
                    {proposalPickerOpen && (
                      <div className="absolute left-0 right-0 mt-1.5 bg-white border border-[#DCEBFF] rounded-xl shadow-xl z-30 max-h-60 overflow-y-auto divide-y divide-slate-100">
                        {filteredProposals.length === 0 ? (
                          <div className="p-3 text-xs text-slate-400 text-center">
                            No proposals match your search.
                          </div>
                        ) : (
                          filteredProposals.slice(0, 25).map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                applyProposalDraft(p, clients, contractNumber);
                                setProposalSearch(`${p.proposal_number} — ${p.business_name}`);
                                setProposalPickerOpen(false);
                                showToast(
                                  `Auto-filled contract from ${p.proposal_number}`,
                                  'success'
                                );
                              }}
                              className="w-full text-left px-3.5 py-2.5 hover:bg-[#F8FAFF] flex items-center justify-between gap-2"
                            >
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-[#0A1F5C] truncate">
                                  {p.proposal_number} · {p.business_name}
                                </div>
                                <div className="text-[11px] text-slate-500 truncate">
                                  {p.package || 'Growth'} • {formatINR(Number(p.monthly_fee) || 0)}
                                  /mo • {p.status || 'Draft'}
                                </div>
                              </div>
                              <span className="text-[11px] font-semibold text-[#1D4ED8] shrink-0">
                                Use
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Client Picker + Add New Client */}
              <div className="space-y-1.5" ref={clientPickerRef}>
                <div className="flex items-center justify-between gap-2">
                  <label className="block text-[11px] font-semibold text-[#0A1F5C] uppercase">
                    Select Existing Client (or add new)
                  </label>
                  <button
                    type="button"
                    onClick={() => setAddClientOpen(true)}
                    className="text-xs font-semibold text-[#1D4ED8] hover:underline inline-flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add New Client</span>
                  </button>
                </div>

                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    value={clientSearch}
                    onFocus={() => setClientPickerOpen(true)}
                    onChange={(e) => {
                      setClientSearch(e.target.value);
                      setClientPickerOpen(true);
                    }}
                    placeholder="Search clients by property or contact name..."
                    className={`${inputClass()} pl-10`}
                  />
                  {clientPickerOpen && (
                    <div className="absolute left-0 right-0 mt-1.5 bg-white border border-[#DCEBFF] rounded-xl shadow-xl z-30 max-h-60 overflow-y-auto divide-y divide-slate-100">
                      {filteredClients.length === 0 ? (
                        <div className="p-3 text-xs text-slate-500 text-center space-y-2">
                          <p>No matching clients found.</p>
                          <button
                            type="button"
                            onClick={() => {
                              setClientPickerOpen(false);
                              setAddClientOpen(true);
                            }}
                            className="px-3 py-1.5 bg-[#1D4ED8] text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add New Client</span>
                          </button>
                        </div>
                      ) : (
                        filteredClients.slice(0, 25).map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              applyClientToForm(c, createMode === 'scratch');
                              setClientSearch(c.business_name);
                              setClientPickerOpen(false);
                              showToast(`Selected ${c.business_name}`, 'info');
                            }}
                            className="w-full text-left px-3.5 py-2.5 hover:bg-[#F8FAFF] flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-[#0A1F5C] truncate">
                                {c.business_name}
                              </div>
                              <div className="text-[11px] text-slate-500 truncate">
                                {c.contact_name || c.contact_person || 'No contact'} •{' '}
                                {c.city || 'No city'} • {c.package || 'Growth'}
                              </div>
                            </div>
                            <span className="text-[11px] font-semibold text-[#1D4ED8] shrink-0">
                              Select
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 2: PARTIES & SIGNATORY DETAILS */}
          <section className="bg-white rounded-2xl border border-[#DCEBFF] shadow-2xs overflow-hidden">
            <button
              type="button"
              onClick={() => toggleMobileSection('parties')}
              className="w-full px-5 py-4 flex items-center justify-between text-left lg:cursor-default border-b border-[#E5ECF6]"
            >
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#1D4ED8]" />
                <h2 className="text-xs font-bold text-[#0A1F5C] uppercase tracking-wider">
                  2. Client &amp; Signatory Details
                </h2>
              </div>
              <span className="lg:hidden text-slate-400">
                {mobileSections.parties ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </span>
            </button>

            <div
              className={`p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 ${
                mobileSections.parties ? 'grid' : 'hidden lg:grid'
              }`}
            >
              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold text-[#0A1F5C]">
                  Client Business / Property Name <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => {
                    setBusinessName(e.target.value);
                    if (fieldErrors.businessName && e.target.value.trim()) {
                      setFieldErrors((p) => ({ ...p, businessName: undefined }));
                    }
                  }}
                  placeholder="The Oberoi Udaivilas"
                  className={inputClass(Boolean(fieldErrors.businessName))}
                />
                {fieldErrors.businessName && (
                  <p className="text-xs font-medium text-rose-600">{fieldErrors.businessName}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold text-[#0A1F5C]">
                  Signatory / Contact Name
                </label>
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Vikramaditya Singh"
                  className={inputClass()}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold text-[#0A1F5C]">
                  Signatory Designation
                </label>
                <input
                  type="text"
                  value={clientDesignation}
                  onChange={(e) => setClientDesignation(e.target.value)}
                  placeholder="Founder / General Manager"
                  className={inputClass()}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold text-[#0A1F5C]">
                  Business Type
                </label>
                <input
                  type="text"
                  value={businessType}
                  onChange={(e) => setBusinessType(e.target.value)}
                  placeholder="Luxury Hotel / Resort / Cafe"
                  className={inputClass()}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold text-[#0A1F5C]">
                  Client Phone / WhatsApp
                </label>
                <input
                  type="tel"
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className={inputClass()}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold text-[#0A1F5C]">
                  Client Email
                </label>
                <input
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  placeholder="gm@property.com"
                  className={inputClass()}
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label className="block text-[11px] font-semibold text-[#0A1F5C]">
                  City / Registered Address
                </label>
                <input
                  type="text"
                  value={clientAddress}
                  onChange={(e) => setClientAddress(e.target.value)}
                  placeholder="Mumbai, Maharashtra"
                  className={inputClass()}
                />
              </div>
            </div>
          </section>

          {/* SECTION 3: SCHEDULE, TERM, FEES & LEGAL TERMS */}
          <section className="bg-white rounded-2xl border border-[#DCEBFF] shadow-2xs overflow-hidden">
            <button
              type="button"
              onClick={() => toggleMobileSection('commercial')}
              className="w-full px-5 py-4 flex items-center justify-between text-left lg:cursor-default border-b border-[#E5ECF6]"
            >
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#1D4ED8]" />
                <h2 className="text-xs font-bold text-[#0A1F5C] uppercase tracking-wider">
                  3. Schedule, Fees &amp; Legal Terms
                </h2>
              </div>
              <span className="lg:hidden text-slate-400">
                {mobileSections.commercial ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </span>
            </button>

            <div
              className={`p-5 space-y-5 ${
                mobileSections.commercial ? 'block' : 'hidden lg:block'
              }`}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold text-[#0A1F5C]">
                    Contract Number
                  </label>
                  <input
                    type="text"
                    value={contractNumber}
                    onChange={(e) => setContractNumber(e.target.value)}
                    className={`${inputClass()} font-mono font-semibold`}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold text-[#0A1F5C]">
                    Contract Date
                  </label>
                  <input
                    type="date"
                    value={contractDate}
                    onChange={(e) => setContractDate(e.target.value)}
                    className={inputClass()}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold text-[#0A1F5C]">
                    Service Start Date <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      if (fieldErrors.startDate && e.target.value) {
                        setFieldErrors((p) => ({ ...p, startDate: undefined }));
                      }
                    }}
                    className={inputClass(Boolean(fieldErrors.startDate))}
                  />
                  {fieldErrors.startDate && (
                    <p className="text-xs font-medium text-rose-600">{fieldErrors.startDate}</p>
                  )}
                </div>
              </div>

              {/* Contract Term */}
              <div className="p-4 rounded-xl bg-[#F8FAFF] border border-[#DCEBFF] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-[11px] font-bold text-[#0A1F5C] uppercase tracking-wider">
                    Contract Term
                  </label>
                  <div className="inline-flex rounded-xl border border-[#DCEBFF] bg-white p-1">
                    <button
                      type="button"
                      onClick={() => {
                        setTermType('month-to-month');
                        setFieldErrors((p) => ({ ...p, termMonths: undefined }));
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        termType === 'month-to-month'
                          ? 'bg-[#1D4ED8] text-white'
                          : 'text-[#0A1F5C] hover:bg-[#F8FAFF]'
                      }`}
                    >
                      Month-to-month
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTermType('fixed');
                        setRenewalManuallyEdited(false);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        termType === 'fixed'
                          ? 'bg-[#1D4ED8] text-white'
                          : 'text-[#0A1F5C] hover:bg-[#F8FAFF]'
                      }`}
                    >
                      Fixed Months
                    </button>
                  </div>
                </div>

                {termType === 'fixed' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-semibold text-[#0A1F5C]">
                        Number of Months <span className="text-rose-600">*</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          max={60}
                          value={termMonths}
                          onChange={(e) => {
                            setTermMonths(e.target.value);
                            setRenewalManuallyEdited(false);
                            setFieldErrors((p) => ({ ...p, termMonths: undefined }));
                          }}
                          className={inputClass(Boolean(fieldErrors.termMonths))}
                        />
                        {[3, 6, 12].map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => {
                              setTermMonths(String(m));
                              setRenewalManuallyEdited(false);
                            }}
                            className={`px-2.5 py-2 rounded-lg text-xs font-semibold border shrink-0 ${
                              Number(termMonths) === m
                                ? 'bg-[#1D4ED8] text-white border-[#1D4ED8]'
                                : 'bg-white text-[#0A1F5C] border-[#DCEBFF]'
                            }`}
                          >
                            {m}m
                          </button>
                        ))}
                      </div>
                      {fieldErrors.termMonths && (
                        <p className="text-xs font-medium text-rose-600">
                          {fieldErrors.termMonths}
                        </p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-semibold text-[#0A1F5C]">
                        Renewal Date (Auto-computed, editable)
                      </label>
                      <input
                        type="date"
                        value={renewalDate}
                        onChange={(e) => {
                          setRenewalDate(e.target.value);
                          setRenewalManuallyEdited(true);
                        }}
                        className={inputClass()}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Package & Fees */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold text-[#0A1F5C]">
                    Package Name
                  </label>
                  <div className="flex flex-wrap gap-1.5 mb-1.5">
                    {PACKAGE_TIERS.map((tier) => (
                      <button
                        key={tier}
                        type="button"
                        onClick={() => handlePackageSelect(tier)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                          packageName === tier
                            ? 'bg-[#1D4ED8] text-white border-[#1D4ED8]'
                            : 'bg-[#F8FAFF] text-[#0A1F5C] border-[#DCEBFF] hover:bg-white'
                        }`}
                      >
                        {tier}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={packageName}
                    onChange={(e) => setPackageName(e.target.value)}
                    placeholder="Growth / Custom Retainer"
                    className={inputClass()}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold text-[#0A1F5C]">
                    Monthly Fee (₹) <span className="text-rose-600">*</span>
                  </label>
                  <div className="flex items-center rounded-xl border border-[#DCEBFF] bg-[#F8FAFF] focus-within:bg-white focus-within:border-[#1D4ED8] overflow-hidden h-[42px]">
                    <span className="px-3.5 h-full flex items-center bg-[#EEF2F8] border-r border-[#DCEBFF] text-[#0A1F5C] font-bold text-xs">
                      ₹
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={monthlyFeeDisplay}
                      onChange={(e) => {
                        setMonthlyFeeDisplay(formatINRInputDisplay(e.target.value));
                        if (fieldErrors.monthlyFee) {
                          setFieldErrors((p) => ({ ...p, monthlyFee: undefined }));
                        }
                      }}
                      placeholder="45,000"
                      className="w-full h-full px-3 bg-transparent text-sm lg:text-xs font-bold text-[#0A1F5C] tabular-nums focus:outline-none"
                    />
                  </div>
                  {fieldErrors.monthlyFee && (
                    <p className="text-xs font-medium text-rose-600">{fieldErrors.monthlyFee}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold text-[#0A1F5C]">
                    One-time Setup Fee (Optional, ₹)
                  </label>
                  <div className="flex items-center rounded-xl border border-[#DCEBFF] bg-[#F8FAFF] focus-within:bg-white focus-within:border-[#1D4ED8] overflow-hidden h-[42px]">
                    <span className="px-3.5 h-full flex items-center bg-[#EEF2F8] border-r border-[#DCEBFF] text-[#0A1F5C] font-bold text-xs">
                      ₹
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={setupFeeDisplay}
                      onChange={(e) => setSetupFeeDisplay(formatINRInputDisplay(e.target.value))}
                      placeholder="0"
                      className="w-full h-full px-3 bg-transparent text-sm lg:text-xs font-semibold text-[#0A1F5C] tabular-nums focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold text-[#0A1F5C]">
                    First-Month Discount (Optional, ₹)
                  </label>
                  <div className="flex items-center rounded-xl border border-[#DCEBFF] bg-[#F8FAFF] focus-within:bg-white focus-within:border-[#1D4ED8] overflow-hidden h-[42px]">
                    <span className="px-3.5 h-full flex items-center bg-[#EEF2F8] border-r border-[#DCEBFF] text-[#0A1F5C] font-bold text-xs">
                      ₹
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={discountDisplay}
                      onChange={(e) => setDiscountDisplay(formatINRInputDisplay(e.target.value))}
                      placeholder="0"
                      className="w-full h-full px-3 bg-transparent text-sm lg:text-xs font-semibold text-[#0A1F5C] tabular-nums focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* GST Toggle */}
              <div className="p-4 rounded-xl bg-[#F8FAFF] border border-[#DCEBFF] flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={gstEnabled}
                    onClick={() => setGstEnabled((g) => !g)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full border transition-colors ${
                      gstEnabled
                        ? 'bg-[#1D4ED8] border-[#1D4ED8]'
                        : 'bg-slate-200 border-slate-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        gstEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                  <div>
                    <p className="text-xs font-bold text-[#0A1F5C]">Apply GST</p>
                    <p className="text-[11px] text-slate-500">
                      Include GST in contract fee breakdown &amp; totals
                    </p>
                  </div>
                </div>

                {gstEnabled && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-[#0A1F5C]">GST %</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={gstPercent}
                      onChange={(e) => setGstPercent(e.target.value)}
                      className="w-20 h-[38px] px-3 rounded-xl border border-[#DCEBFF] bg-white text-xs font-bold text-[#0A1F5C] tabular-nums focus:outline-none focus:border-[#1D4ED8]"
                    />
                  </div>
                )}
              </div>

              {/* Payment Terms, Notice Period, Governing Law */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold text-[#0A1F5C]">
                    Notice Period (Days)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={180}
                    value={noticePeriodDays}
                    onChange={(e) => setNoticePeriodDays(e.target.value)}
                    className={inputClass()}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold text-[#0A1F5C]">
                    Governing Law &amp; Jurisdiction
                  </label>
                  <input
                    type="text"
                    value={governingLaw}
                    onChange={(e) => setGoverningLaw(e.target.value)}
                    className={inputClass()}
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-[#0A1F5C]">
                    Payment Terms
                  </label>
                  <textarea
                    rows={2}
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                    className="w-full p-3 rounded-xl border border-[#DCEBFF] bg-[#F8FAFF] focus:bg-white text-xs text-[#0A1F5C] focus:outline-none focus:border-[#1D4ED8]"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 4: DELIVERABLES */}
          <section className="bg-white rounded-2xl border border-[#DCEBFF] shadow-2xs overflow-hidden">
            <button
              type="button"
              onClick={() => toggleMobileSection('deliverables')}
              className="w-full px-5 py-4 flex items-center justify-between text-left lg:cursor-default border-b border-[#E5ECF6]"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#1D4ED8]" />
                <h2 className="text-xs font-bold text-[#0A1F5C] uppercase tracking-wider">
                  4. Deliverables ({deliverables.length})
                </h2>
              </div>
              <span className="lg:hidden text-slate-400">
                {mobileSections.deliverables ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </span>
            </button>

            <div
              className={`p-5 space-y-3 ${
                mobileSections.deliverables ? 'block' : 'hidden lg:block'
              }`}
            >
              <div className="space-y-2">
                {deliverables.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-[#F2F7FF] border border-[#DCEBFF] text-[#1D4ED8] text-[11px] font-bold flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <input
                      type="text"
                      value={item}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDeliverables((prev) => prev.map((d, i) => (i === idx ? val : d)));
                      }}
                      className={inputClass()}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setDeliverables((prev) => prev.filter((_, i) => i !== idx))
                      }
                      aria-label="Remove deliverable"
                      className="p-2 text-slate-400 hover:text-rose-600 rounded-lg shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-2">
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
                  placeholder="Add another deliverable..."
                  className={inputClass()}
                />
                <button
                  type="button"
                  onClick={handleAddDeliverable}
                  className="px-4 h-[42px] bg-[#1D4ED8] hover:bg-blue-700 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1 shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add</span>
                </button>
              </div>
            </div>
          </section>

          {/* SECTION 5: CLAUSE-BY-CLAUSE AGREEMENT */}
          <section className="bg-white rounded-2xl border border-[#DCEBFF] shadow-2xs overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E5ECF6] flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => toggleMobileSection('clauses')}
                className="flex items-center gap-2 text-left lg:cursor-default"
              >
                <FileText className="w-4 h-4 text-[#1D4ED8]" />
                <h2 className="text-xs font-bold text-[#0A1F5C] uppercase tracking-wider">
                  5. Contract Clauses ({enabledClauseCount}/{clauses.length} Active)
                </h2>
                <span className="lg:hidden text-slate-400 ml-1">
                  {mobileSections.clauses ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </span>
              </button>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTemplatesOpen(true)}
                  className="px-3 py-1.5 bg-[#F8FAFF] hover:bg-[#F2F7FF] border border-[#DCEBFF] text-[#0A1F5C] rounded-lg text-[11px] font-semibold"
                >
                  Edit Default Templates
                </button>
                <button
                  type="button"
                  onClick={handleResyncAllClauses}
                  className="px-3 py-1.5 bg-[#F2F7FF] hover:bg-blue-100 border border-[#BFDBFE] text-[#1D4ED8] rounded-lg text-[11px] font-semibold inline-flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Re-sync from Details</span>
                </button>
              </div>
            </div>

            <div
              className={`p-5 space-y-3 bg-[#F8FAFF] ${
                mobileSections.clauses ? 'block' : 'hidden lg:block'
              }`}
            >
              <p className="text-[11px] text-slate-500">
                Each contract stores its own copy of every clause. Edit any wording or toggle off clauses not needed for this client.
              </p>

              {clauses.map((clause, idx) => {
                const isExpanded = expandedClauseIds[clause.id] ?? true;
                return (
                  <div
                    key={clause.id}
                    className={`bg-white border rounded-2xl p-4 space-y-3 transition-opacity ${
                      clause.enabled
                        ? 'border-[#DCEBFF]'
                        : 'border-slate-200 opacity-70'
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
                          onChange={(e) => {
                            const val = e.target.value;
                            setClauses((prev) =>
                              prev.map((c, i) => (i === idx ? { ...c, title: val } : c))
                            );
                          }}
                          className="flex-1 min-w-0 h-[36px] px-3 rounded-lg border border-[#DCEBFF] bg-[#F8FAFF] focus:bg-white text-xs font-bold text-[#0A1F5C] focus:outline-none focus:border-[#1D4ED8]"
                        />
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleResetSingleClause(idx)}
                          title="Refresh this clause text from current contract details"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-[#1D4ED8] hover:bg-[#F2F7FF]"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          role="switch"
                          aria-checked={clause.enabled}
                          onClick={() =>
                            setClauses((prev) =>
                              prev.map((c, i) =>
                                i === idx ? { ...c, enabled: !c.enabled } : c
                              )
                            )
                          }
                          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#0A1F5C]"
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
                          <span>{clause.enabled ? 'On' : 'Off'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setExpandedClauseIds((prev) => ({
                              ...prev,
                              [clause.id]: !isExpanded,
                            }))
                          }
                          className="p-1.5 rounded-lg text-slate-400 hover:text-[#0A1F5C]"
                        >
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <textarea
                        rows={clause.key === 'scope' ? 5 : 3}
                        value={clause.body}
                        onChange={(e) => {
                          const val = e.target.value;
                          setClauses((prev) =>
                            prev.map((c, i) => (i === idx ? { ...c, body: val } : c))
                          );
                        }}
                        className="w-full p-3 rounded-xl border border-[#DCEBFF] bg-[#F8FAFF] focus:bg-white text-xs text-slate-700 leading-relaxed focus:outline-none focus:border-[#1D4ED8]"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Private Notes */}
          <section className="bg-white rounded-2xl border border-[#DCEBFF] p-5 space-y-2 shadow-2xs">
            <label className="block text-xs font-bold text-[#0A1F5C] uppercase tracking-wider">
              Internal CRM Notes (Not shown on Contract PDF)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal remarks, negotiation notes, or special approval notes..."
              className="w-full p-3 rounded-xl border border-[#DCEBFF] bg-[#F8FAFF] focus:bg-white text-xs text-[#0A1F5C] focus:outline-none focus:border-[#1D4ED8]"
            />
          </section>
        </div>

        {/* RIGHT STICKY SUMMARY SIDEBAR */}
        <aside className="lg:col-span-4 space-y-5 lg:sticky lg:top-6">
          <div className="bg-white rounded-2xl border border-[#DCEBFF] p-5 space-y-4 shadow-2xs">
            <div className="flex items-center justify-between border-b border-[#E5ECF6] pb-3">
              <h3 className="text-xs font-bold text-[#0A1F5C] uppercase tracking-wider">
                Commercial Summary
              </h3>
              <span className="font-mono text-xs font-bold text-[#1D4ED8]">
                {contractNumber}
              </span>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Client</span>
                <span className="font-bold text-[#0A1F5C] text-right truncate max-w-[180px]">
                  {businessName || 'Not set'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Package</span>
                <span className="font-semibold text-[#1D4ED8]">{packageName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Start Date</span>
                <span className="font-semibold text-[#0A1F5C]">{formatDate(startDate)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Term</span>
                <span className="font-semibold text-[#0A1F5C]">
                  {termType === 'fixed'
                    ? `${termMonths || 6} months`
                    : 'Month-to-month'}
                </span>
              </div>
              {termType === 'fixed' && renewalDate && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Renewal Date</span>
                  <span className="font-bold text-amber-700">{formatDate(renewalDate)}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Notice Period</span>
                <span className="font-semibold text-[#0A1F5C]">
                  {noticePeriodDays || DEFAULT_NOTICE_PERIOD_DAYS} days
                </span>
              </div>
            </div>

            <div className="border-t border-[#E5ECF6] pt-3 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Monthly Fee</span>
                <span className="font-semibold text-[#0A1F5C] tabular-nums">
                  {formatINR(totals.monthlyFee)}
                </span>
              </div>
              {totals.setupFee > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">One-time Setup Fee</span>
                  <span className="font-semibold text-[#0A1F5C] tabular-nums">
                    {formatINR(totals.setupFee)}
                  </span>
                </div>
              )}
              {totals.discount > 0 && (
                <div className="flex items-center justify-between text-emerald-700">
                  <span>First-Month Discount</span>
                  <span className="font-semibold tabular-nums">
                    -{formatINR(totals.discount)}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <span className="font-semibold text-[#0A1F5C]">Subtotal</span>
                <span className="font-bold text-[#0A1F5C] tabular-nums">
                  {formatINR(totals.subtotal)}
                </span>
              </div>
              {totals.gstEnabled && (
                <div className="flex items-center justify-between text-slate-600">
                  <span>GST ({totals.gstPercent}%)</span>
                  <span className="font-semibold tabular-nums">
                    {formatINR(totals.gstAmount)}
                  </span>
                </div>
              )}
              <div className="p-3 rounded-xl bg-[#0A1F5C] text-white flex items-center justify-between mt-2">
                <span className="text-xs font-semibold">First Month Total</span>
                <span className="text-base font-bold tabular-nums">
                  {formatINR(totals.firstMonthTotal)}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                <span>Ongoing Monthly Total</span>
                <span className="font-semibold text-[#0A1F5C] tabular-nums">
                  {formatINR(totals.recurringMonthlyTotal)}/mo
                </span>
              </div>
            </div>

            {/* Mobile Status Actions inside Card */}
            <div className="lg:hidden grid grid-cols-2 gap-2 pt-2 border-t border-[#E5ECF6]">
              {status !== 'Signed' && status !== 'Terminated' && (
                <button
                  type="button"
                  onClick={() => {
                    setSignDateInput(signedAt || formatInputDate(new Date()));
                    setSignModalOpen(true);
                  }}
                  className="col-span-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Mark as Signed</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setTemplatesOpen(true)}
                className="py-2 bg-[#F8FAFF] border border-[#DCEBFF] text-[#0A1F5C] rounded-xl text-xs font-semibold"
              >
                Templates
              </button>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="py-2 bg-[#F8FAFF] border border-[#DCEBFF] text-[#0A1F5C] rounded-xl text-xs font-semibold"
              >
                Settings
              </button>
            </div>

            {currentContractId && (
              <div className="pt-2 border-t border-[#E5ECF6] flex items-center justify-between gap-2">
                {status !== 'Terminated' && (
                  <button
                    type="button"
                    onClick={() => {
                      setTerminateDateInput(formatInputDate(new Date()));
                      setTerminateModalOpen(true);
                    }}
                    className="lg:hidden text-xs font-semibold text-rose-600 hover:underline"
                  >
                    Mark as Terminated
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDeleteConfirmOpen(true)}
                  className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-700"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Contract</span>
                </button>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* MOBILE STICKY BOTTOM ACTION BAR */}
      <div className="lg:hidden fixed bottom-16 left-0 right-0 z-30 bg-white border-t border-[#DCEBFF] px-3 py-2.5 shadow-lg">
        <div className="grid grid-cols-4 gap-1.5 max-w-[600px] mx-auto">
          <button
            type="button"
            onClick={handleSaveDraftOrChanges}
            disabled={saving}
            className="py-2.5 px-2 bg-[#1D4ED8] hover:bg-blue-700 text-white rounded-xl text-[11px] font-semibold flex flex-col items-center justify-center gap-0.5 disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            <span>Save</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={busyAction === 'pdf'}
            className="py-2.5 px-2 bg-[#F8FAFF] border border-[#DCEBFF] text-[#0A1F5C] rounded-xl text-[11px] font-semibold flex flex-col items-center justify-center gap-0.5 disabled:opacity-60"
          >
            {busyAction === 'pdf' ? (
              <Loader2 className="w-4 h-4 animate-spin text-[#1D4ED8]" />
            ) : (
              <Download className="w-4 h-4 text-[#1D4ED8]" />
            )}
            <span>PDF</span>
          </button>

          <button
            type="button"
            onClick={handleShareWhatsApp}
            className="py-2.5 px-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-[11px] font-semibold flex flex-col items-center justify-center gap-0.5"
          >
            <MessageCircle className="w-4 h-4" />
            <span>WhatsApp</span>
          </button>

          <button
            type="button"
            onClick={handleMarkAsSent}
            disabled={saving || busyAction === 'sent' || status === 'Signed' || status === 'Terminated'}
            className="py-2.5 px-2 bg-[#F2F7FF] border border-[#BFDBFE] text-[#1D4ED8] rounded-xl text-[11px] font-semibold flex flex-col items-center justify-center gap-0.5 disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            <span>{status === 'Signed' ? 'Signed' : 'Mark Sent'}</span>
          </button>
        </div>
      </div>

      {/* Add New Client Modal (Inline creation from Contract screen) */}
      <AddClientModal
        isOpen={addClientOpen}
        onClose={() => setAddClientOpen(false)}
        onClientCreated={(created) => {
          setClients((prev) => [created, ...prev]);
          applyClientToForm(created, createMode === 'scratch');
          setClientSearch(created.business_name);
        }}
      />

      {/* Contract Templates & Company Settings Modals */}
      <ContractTemplatesModal isOpen={templatesOpen} onClose={() => setTemplatesOpen(false)} />
      <CompanySettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Mark as Signed Modal */}
      {signModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
          onClick={() => setSignModalOpen(false)}
        >
          <div
            className="bg-white w-full max-w-md rounded-2xl border border-[#DCEBFF] shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#E5ECF6] pb-3">
              <div>
                <h3 className="text-base font-bold text-[#0A1F5C]">Mark Contract as Signed</h3>
                <p className="text-xs text-slate-500">{contractNumber}</p>
              </div>
              <button
                type="button"
                onClick={() => setSignModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleConfirmSigned} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#0A1F5C]">
                  Signed Date *
                </label>
                <input
                  type="date"
                  required
                  value={signDateInput}
                  onChange={(e) => setSignDateInput(e.target.value)}
                  className={inputClass()}
                />
              </div>
              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setSignModalOpen(false)}
                  className="px-4 py-2 bg-white border border-[#DCEBFF] text-[#0A1F5C] rounded-xl text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busyAction === 'signed'}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold"
                >
                  {busyAction === 'signed' ? 'Saving...' : 'Confirm Signed'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Terminate Contract Modal */}
      {terminateModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
          onClick={() => setTerminateModalOpen(false)}
        >
          <div
            className="bg-white w-full max-w-md rounded-2xl border border-[#DCEBFF] shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#E5ECF6] pb-3">
              <div>
                <h3 className="text-base font-bold text-[#0A1F5C]">Terminate Contract</h3>
                <p className="text-xs text-slate-500">{contractNumber}</p>
              </div>
              <button
                type="button"
                onClick={() => setTerminateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleConfirmTerminate} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#0A1F5C]">
                  Termination Date *
                </label>
                <input
                  type="date"
                  required
                  value={terminateDateInput}
                  onChange={(e) => setTerminateDateInput(e.target.value)}
                  className={inputClass()}
                />
              </div>
              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setTerminateModalOpen(false)}
                  className="px-4 py-2 bg-white border border-[#DCEBFF] text-[#0A1F5C] rounded-xl text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busyAction === 'terminate'}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold"
                >
                  {busyAction === 'terminate' ? 'Saving...' : 'Confirm Termination'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteConfirmOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
          onClick={() => setDeleteConfirmOpen(false)}
        >
          <div
            className="bg-white w-full max-w-md rounded-2xl border border-[#DCEBFF] shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-[#0A1F5C]">Delete {contractNumber}?</h3>
            <p className="text-xs text-slate-600">
              This will permanently remove this contract record from HotelStory CRM.
            </p>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(false)}
                className="px-4 py-2 bg-white border border-[#DCEBFF] text-[#0A1F5C] rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteContract}
                disabled={busyAction === 'delete'}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold"
              >
                {busyAction === 'delete' ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
