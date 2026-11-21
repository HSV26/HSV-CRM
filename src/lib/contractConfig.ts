import { supabase } from './supabase';
import { formatDate, formatINR, formatInputDate } from './utils';
import {
  CompanySettings,
  DEFAULT_PAYMENT_TERMS,
  PACKAGE_DEFAULT_FEES,
  PACKAGE_DELIVERABLE_DEFAULTS,
  PackageTier,
  calculateProposalTotals,
  formatProperCaseName,
  getAgencyContactSummary,
  getCompanySettings,
  normalizeDeliverables,
  parseNumericInput,
} from './proposalConfig';

export type ContractTermType = 'month-to-month' | 'fixed';

export type ContractStatus = 'Draft' | 'Sent' | 'Signed' | 'Expired' | 'Terminated';

export const CONTRACT_STATUSES: ContractStatus[] = [
  'Draft',
  'Sent',
  'Signed',
  'Expired',
  'Terminated',
];

export const DEFAULT_GOVERNING_LAW = 'Mumbai, Maharashtra, India';
export const DEFAULT_NOTICE_PERIOD_DAYS = 15;

export interface ContractTemplateClause {
  key: string;
  title: string;
  body: string;
  enabled: boolean;
}

export interface ContractClause {
  id: string;
  key: string;
  title: string;
  body: string;
  enabled: boolean;
}

export interface ContractRecord {
  id?: string;
  created_at?: string | null;
  updated_at?: string | null;
  contract_number: string;
  client_id?: string | null;
  proposal_id?: string | null;
  business_name: string;
  contact_name?: string | null;
  client_designation?: string | null;
  client_email?: string | null;
  client_phone?: string | null;
  client_address?: string | null;
  business_type?: string | null;
  contract_date: string;
  start_date: string;
  term_type: ContractTermType;
  term_months?: number | null;
  renewal_date?: string | null;
  package: string;
  deliverables: string[];
  monthly_fee: number;
  setup_fee?: number | null;
  discount?: number | null;
  gst_enabled: boolean;
  gst_percent: number;
  payment_terms?: string | null;
  notice_period_days: number;
  governing_law: string;
  clauses: ContractClause[];
  status: ContractStatus;
  sent_at?: string | null;
  signed_at?: string | null;
  terminated_at?: string | null;
  notes?: string | null;
  company_settings?: CompanySettings;
}

export const CONTRACT_TEMPLATES_STORAGE_KEY = 'hotelstory_contract_templates_v1';
export const CONTRACT_TEMPLATES_EVENT = 'hotelstory:contract-templates-updated';

