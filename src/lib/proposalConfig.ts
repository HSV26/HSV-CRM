import { supabase } from './supabase';
import { formatDate, formatINR, formatInputDate } from './utils';

/**
 * Editable agency contact, GSTIN, and payment details displayed in proposals.
 */
export interface CompanySettings {
  agencyName: string;
  tagline: string;
  preparedByName: string;
  preparedByRole: string;
  phone: string;
  whatsapp: string;
  email: string;
  website: string;
  location: string;
  gstin: string;
  upiId: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  ifsc: string;
}

export const PROPOSAL_AGENCY_SETTINGS: CompanySettings = {
  agencyName: 'HotelStory',
  tagline: 'Hospitality Social Media Marketing Agency',
  preparedByName: 'Sarvesh Lotankar',
  preparedByRole: 'Founder & Brand Strategist',
  phone: '+91 81044 68397',
  whatsapp: '+91 81044 68397',
  email: 'hotelstoryindia@gmail.com',
  website: '',
  location: 'India',
  gstin: '',
  upiId: '',
  bankName: '',
  accountName: '',
  accountNumber: '',
  ifsc: '',
};

const COMPANY_SETTINGS_STORAGE_KEY = 'hotelstory_company_settings_v1';
export const COMPANY_SETTINGS_EVENT = 'hotelstory:company-settings-updated';

function sanitizeLegacyAgencyValues(settings: CompanySettings): CompanySettings {
  const cleanEmail =
    (settings.email || '').trim().toLowerCase() === 'hello@hotelstory.in'
      ? 'hotelstoryindia@gmail.com'
      : (settings.email || '').trim();
  const cleanWebsite =
    (settings.website || '')
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/+$/, '') === 'hotelstory.in'
      ? ''
      : (settings.website || '').trim();

  return {
    ...settings,
    email: cleanEmail,
    website: cleanWebsite,
  };
}

export function getCompanySettings(): CompanySettings {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(COMPANY_SETTINGS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return sanitizeLegacyAgencyValues({
            ...PROPOSAL_AGENCY_SETTINGS,
            ...parsed,
          });
        }
      }
    }
  } catch {
    // Ignore storage read errors
  }
  return { ...PROPOSAL_AGENCY_SETTINGS };
}

export function saveCompanySettings(next: Partial<CompanySettings>): CompanySettings {
  const current = getCompanySettings();
  const merged: CompanySettings = sanitizeLegacyAgencyValues({
    ...current,
    ...next,
    agencyName: (next.agencyName ?? current.agencyName).trim() || PROPOSAL_AGENCY_SETTINGS.agencyName,
    tagline: (next.tagline ?? current.tagline).trim() || PROPOSAL_AGENCY_SETTINGS.tagline,
    preparedByName:
      (next.preparedByName ?? current.preparedByName).trim() || PROPOSAL_AGENCY_SETTINGS.preparedByName,
    preparedByRole:
      (next.preparedByRole ?? current.preparedByRole).trim() || PROPOSAL_AGENCY_SETTINGS.preparedByRole,
    phone: (next.phone ?? current.phone).trim() || PROPOSAL_AGENCY_SETTINGS.phone,
    whatsapp: (next.whatsapp ?? current.whatsapp).trim() || (next.phone ?? current.phone).trim() || PROPOSAL_AGENCY_SETTINGS.whatsapp,
    email: (next.email ?? current.email).trim(),
    website: (next.website ?? current.website).trim(),
    gstin: (next.gstin ?? current.gstin).trim().toUpperCase(),
    upiId: (next.upiId ?? current.upiId).trim(),
    bankName: (next.bankName ?? current.bankName).trim(),
    accountName: (next.accountName ?? current.accountName).trim(),
    accountNumber: (next.accountNumber ?? current.accountNumber).trim(),
    ifsc: (next.ifsc ?? current.ifsc).trim().toUpperCase(),
  });

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(COMPANY_SETTINGS_STORAGE_KEY, JSON.stringify(merged));
      window.dispatchEvent(new CustomEvent(COMPANY_SETTINGS_EVENT, { detail: merged }));
    }
  } catch {
    // Ignore storage write errors
  }
  return merged;
}

export function getAgencyContactSummary(settings?: CompanySettings): {
  phone: string;
  whatsapp: string;
  email: string;
  website: string;
  gstin: string;
} {
  const s = sanitizeLegacyAgencyValues(settings || getCompanySettings());
  const phone = (s.phone || '').trim() || '+91 81044 68397';
  const whatsapp = (s.whatsapp || '').trim() || phone;
  const email = (s.email || '').trim();
  const website = (s.website || '').trim();
  const gstin = (s.gstin || '').trim();
  return { phone, whatsapp, email, website, gstin };
}