export const DEFAULT_CONTRACT_CLAUSE_TEMPLATES: ContractTemplateClause[] = [
  {
    key: 'parties',
    title: 'Parties',
    enabled: true,
    body: 'This Social Media Marketing Services Agreement ("Agreement") is entered into on {{contract_date}} between {{agency_name}}, a hospitality marketing agency represented by {{agency_representative}} ({{agency_contact}}), hereinafter referred to as the "Agency", and {{client_name}}{{client_location_clause}}{{client_contact_clause}}, hereinafter referred to as the "Client".',
  },
  {
    key: 'scope',
    title: 'Scope of Services',
    enabled: true,
    body: 'The Agency will deliver monthly social media management services under the {{package_name}} plan, covering the following agreed deliverables:\n{{deliverables_list}}',
  },
  {
    key: 'term',
    title: 'Term and Start Date',
    enabled: true,
    body: 'Services under this Agreement will begin on {{start_date}}. {{term_sentence}}',
  },
  {
    key: 'fees_payment',
    title: 'Fees, GST and Payment Schedule',
    enabled: true,
    body: 'The Client agrees to pay a monthly retainer fee of {{monthly_fee}}{{setup_fee_clause}}{{discount_clause}}. {{gst_clause}} {{payment_terms}}',
  },
  {
    key: 'client_responsibilities',
    title: 'Client Responsibilities',
    enabled: true,
    body: 'To keep delivery on schedule, the Client will provide admin or editor access to relevant social media accounts and Google Business Profile, supply high-resolution logos, menus, and property photos, designate one point of contact, and share timely updates on offers, events, or menu changes.',
  },
  {
    key: 'content_approval',
    title: 'Content Approval Process',
    enabled: true,
    body: 'All monthly content calendars, static posts, reels, and captions will be shared with the Client for review before publishing. The Client agrees to share feedback or approval promptly so scheduled posting dates are not delayed.',
  },
  {
    key: 'not_included',
    title: 'Not Included',
    enabled: true,
    body: 'Paid advertising budgets and ad spend, influencer payouts, printing costs, and extra on-site photo or video shoots are not included in the monthly retainer unless separately agreed in writing.',
  },
  {
    key: 'no_guarantee',
    title: 'No Guarantee of Results',
    enabled: true,
    body: 'While the Agency applies proven hospitality content and channel strategies, specific reach, follower growth, engagement metrics, table reservations, or room bookings depend on market demand, seasonality, pricing, and guest service, and therefore cannot be guaranteed.',
  },
  {
    key: 'ip_rights',
    title: 'Intellectual Property and Usage Rights',
    enabled: true,
    body: 'The Client retains full ownership of its brand name, logos, trademarks, and raw property materials. Upon full payment of applicable fees, final approved social media creatives produced for the Client may be used freely on the Client\'s channels. {{agency_name}} reserves the right to showcase published work and campaign highlights in its portfolio and credentials unless the Client objects in writing.',
  },
  {
    key: 'confidentiality',
    title: 'Confidentiality',
    enabled: true,
    body: 'Both parties agree to keep non-public business information, account login details, pricing terms, and upcoming promotional plans strictly confidential during this Agreement and after it ends.',
  },
  {
    key: 'termination',
    title: 'Termination',
    enabled: true,
    body: 'Either party may end this Agreement by giving at least {{notice_period_days}} days\' written notice to the other party. Fees for services rendered and for the {{notice_period_days}}-day notice period remain payable in full.',
  },
  {
    key: 'liability',
    title: 'Limitation of Liability',
    enabled: true,
    body: 'Neither party shall be liable for any indirect, incidental, or consequential damages, including loss of revenue or third-party platform outages. The Agency\'s total aggregate liability under this Agreement shall not exceed the monthly retainer fee actually paid by the Client for the preceding month.',
  },
  {
    key: 'governing_law',
    title: 'Governing Law and Jurisdiction',
    enabled: true,
    body: 'This Agreement shall be governed by and construed in accordance with the laws of India. Both parties agree to try resolving any dispute amicably first, failing which courts in {{governing_law}} shall have exclusive jurisdiction.',
  },
  {
    key: 'entire_agreement',
    title: 'Entire Agreement and Amendments',
    enabled: true,
    body: 'This Agreement constitutes the complete understanding between the parties regarding the services described above and replaces any prior verbal or written discussions. Any change or addition must be agreed in writing by both parties.',
  },
];

export function getDefaultContractTemplates(): ContractTemplateClause[] {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(CONTRACT_TEMPLATES_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const map = new Map<string, ContractTemplateClause>();
          for (const item of parsed) {
            if (item && typeof item.key === 'string') {
              map.set(item.key, {
                key: item.key,
                title: String(item.title || '').trim() || item.key,
                body: String(item.body || ''),
                enabled: item.enabled !== false,
              });
            }
          }
          // Preserve all standard clauses in order plus any custom keys if added
          const merged = DEFAULT_CONTRACT_CLAUSE_TEMPLATES.map(
            (def) => map.get(def.key) || { ...def }
          );
          for (const [k, v] of map.entries()) {
            if (!DEFAULT_CONTRACT_CLAUSE_TEMPLATES.some((d) => d.key === k)) {
              merged.push(v);
            }
          }
          return merged;
        }
      }
    }
  } catch {
    // Ignore storage read errors
  }
  return DEFAULT_CONTRACT_CLAUSE_TEMPLATES.map((c) => ({ ...c }));
}

export function saveDefaultContractTemplates(
  templates: ContractTemplateClause[]
): ContractTemplateClause[] {
  const sanitized = templates.map((t) => ({
    key: t.key,
    title: t.title.trim() || t.key,
    body: t.body.trim(),
    enabled: t.enabled !== false,
  }));

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(CONTRACT_TEMPLATES_STORAGE_KEY, JSON.stringify(sanitized));
      window.dispatchEvent(new CustomEvent(CONTRACT_TEMPLATES_EVENT, { detail: sanitized }));
    }
  } catch {
    // Ignore storage write errors
  }

  return sanitized;
}

export function resetDefaultContractTemplates(): ContractTemplateClause[] {
  const fresh = DEFAULT_CONTRACT_CLAUSE_TEMPLATES.map((c) => ({ ...c }));
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(CONTRACT_TEMPLATES_STORAGE_KEY);
      window.dispatchEvent(new CustomEvent(CONTRACT_TEMPLATES_EVENT, { detail: fresh }));
    }
  } catch {
    // Ignore
  }
  return fresh;
}

export interface ContractRenderContext {
  business_name?: string | null;
  contact_name?: string | null;
  client_address?: string | null;
  contract_date?: string | null;
  start_date?: string | null;
  term_type?: ContractTermType | string | null;
  term_months?: number | string | null;
  renewal_date?: string | null;
  package?: string | null;
  deliverables?: unknown;
  monthly_fee?: number | string | null;
  setup_fee?: number | string | null;
  discount?: number | string | null;
  gst_enabled?: boolean | null;
  gst_percent?: number | string | null;
  payment_terms?: string | null;
  notice_period_days?: number | string | null;
  governing_law?: string | null;
  company_settings?: CompanySettings;
}

export function hydrateClauseBody(templateBody: string, ctx: ContractRenderContext): string {
  const settings = ctx.company_settings || getCompanySettings();
  const { phone, email, website } = getAgencyContactSummary(settings);
  const agencyContact = [phone, email, website].filter(Boolean).join(', ');

  const clientName = formatProperCaseName(ctx.business_name) || '[Client Business Name]';
  const clientContact = formatProperCaseName(ctx.contact_name);
  const clientAddress = formatProperCaseName(ctx.client_address);

  const clientLocationClause = clientAddress ? `, located at ${clientAddress}` : '';
  const clientContactClause = clientContact ? `, represented by ${clientContact}` : '';

  const pkg = (ctx.package || 'Growth').trim();
  const deliverables = normalizeDeliverables(ctx.deliverables);
  const deliverablesList =
    deliverables.length > 0
      ? deliverables.map((d) => `- ${d}`).join('\n')
      : '- Custom monthly social media deliverables as agreed in writing';

  const contractDateStr = ctx.contract_date ? formatDate(ctx.contract_date) : formatDate(new Date());
  const startDateStr = ctx.start_date ? formatDate(ctx.start_date) : formatDate(new Date());

  const termType = ctx.term_type === 'fixed' ? 'fixed' : 'month-to-month';
  const termMonths = Math.max(1, Number(ctx.term_months) || 3);
  const renewalStr = ctx.renewal_date ? formatDate(ctx.renewal_date) : '';
  const termSentence =
    termType === 'fixed'
      ? `This Agreement is for a fixed initial term of ${termMonths} ${
          termMonths === 1 ? 'month' : 'months'
        }${renewalStr && renewalStr !== '-' ? ` (renewal date: ${renewalStr})` : ''}, after which it may be renewed by mutual written consent.`
      : 'This Agreement operates on a flexible month-to-month basis with no long-term lock-in and continues each month until ended by either party under the Termination clause.';

  const totals = calculateProposalTotals(ctx);
  const monthlyFeeStr = formatINR(totals.monthlyFee) + ' per month';
  const setupFeeClause =
    totals.setupFee > 0
      ? `, plus a one-time setup fee of ${formatINR(totals.setupFee)} payable with the first month`
      : '';
  const discountClause =
    totals.discount > 0
      ? `, less a one-time first-month discount of ${formatINR(totals.discount)}`
      : '';
  const gstClause = totals.gstEnabled
    ? `GST at ${totals.gstPercent}% applies in addition to the fees above (first month total: ${formatINR(
        totals.firstMonthTotal
      )}).`
    : 'GST is not added on this invoice unless applicable under law later.';

  const paymentTerms = (ctx.payment_terms || '').trim() || DEFAULT_PAYMENT_TERMS;
  const noticeDays = Math.max(0, Number(ctx.notice_period_days) || DEFAULT_NOTICE_PERIOD_DAYS);
  const governingLaw = (ctx.governing_law || '').trim() || DEFAULT_GOVERNING_LAW;

  const replacements: Record<string, string> = {
    '{{agency_name}}': settings.agencyName,
    '{{agency_representative}}': settings.preparedByName,
    '{{agency_contact}}': agencyContact,
    '{{client_name}}': clientName,
    '{{client_contact}}': clientContact || clientName,
    '{{client_location_clause}}': clientLocationClause,
    '{{client_contact_clause}}': clientContactClause,
    '{{package_name}}': pkg,
    '{{deliverables_list}}': deliverablesList,
    '{{contract_date}}': contractDateStr,
    '{{start_date}}': startDateStr,
    '{{term_sentence}}': termSentence,
    '{{monthly_fee}}': monthlyFeeStr,
    '{{setup_fee_clause}}': setupFeeClause,
    '{{discount_clause}}': discountClause,
    '{{gst_clause}}': gstClause,
    '{{payment_terms}}': paymentTerms,
    '{{notice_period_days}}': String(noticeDays),
    '{{governing_law}}': governingLaw,
  };

  let out = templateBody;
  for (const [token, val] of Object.entries(replacements)) {
    out = out.split(token).join(val);
  }
  return out;
}