export function getPaymentDetailEntries(
  settings?: CompanySettings
): Array<{ label: string; value: string }> {
  const s = settings || getCompanySettings();
  const raw: Array<{ label: string; value: string }> = [
    { label: 'UPI ID', value: (s.upiId || '').trim() },
    { label: 'Bank Name', value: (s.bankName || '').trim() },
    { label: 'Account Name', value: (s.accountName || '').trim() },
    { label: 'Account Number', value: (s.accountNumber || '').trim() },
    { label: 'IFSC Code', value: (s.ifsc || '').trim() },
  ];
  return raw.filter((item) => item.value.length > 0);
}

export function formatProperCaseName(input: string | null | undefined): string {
  const raw = (input || '').trim().replace(/\s+/g, ' ');
  if (!raw) return '';

  return raw
    .split(' ')
    .map((word) => {
      if (!word) return '';
      // Keep short uppercase acronyms (e.g. JW, ITC, BBQ, UK) intact
      if (word.length <= 3 && /^[A-Z0-9]+$/.test(word)) {
        return word;
      }
      // Handle hyphenated or apostrophe segments (e.g. o'connor, hotel-spa)
      return word
        .split(/([-'])/)
        .map((part) => {
          if (part === '-' || part === "'" || part.length === 0) return part;
          if (/^[^a-zA-Z0-9\u00C0-\u024F]/.test(part)) return part;
          return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
        })
        .join('');
    })
    .join(' ');
}

export type PackageTier = 'Starter' | 'Growth' | 'Dominator' | 'Custom';

export const PACKAGE_TIERS: PackageTier[] = ['Starter', 'Growth', 'Dominator', 'Custom'];

export const PACKAGE_DEFAULT_FEES: Record<PackageTier, number> = {
  Starter: 25000,
  Growth: 45000,
  Dominator: 75000,
  Custom: 0,
};

export function getPackageDefaultFeeAmount(pkg: string | null | undefined): number {
  const key = (pkg || '').trim() as PackageTier;
  return PACKAGE_DEFAULT_FEES[key] ?? 0;
}

export const PACKAGE_DELIVERABLE_DEFAULTS: Record<PackageTier, string[]> = {
  Starter: [
    '8 feed posts per month',
    '4 reels per month',
    '12 stories per month',
    'Content calendar',
    'Monthly performance summary',
  ],
  Growth: [
    '12 feed posts per month',
    '8 reels per month',
    '20 stories per month',
    'Content calendar',
    'Instagram and Facebook management',
    'Google Business Profile review',
    'Monthly performance report',
  ],
  Dominator: [
    '16 feed posts per month',
    '12 reels per month',
    '30 stories per month',
    'Content calendar',
    'Instagram, Facebook and YouTube Shorts',
    'Creator collaboration coordination',
    'Google Business Profile optimisation',
    'Monthly strategy call and report',
  ],
  Custom: [],
};

export const PROPOSAL_STATUSES = [
  'Draft',
  'Sent',
  'Viewed',
  'Accepted',
  'Declined',
  'Expired',
] as const;

export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const DEFAULT_PAYMENT_TERMS =
  'First month payable in advance. Following months payable on or before the 5th of each month.';

export const DEFAULT_TERMS_TEXT = [
  'This is a month-to-month engagement with no long-term lock-in.',
  "Either side may discontinue the engagement by giving 15 days' written notice.",
  'All content calendars, posts, and reels are shared for client approval before posting.',
  'The client will provide timely social account access, brand assets, and property/menu updates.',
  'Social media reach, engagement, and booking outcomes depend on consistency and market conditions and are not guaranteed.',
].join('\n');

export const NOT_INCLUDED_TEXT =
  'Paid ads and ad spend, and extra photo or video shoots, unless agreed in writing.';

export function formatLocalDateInput(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getProposalBaseDateInput(createdAt?: string | null): string {
  if (createdAt) {
    const parsed = new Date(createdAt);
    if (!isNaN(parsed.getTime())) {
      return formatLocalDateInput(parsed);
    }
  }
  return formatLocalDateInput(new Date());
}

export function addDaysToDateInput(
  baseDate: string | Date | null | undefined,
  days: number
): string {
  let d: Date;
  if (baseDate instanceof Date) {
    d = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  } else if (typeof baseDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(baseDate.trim())) {
    const [y, m, day] = baseDate.trim().split('-').map(Number);
    d = new Date(y, m - 1, day);
  } else if (baseDate) {
    const parsed = new Date(baseDate);
    d = isNaN(parsed.getTime())
      ? new Date()
      : new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  } else {
    const now = new Date();
    d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  d.setDate(d.getDate() + days);
  return formatLocalDateInput(d);
}

/**
 * Default validity is 7 days from the proposal date.
 */
export function getDefaultValidUntilDate(baseDate?: string | Date | null): string {
  return addDaysToDateInput(baseDate, 7);
}

/**
 * Default Proposed Start is 3 days after Valid Until (10 days after proposal date if Valid Until not passed).
 */
export function getDefaultStartDate(
  baseDate?: string | Date | null,
  validUntil?: string | null
): string {
  if (validUntil && /^\d{4}-\d{2}-\d{2}$/.test(validUntil.trim())) {
    return addDaysToDateInput(validUntil.trim(), 3);
  }
  const defaultValid = getDefaultValidUntilDate(baseDate);
  return addDaysToDateInput(defaultValid, 3);
}

export function resolveProposalDates(
  startDate?: string | null,
  validUntil?: string | null,
  createdAt?: string | null
): { proposalDate: string; validUntil: string; startDate: string } {
  const proposalDate = getProposalBaseDateInput(createdAt);

  const normalizeInput = (raw: string | null | undefined): string => {
    const t = (raw || '').trim();
    if (!t) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
    const p = new Date(t);
    return isNaN(p.getTime()) ? '' : formatLocalDateInput(p);
  };

  let resolvedValidUntil = normalizeInput(validUntil);
  if (!resolvedValidUntil) {
    resolvedValidUntil = getDefaultValidUntilDate(proposalDate);
  } else if (resolvedValidUntil < proposalDate) {
    resolvedValidUntil = proposalDate;
  }

  let resolvedStartDate = normalizeInput(startDate);
  if (!resolvedStartDate || resolvedStartDate <= resolvedValidUntil) {
    resolvedStartDate = addDaysToDateInput(resolvedValidUntil, 3);
  }

  return {
    proposalDate,
    validUntil: resolvedValidUntil,
    startDate: resolvedStartDate,
  };
}

export function resolveValidStartDate(
  startDate?: string | null,
  createdAt?: string | null,
  validUntil?: string | null
): string {
  return resolveProposalDates(startDate, validUntil, createdAt).startDate;
}

export function buildDefaultIntroText(
  businessName?: string | null,
  businessType?: string | null,
  city?: string | null,
  contactName?: string | null
): string {
  const cleanName = formatProperCaseName(businessName);
  const cleanType = (businessType || '').trim();
  const cleanCity = formatProperCaseName(city);
  const cleanContact = formatProperCaseName(contactName);

  const clientGreetingName = cleanContact || cleanName;
  const greeting = clientGreetingName ? `Dear ${clientGreetingName},` : 'Dear Client,';
  const propertyPhrase = cleanName
    ? cleanType
      ? `${cleanName} (${cleanType})`
      : cleanName
    : cleanType
    ? `your ${cleanType.toLowerCase()}`
    : 'your hospitality property';
  const locationPhrase = cleanCity ? ` in ${cleanCity}` : '';

  return `${greeting}\n\nThank you for speaking with us about ${propertyPhrase}${locationPhrase}. This proposal outlines a clear, practical monthly social media plan tailored to showcase your property's atmosphere, dining, and guest experience consistently.`;
}

export function normalizeIntroParagraphs(text: string): string[] {
  const normalized = (text || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  return normalized
    .split(/\n\s*\n+/)
    .map((para) => para.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

export function normalizeTermsLines(termsText: string): string[] {
  const rawLines = (termsText || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim().replace(/^[•\-*]\s*/, '').trim())
    .filter(Boolean);

  if (rawLines.length === 0) return [];

  const merged: string[] = [];
  for (const line of rawLines) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      !/[.!?:;]$/.test(prev) &&
      /^[a-z0-9,(]/.test(line)
    ) {
      merged[merged.length - 1] = `${prev} ${line}`;
    } else {
      merged.push(line);
    }
  }
  return merged;
}

export function parseNumericInput(raw: string | number | null | undefined): number {
  if (raw === null || raw === undefined || raw === '') return 0;
  if (typeof raw === 'number') return Number.isFinite(raw) ? Math.max(0, raw) : 0;
  const digits = String(raw).replace(/[^\d.]/g, '');
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function formatINRInputDisplay(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined || raw === '') return '';
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return '';
  return new Intl.NumberFormat('en-IN').format(Number(digits));
}

export function normalizeDeliverables(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return val
    .map((item) => (typeof item === 'string' ? item : item == null ? '' : String(item)))
    .filter((item) => item.trim().length > 0);
}

export interface ProposalCalculation {
  monthlyFee: number;
  setupFee: number;
  discount: number;
  subtotal: number;
  gstEnabled: boolean;
  gstPercent: number;
  gstAmount: number;
  firstMonthTotal: number;
  recurringSubtotal: number;
  recurringGst: number;
  recurringMonthlyTotal: number;
}

export function calculateProposalTotals(input: {
  monthly_fee?: number | string | null;
  setup_fee?: number | string | null;
  discount?: number | string | null;
  gst_enabled?: boolean | null;
  gst_percent?: number | string | null;
}): ProposalCalculation {
  const monthlyFee = parseNumericInput(input.monthly_fee);
  const setupFee = parseNumericInput(input.setup_fee);
  const discount = parseNumericInput(input.discount);
  const rawSubtotal = monthlyFee + setupFee - discount;
  const subtotal = Math.max(0, rawSubtotal);
  const gstEnabled = input.gst_enabled ?? true;
  const gstPercent =
    input.gst_percent === null || input.gst_percent === undefined || input.gst_percent === ''
      ? 18
      : Math.max(0, Math.min(100, Number(input.gst_percent) || 0));
  const gstAmount = gstEnabled ? Math.round((subtotal * gstPercent) / 100) : 0;
  const firstMonthTotal = subtotal + gstAmount;

  const recurringSubtotal = monthlyFee;
  const recurringGst = gstEnabled ? Math.round((recurringSubtotal * gstPercent) / 100) : 0;
  const recurringMonthlyTotal = recurringSubtotal + recurringGst;

  return {
    monthlyFee,
    setupFee,
    discount,
    subtotal,
    gstEnabled,
    gstPercent,
    gstAmount,
    firstMonthTotal,
    recurringSubtotal,
    recurringGst,
    recurringMonthlyTotal,
  };
}

export function getEffectiveProposalStatus(proposal: {
  status?: string | null;
  valid_until?: string | null;
}): string {
  const baseStatus = (proposal.status || 'Draft').trim() || 'Draft';
  const todayStr = new Date().toISOString().split('T')[0];
  if (
    proposal.valid_until &&
    proposal.valid_until < todayStr &&
    (baseStatus === 'Draft' || baseStatus === 'Sent' || baseStatus === 'Viewed')
  ) {
    return 'Expired';
  }
  return baseStatus;
}

export function getProposalStatusBadgeStyle(status: string | null | undefined): string {
  switch ((status || 'Draft').toLowerCase()) {
    case 'accepted':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'sent':
      return 'bg-blue-50 text-[#1D4ED8] border-[#BFDBFE]';
    case 'viewed':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'declined':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'expired':
      return 'bg-slate-100 text-slate-600 border-slate-300';
    default:
      return 'bg-[#F8FAFF] text-[#0A1F5C] border-[#DCEBFF]';
  }
}

export function generateNextProposalNumberFromList(
  existingNumbers: Array<string | null | undefined>,
  year: number = new Date().getFullYear()
): string {
  const prefix = `HS-${year}-`;
  let maxSeq = 0;
  for (const num of existingNumbers) {
    if (!num || typeof num !== 'string') continue;
    const trimmed = num.trim();
    if (!trimmed.startsWith(prefix)) continue;
    const suffix = trimmed.slice(prefix.length);
    if (/^\d+$/.test(suffix)) {
      const parsed = Number(suffix);
      if (parsed > maxSeq) maxSeq = parsed;
    }
  }
  return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
}

export async function fetchNextProposalNumber(): Promise<string> {
  const year = new Date().getFullYear();
  try {
    const { data, error } = await supabase
      .from('proposals')
      .select('proposal_number')
      .ilike('proposal_number', `HS-${year}-%`);
    if (error || !data) {
      return `HS-${year}-001`;
    }
    return generateNextProposalNumberFromList(
      data.map((r: any) => r.proposal_number),
      year
    );
  } catch {
    return `HS-${year}-001`;
  }
}

export function buildWhatsAppProposalMessage(proposal: {
  business_name?: string | null;
  contact_name?: string | null;
  package?: string | null;
  monthly_fee?: number | string | null;
  valid_until?: string | null;
  proposal_number?: string | null;
}): string {
  const settings = getCompanySettings();
  const contact = formatProperCaseName(proposal.contact_name);
  const business = formatProperCaseName(proposal.business_name) || 'your property';
  const pkg = (proposal.package || 'Growth').trim();
  const monthly = parseNumericInput(proposal.monthly_fee);
  const feeText = monthly > 0 ? `${formatINR(monthly)}/month` : 'as shared in the proposal';
  const validText = proposal.valid_until ? formatDate(proposal.valid_until) : '7 days from today';

  return [
    `Dear ${contact || business},`,
    '',
    `Sharing the ${settings.agencyName} social media proposal${proposal.proposal_number ? ` (${proposal.proposal_number})` : ''} for ${business}.`,
    `Package: ${pkg}`,
    `Monthly investment: ${feeText}`,
    `Valid until: ${validText}`,
    '',
    `Let me know once you have had a chance to go through it — happy to walk you through any questions.`,
  ].join('\n');
}

export function buildEmailProposalText(proposal: {
  business_name?: string | null;
  contact_name?: string | null;
  package?: string | null;
  monthly_fee?: number | string | null;
  valid_until?: string | null;
  proposal_number?: string | null;
}): string {
  const settings = getCompanySettings();
  const { phone, email, website } = getAgencyContactSummary(settings);
  const contact = formatProperCaseName(proposal.contact_name);
  const business = formatProperCaseName(proposal.business_name) || 'your property';
  const pkg = (proposal.package || 'Growth').trim();
  const monthly = parseNumericInput(proposal.monthly_fee);
  const feeText = monthly > 0 ? `${formatINR(monthly)} per month` : 'detailed inside the attached PDF';
  const validText = proposal.valid_until ? formatDate(proposal.valid_until) : '7 days';
  const signatureContactLine = [phone, email, website].filter(Boolean).join(' | ');

  return [
    `Subject: Social Media Marketing Proposal for ${business}${proposal.proposal_number ? ` (${proposal.proposal_number})` : ''}`,
    '',
    `Dear ${contact || business},`,
    '',
    `Please find attached our ${pkg} social media marketing proposal for ${business}.`,
    '',
    `Summary:`,
    `- Package: ${pkg}`,
    `- Monthly fee: ${feeText}`,
    `- Valid until: ${validText}`,
    '',
    `Please let me know if you would like to adjust any deliverables or schedule a quick call to discuss next steps.`,
    '',
    `Warm regards,`,
    `${settings.preparedByName}`,
    `${settings.preparedByRole}, ${settings.agencyName}`,
    signatureContactLine,
  ].join('\n');
}

const PIPELINE_RANK: Record<string, number> = {
  new: 0,
  'new lead': 0,
  contacted: 1,
  'audit sent': 2,
  proposal: 3,
  won: 4,
  lost: 4,
};

export async function syncLinkedLeadOnProposalSent(leadId: string | null | undefined): Promise<void> {
  if (!leadId) return;
  try {
    const { data: leadRow, error: fetchError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();

    if (fetchError || !leadRow) return;

    const currentRaw = String(leadRow.pipeline_stage || leadRow.status || 'New').trim().toLowerCase();
    const currentRank = PIPELINE_RANK[currentRaw] ?? 0;
    const followUp3Days = formatInputDate(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000));

    const updatePayload: Record<string, any> = {
      follow_up_date: followUp3Days,
      next_follow_up_type: 'WhatsApp',
    };

    if (currentRank < PIPELINE_RANK.proposal) {
      updatePayload.status = 'Proposal';
      if ('pipeline_stage' in leadRow) {
        updatePayload.pipeline_stage = 'Proposal';
      }
    }

    await supabase.from('leads').update(updatePayload).eq('id', leadId);

    await supabase.from('lead_activities').insert({
      lead_id: leadId,
      type: 'Proposal',
      outcome: 'Sent',
      note: 'Proposal sent',
    });
  } catch (err) {
    console.error('Failed to sync linked lead on proposal sent:', err);
  }
}

export async function syncLinkedLeadOnProposalDeclined(
  leadId: string | null | undefined,
  reason?: string
): Promise<void> {
  if (!leadId) return;
  try {
    const { data: leadRow } = await supabase
      .from('leads')
      .select('id, pipeline_stage')
      .eq('id', leadId)
      .maybeSingle();

    const updatePayload: Record<string, any> = { status: 'Lost' };
    if (leadRow && 'pipeline_stage' in leadRow) {
      updatePayload.pipeline_stage = 'Lost';
    }

    await supabase.from('leads').update(updatePayload).eq('id', leadId);

    await supabase.from('lead_activities').insert({
      lead_id: leadId,
      type: 'Proposal',
      outcome: 'Declined',
      note: reason?.trim() ? `Proposal declined: ${reason.trim()}` : 'Proposal declined',
    });
  } catch (err) {
    console.error('Failed to sync linked lead on proposal declined:', err);
  }
}