export function buildClausesForContract(
  ctx: ContractRenderContext,
  templates?: ContractTemplateClause[]
): ContractClause[] {
  const sourceTemplates = templates || getDefaultContractTemplates();
  return sourceTemplates.map((tpl, idx) => ({
    id: `${tpl.key}-${idx + 1}`,
    key: tpl.key,
    title: tpl.title,
    body: hydrateClauseBody(tpl.body, ctx),
    enabled: tpl.enabled !== false,
  }));
}

export function normalizeContractClauses(val: unknown): ContractClause[] {
  if (!Array.isArray(val)) return [];
  return val
    .filter((item) => item && typeof item === 'object')
    .map((item: any, idx) => ({
      id: String(item.id || `${item.key || 'clause'}-${idx + 1}`),
      key: String(item.key || `custom_${idx + 1}`),
      title: String(item.title || 'Clause').trim(),
      body: String(item.body || ''),
      enabled: item.enabled !== false,
    }));
}

export function computeContractRenewalDate(
  startDate: string | null | undefined,
  termType: ContractTermType | string | null | undefined,
  termMonths: number | string | null | undefined
): string {
  if (termType !== 'fixed') return '';
  const months = Number(termMonths);
  if (!startDate || !Number.isFinite(months) || months <= 0) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate.trim());
  if (!match) return '';
  const year = Number(match[1]);
  const monthIdx = Number(match[2]) - 1;
  const day = Number(match[3]);
  const d = new Date(year, monthIdx + Math.round(months), day);
  // Clamp overflow (e.g. Jan 31 + 1 month -> Feb 28/29)
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function generateNextContractNumberFromList(
  existingNumbers: Array<string | null | undefined>,
  year: number = new Date().getFullYear()
): string {
  const prefix = `HS-C-${year}-`;
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

export async function fetchNextContractNumber(): Promise<string> {
  const year = new Date().getFullYear();
  try {
    const { data, error } = await supabase
      .from('contracts')
      .select('contract_number')
      .ilike('contract_number', `HS-C-${year}-%`);
    if (error || !data) {
      return `HS-C-${year}-001`;
    }
    return generateNextContractNumberFromList(
      data.map((r: any) => r.contract_number),
      year
    );
  } catch {
    return `HS-C-${year}-001`;
  }
}

export function getEffectiveContractStatus(contract: {
  status?: string | null;
  term_type?: string | null;
  renewal_date?: string | null;
}): ContractStatus {
  const raw = (contract.status || 'Draft').trim();
  const todayStr = formatInputDate(new Date());
  if (raw === 'Terminated') return 'Terminated';
  if (
    raw === 'Signed' &&
    contract.term_type === 'fixed' &&
    contract.renewal_date &&
    contract.renewal_date < todayStr
  ) {
    return 'Expired';
  }
  if (CONTRACT_STATUSES.includes(raw as ContractStatus)) {
    return raw as ContractStatus;
  }
  return 'Draft';
}

export function getContractStatusBadgeStyle(status: string | null | undefined): string {
  switch ((status || 'Draft').toLowerCase()) {
    case 'signed':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'sent':
      return 'bg-blue-50 text-[#1D4ED8] border-[#BFDBFE]';
    case 'expired':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'terminated':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    default:
      return 'bg-[#F8FAFF] text-[#0A1F5C] border-[#DCEBFF]';
  }
}

export function buildContractDraftFromProposal(
  proposal: any,
  contractNumber: string,
  clientsList: any[] = []
): Partial<ContractRecord> {
  const pkg = (proposal.package || 'Growth').trim();
  const deliverables = normalizeDeliverables(proposal.deliverables);
  const finalDeliverables =
    deliverables.length > 0
      ? deliverables
      : [...(PACKAGE_DELIVERABLE_DEFAULTS[pkg as PackageTier] || [])];

  const todayStr = formatInputDate(new Date());
  const startDate =
    proposal.start_date && proposal.start_date >= todayStr ? proposal.start_date : todayStr;

  const monthlyFee =
    parseNumericInput(proposal.monthly_fee) ||
    PACKAGE_DEFAULT_FEES[pkg as PackageTier] ||
    0;

  const matchedClient = proposal.client_id
    ? clientsList.find((c) => c.id === proposal.client_id)
    : clientsList.find(
        (c) =>
          (c.business_name || '').trim().toLowerCase() ===
          (proposal.business_name || '').trim().toLowerCase()
      );

  const ctx: ContractRenderContext = {
    business_name: proposal.business_name || matchedClient?.business_name || '',
    contact_name: proposal.contact_name || matchedClient?.contact_name || '',
    client_address: proposal.city || matchedClient?.city || '',
    contract_date: todayStr,
    start_date: startDate,
    term_type: 'month-to-month',
    term_months: null,
    renewal_date: '',
    package: pkg,
    deliverables: finalDeliverables,
    monthly_fee: monthlyFee,
    setup_fee: parseNumericInput(proposal.setup_fee),
    discount: parseNumericInput(proposal.discount),
    gst_enabled: proposal.gst_enabled ?? true,
    gst_percent: proposal.gst_percent ?? 18,
    payment_terms: proposal.payment_terms || DEFAULT_PAYMENT_TERMS,
    notice_period_days: DEFAULT_NOTICE_PERIOD_DAYS,
    governing_law: DEFAULT_GOVERNING_LAW,
  };

  return {
    contract_number: contractNumber,
    client_id: proposal.client_id || matchedClient?.id || null,
    proposal_id: proposal.id || null,
    business_name: ctx.business_name || '',
    contact_name: ctx.contact_name || '',
    client_email: matchedClient?.email || '',
    client_phone: matchedClient?.phone || '',
    client_address: ctx.client_address || '',
    business_type: proposal.business_type || matchedClient?.business_type || '',
    contract_date: todayStr,
    start_date: startDate,
    term_type: 'month-to-month',
    term_months: null,
    renewal_date: '',
    package: pkg,
    deliverables: finalDeliverables,
    monthly_fee: monthlyFee,
    setup_fee: parseNumericInput(proposal.setup_fee),
    discount: parseNumericInput(proposal.discount),
    gst_enabled: proposal.gst_enabled ?? true,
    gst_percent: Number(proposal.gst_percent ?? 18),
    payment_terms: ctx.payment_terms || DEFAULT_PAYMENT_TERMS,
    notice_period_days: DEFAULT_NOTICE_PERIOD_DAYS,
    governing_law: DEFAULT_GOVERNING_LAW,
    clauses: buildClausesForContract(ctx),
    status: 'Draft',
  };
}

export function buildWhatsAppContractMessage(contract: {
  contract_number?: string | null;
  business_name?: string | null;
  contact_name?: string | null;
  package?: string | null;
  monthly_fee?: number | string | null;
  start_date?: string | null;
  term_type?: string | null;
  term_months?: number | string | null;
}): string {
  const settings = getCompanySettings();
  const { phone } = getAgencyContactSummary(settings);
  const contact = formatProperCaseName(contract.contact_name);
  const business = formatProperCaseName(contract.business_name) || 'your property';
  const pkg = (contract.package || 'Growth').trim();
  const monthly = parseNumericInput(contract.monthly_fee);
  const feeText = monthly > 0 ? `${formatINR(monthly)}/month` : 'as detailed in the agreement';
  const startText = contract.start_date ? formatDate(contract.start_date) : 'as agreed';
  const termText =
    contract.term_type === 'fixed' && Number(contract.term_months) > 0
      ? `${contract.term_months} months`
      : 'Month-to-month';

  return [
    `Dear ${contact || business},`,
    '',
    `Sharing the ${settings.agencyName} Service Agreement${
      contract.contract_number ? ` (${contract.contract_number})` : ''
    } for ${business}.`,
    `Package: ${pkg}`,
    `Monthly Fee: ${feeText}`,
    `Term: ${termText}`,
    `Start Date: ${startText}`,
    '',
    `Please review the attached PDF agreement and reply here or call ${phone} once signed.`,
  ].join('\n');
}
