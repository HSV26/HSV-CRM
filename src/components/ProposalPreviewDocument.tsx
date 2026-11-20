import React, { useEffect, useRef, useState } from 'react';
import { formatDate, formatINR } from '../lib/utils';
import {
  CompanySettings,
  COMPANY_SETTINGS_EVENT,
  getCompanySettings,
  getAgencyContactSummary,
  getPaymentDetailEntries,
  formatProperCaseName,
  calculateProposalTotals,
  normalizeDeliverables,
  normalizeIntroParagraphs,
  normalizeTermsLines,
  resolveProposalDates,
  DEFAULT_PAYMENT_TERMS,
  DEFAULT_TERMS_TEXT,
  NOT_INCLUDED_TEXT,
} from '../lib/proposalConfig';
import {
  Check,
  Phone,
  Mail,
  Globe,
  MessageCircle,
  Calendar,
  AlertTriangle,
} from 'lucide-react';

export interface ProposalPreviewData {
  proposal_number?: string | null;
  business_name?: string | null;
  contact_name?: string | null;
  business_type?: string | null;
  city?: string | null;
  package?: string | null;
  intro_text?: string | null;
  deliverables?: unknown;
  monthly_fee?: number | string | null;
  setup_fee?: number | string | null;
  discount?: number | string | null;
  gst_enabled?: boolean | null;
  gst_percent?: number | string | null;
  start_date?: string | null;
  valid_until?: string | null;
  payment_terms?: string | null;
  terms_text?: string | null;
  created_at?: string | null;
  show_sample_work?: boolean;
  sample_work_note?: string | null;
}

interface ProposalPreviewDocumentProps {
  proposal: ProposalPreviewData;
}

const A4_WIDTH_PX = 794;

const PROCESS_STEPS = [
  {
    step: '01. Audit',
    description:
      'Review your current Instagram presence, Google Business Profile, and how guests discover your property.',
  },
  {
    step: '02. Strategy',
    description:
      'Define content pillars, visual direction, and monthly themes tailored to your venue and audience.',
  },
  {
    step: '03. Execution',
    description:
      'Produce, edit, schedule, and publish posts, reels, and stories after your team approves the calendar.',
  },
  {
    step: '04. Dominate',
    description:
      'Refine creative formats each month based on real performance insights to build steady local visibility.',
  },
];

const FIRST_30_DAYS = [
  {
    week: 'Week 1',
    title: 'Onboarding & Audit',
    detail: 'Account access handover, brand asset collection, and profile hygiene check.',
  },
  {
    week: 'Week 2',
    title: 'Calendar & Creative Plan',
    detail: 'Monthly content calendar, reel concepts, and shoot brief shared for approval.',
  },
  {
    week: 'Week 3',
    title: 'Production & Launch',
    detail: 'Editing, caption copywriting, and rollout of scheduled posts, reels, and stories.',
  },
  {
    week: 'Week 4',
    title: 'Consistency & Review',
    detail: 'Active publishing cadence, engagement hygiene, and first-month review notes.',
  },
];

const ONBOARDING_CHECKLIST = [
  'Admin or editor access to Instagram, Facebook, and Google Business Profile.',
  'High-resolution logo, brand colours/fonts, and existing menu or property photos.',
  'One point of contact for timely content calendar approvals and shoot scheduling.',
  'First month advance retainer to confirm the kick-off date.',
];

function capitaliseDearGreeting(para: string): string {
  return para.replace(/^Dear\s+([^,\n]+),/i, (_, name) => {
    const formatted = formatProperCaseName(name);
    return `Dear ${formatted || name},`;
  });
}

export default function ProposalPreviewDocument({ proposal }: ProposalPreviewDocumentProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [scaledHeight, setScaledHeight] = useState<number | undefined>(undefined);
  const [companySettings, setCompanySettings] = useState<CompanySettings>(() => getCompanySettings());

  useEffect(() => {
    const handleSettingsUpdate = (e: Event) => {
      const detail = (e as CustomEvent<CompanySettings>).detail;
      setCompanySettings(detail || getCompanySettings());
    };
    window.addEventListener(COMPANY_SETTINGS_EVENT, handleSettingsUpdate);
    return () => window.removeEventListener(COMPANY_SETTINGS_EVENT, handleSettingsUpdate);
  }, []);

  useEffect(() => {
    const updateScale = () => {
      if (!containerRef.current || !innerRef.current) return;
      const availableW = containerRef.current.clientWidth;
      const nextScale = availableW > 0 && availableW < A4_WIDTH_PX ? availableW / A4_WIDTH_PX : 1;
      setScale(nextScale);
      setScaledHeight(innerRef.current.scrollHeight * nextScale);
    };

    updateScale();
    const ro = new ResizeObserver(() => updateScale());
    if (containerRef.current) ro.observe(containerRef.current);
    if (innerRef.current) ro.observe(innerRef.current);
    window.addEventListener('resize', updateScale);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateScale);
    };
  }, [proposal, companySettings]);

  const proposalNumber = (proposal.proposal_number || '').trim() || 'HS-2026-001';
  const businessName = formatProperCaseName(proposal.business_name) || 'Your Business Name';
  const contactName = formatProperCaseName(proposal.contact_name);
  const businessType = formatProperCaseName(proposal.business_type);
  const city = formatProperCaseName(proposal.city);
  const packageName = (proposal.package || 'Growth').trim();
  const deliverables = normalizeDeliverables(proposal.deliverables);
  const totals = calculateProposalTotals(proposal);

  const resolvedDates = resolveProposalDates(
    proposal.start_date,
    proposal.valid_until,
    proposal.created_at
  );
  const proposalDate = formatDate(resolvedDates.proposalDate);
  const validUntil = formatDate(resolvedDates.validUntil);
  const startDate = formatDate(resolvedDates.startDate);

  const introRaw = (proposal.intro_text || '').trim();
  const introParagraphs = normalizeIntroParagraphs(
    introRaw ||
      `Dear ${contactName || businessName},\n\nWe look forward to partnering with ${businessName}${
        city ? ` in ${city}` : ''
      } to present your hospitality experience clearly and consistently online.`
  ).map((p, idx) => (idx === 0 ? capitaliseDearGreeting(p) : p));

  const paymentTerms = (proposal.payment_terms || '').trim() || DEFAULT_PAYMENT_TERMS;
  const termsList = normalizeTermsLines((proposal.terms_text || '').trim() || DEFAULT_TERMS_TEXT);
  const { phone, whatsapp, email, website, gstin } = getAgencyContactSummary(companySettings);
  const paymentEntries = getPaymentDetailEntries(companySettings);

  const clientSubline = [contactName, businessType, city].filter(Boolean).join(' · ');
  const footerContact = [
    companySettings.agencyName,
    proposalNumber,
    phone,
    ...(email ? [email] : []),
    ...(website ? [website] : []),
  ].join('  |  ');

  // Dynamic sequential numbering on Page 3
  let p3Num = 8;
  const getNextP3Num = () => String(p3Num++).padStart(2, '0');
  const secNeedNum = getNextP3Num();
  const secSampleNum = proposal.show_sample_work ? getNextP3Num() : '';
  const secPaymentNum = paymentEntries.length > 0 ? getNextP3Num() : '';
  const secNextNum = getNextP3Num();
  const secAcceptNum = getNextP3Num();

  const PageRunningHeader = () => (
    <div className="border-t-[8px] border-[#1D4ED8] px-12 pt-5 pb-3 border-b border-[#DCEBFF] flex items-center justify-between gap-4">
      <span className="font-['Plus_Jakarta_Sans'] text-xs font-bold text-[#0A1F5C]">
        {companySettings.agencyName}
      </span>
      <span className="text-[11px] text-slate-500 text-right break-words whitespace-normal">
        {[proposalNumber, businessName, ...(gstin ? [`GSTIN: ${gstin}`] : [])].join('  |  ')}
      </span>
    </div>
  );

  const PageFooter = ({ page }: { page: number }) => (
    <footer className="px-12 pb-6 pt-3 mt-auto">
      <div className="border-t border-[#DCEBFF] pt-3 flex items-center justify-between gap-4 text-[11px]">
        <span className="text-slate-500 break-words whitespace-normal">{footerContact}</span>
        <span className="font-semibold text-[#0A1F5C] shrink-0">Page {page} of 3</span>
      </div>
    </footer>
  );

  const pageCardClass =
    'bg-white w-[794px] min-h-[1123px] mx-auto border border-[#DCEBFF] rounded-xl shadow-sm overflow-hidden text-slate-800 flex flex-col print:border-0 print:shadow-none print:rounded-none print:break-after-page';

  return (
    <div ref={containerRef} className="w-full overflow-hidden">
      <div
        style={{
          height: scaledHeight ? `${scaledHeight}px` : undefined,
        }}
        className="relative w-full flex justify-center print:h-auto"
      >
        <div
          id="proposal-a4-preview"
          ref={innerRef}
          style={{
            width: `${A4_WIDTH_PX}px`,
            transform: scale < 1 ? `scale(${scale})` : undefined,
            transformOrigin: 'top center',
          }}
          className="space-y-6 shrink-0 print:transform-none print:space-y-0"
        >
          {/* ==================== PAGE 1 ==================== */}
          <article className={pageCardClass}>
            {/* COVER HEADER */}
            <header className="bg-[#0A1F5C] text-white px-12 py-7 border-b-[5px] border-[#1D4ED8] break-inside-avoid">
              <div className="flex items-start justify-between gap-6">
                <div className="space-y-3 min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <svg
                      width="34"
                      height="34"
                      viewBox="0 0 36 36"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      aria-hidden="true"
                      className="shrink-0"
                    >
                      <rect width="36" height="36" rx="8" fill="#FFFFFF" />
                      <path
                        d="M10.5 10V26M25.5 10V26M10.5 18H25.5"
                        stroke="#1D4ED8"
                        strokeWidth="3.2"
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="min-w-0">
                      <p className="font-['Plus_Jakarta_Sans'] font-bold text-lg tracking-tight leading-tight text-white">
                        {companySettings.agencyName}
                      </p>
                      <p className="text-[11px] text-blue-200">
                        {[companySettings.tagline, website].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </div>

                  <div className="pt-0.5">
                    <p className="text-[10.5px] font-semibold uppercase tracking-wider text-blue-200">
                      Commercial Proposal
                    </p>
                    <h1 className="text-[24px] font-bold font-['Plus_Jakarta_Sans'] text-white leading-snug mt-0.5">
                      Social Media Marketing Proposal
                    </h1>
                  </div>
                </div>

                <div className="text-right space-y-1 shrink-0 bg-[#122B73] border border-blue-400/30 rounded-xl px-4 py-3 min-w-[185px]">
                  <p className="text-xs font-mono font-bold text-white tracking-wide">
                    {proposalNumber}
                  </p>
                  <p className="text-[11px] text-blue-100">Date: {proposalDate}</p>
                  <p className="text-[11px] text-blue-200 font-medium">Valid until: {validUntil}</p>
                  {gstin && (
                    <p className="text-[10.5px] font-mono font-semibold text-blue-100 pt-0.5 border-t border-blue-400/20">
                      GSTIN: {gstin}
                    </p>
                  )}
                </div>
              </div>
            </header>

            <div className="px-12 pt-6 pb-4 flex-1 text-[12.5px] leading-relaxed">
              {/* PREPARED FOR / PREPARED BY */}
              <section className="bg-[#F8FAFF] border border-[#DCEBFF] rounded-xl p-4 grid grid-cols-2 gap-6 break-inside-avoid">
                <div className="min-w-0 space-y-0.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#1D4ED8]">
                    Prepared For
                  </p>
                  <p className="text-sm font-bold font-['Plus_Jakarta_Sans'] text-[#0A1F5C] w-full break-words whitespace-normal">
                    {businessName}
                  </p>
                  {clientSubline && (
                    <p className="text-xs text-slate-600 w-full break-words whitespace-normal">
                      {clientSubline}
                    </p>
                  )}
                  <p className="text-[11px] text-slate-500 pt-0.5">
                    Proposed Start: <strong className="text-[#0A1F5C]">{startDate}</strong>
                  </p>
                </div>

                <div className="min-w-0 space-y-0.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#1D4ED8]">
                    Prepared By
                  </p>
                  <p className="text-sm font-bold font-['Plus_Jakarta_Sans'] text-[#0A1F5C] w-full break-words whitespace-normal">
                    {companySettings.preparedByName}
                  </p>
                  <p className="text-xs text-slate-600 w-full break-words whitespace-normal">
                    {companySettings.preparedByRole}, {companySettings.agencyName}
                  </p>
                  <p className="text-[11px] text-slate-500 pt-0.5 w-full break-words whitespace-normal">
                    {[phone, email, website].filter(Boolean).join('  |  ')}
                  </p>
                </div>
              </section>

              {/* 01. ABOUT HOTELSTORY */}
              <section className="mt-6 space-y-2 break-inside-avoid">
                <h2 className="text-sm font-bold font-['Plus_Jakarta_Sans'] text-[#0A1F5C] pb-1.5 border-b border-[#DCEBFF]">
                  01. About HotelStory
                </h2>
                <p className="w-full text-slate-700 break-words [overflow-wrap:anywhere] whitespace-normal">
                  HotelStory is a hospitality-only social media marketing agency helping restaurants,
                  cafés, hotels, resorts, bars, and event venues get seen by local diners and travellers.
                  We focus on honest storytelling, consistent visual craft, and reliable execution built
                  specifically around how hospitality guests choose where to eat, stay, and celebrate.
                </p>
              </section>

              {/* 02. UNDERSTANDING YOUR BUSINESS */}
              <section className="mt-6 space-y-2.5 break-inside-avoid">
                <h2 className="text-sm font-bold font-['Plus_Jakarta_Sans'] text-[#0A1F5C] pb-1.5 border-b border-[#DCEBFF]">
                  02. Understanding Your Business
                </h2>
                <div className="w-full bg-[#F8FAFF] border border-[#DCEBFF] rounded-xl p-4 text-slate-700 space-y-2.5">
                  {introParagraphs.map((para, idx) => (
                    <p
                      key={idx}
                      className="w-full break-words [overflow-wrap:anywhere] whitespace-normal leading-relaxed"
                    >
                      {para}
                    </p>
                  ))}
                </div>
              </section>

              {/* 03. WHAT WE WILL DO */}
              <section className="mt-6 space-y-2.5 break-inside-avoid">
                <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-[#DCEBFF]">
                  <h2 className="text-sm font-bold font-['Plus_Jakarta_Sans'] text-[#0A1F5C]">
                    03. What We Will Do
                  </h2>
                  <span className="text-xs font-bold text-[#1D4ED8] bg-[#F2F7FF] border border-[#DCEBFF] px-2.5 py-0.5 rounded-md shrink-0">
                    {packageName} Package
                  </span>
                </div>

                {deliverables.length > 0 ? (
                  <ul className="grid grid-cols-2 gap-2.5">
                    {deliverables.map((item, idx) => (
                      <li
                        key={`${idx}-${item}`}
                        className="flex items-start gap-2.5 bg-white border border-[#E5ECF6] rounded-lg px-3 py-2 text-slate-700 min-w-0"
                      >
                        <span className="mt-0.5 w-4 h-4 rounded-full bg-[#F2F7FF] border border-[#DCEBFF] text-[#1D4ED8] flex items-center justify-center shrink-0">
                          <Check className="w-2.5 h-2.5" />
                        </span>
                        <span className="w-full text-[12px] font-medium text-[#0A1F5C] break-words [overflow-wrap:anywhere] whitespace-normal">
                          {item}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-500 italic">
                    Add deliverables in the Package section to list your scope of work here.
                  </p>
                )}
              </section>

              {/* 04. OUR PROCESS */}
              <section className="mt-6 space-y-2.5 break-inside-avoid">
                <h2 className="text-sm font-bold font-['Plus_Jakarta_Sans'] text-[#0A1F5C] pb-1.5 border-b border-[#DCEBFF]">
                  04. Our Process
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  {PROCESS_STEPS.map((item) => (
                    <div
                      key={item.step}
                      className="bg-[#F8FAFF] border border-[#DCEBFF] rounded-xl p-3.5 space-y-1 min-w-0"
                    >
                      <p className="text-xs font-bold text-[#1D4ED8]">{item.step}</p>
                      <p className="w-full text-xs text-slate-700 leading-relaxed break-words whitespace-normal">
                        {item.description}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <PageFooter page={1} />
          </article>

          {/* ==================== PAGE 2 ==================== */}
          <article className={pageCardClass}>
            <PageRunningHeader />

            <div className="px-12 pt-4 pb-4 flex-1 text-[12.5px] leading-relaxed">
              {/* 05. FIRST 30 DAYS */}
              <section className="mt-2 space-y-2.5 break-inside-avoid">
                <h2 className="text-sm font-bold font-['Plus_Jakarta_Sans'] text-[#0A1F5C] pb-1.5 border-b border-[#DCEBFF]">
                  05. First 30 Days
                </h2>
                <div className="divide-y divide-[#E5ECF6] border border-[#DCEBFF] rounded-xl overflow-hidden bg-white">
                  {FIRST_30_DAYS.map((w) => (
                    <div key={w.week} className="px-4 py-3 flex items-start gap-4">
                      <span className="text-xs font-bold text-[#1D4ED8] w-14 shrink-0">
                        {w.week}
                      </span>
                      <span className="text-xs font-semibold text-[#0A1F5C] w-44 shrink-0">
                        {w.title}
                      </span>
                      <span className="flex-1 min-w-0 text-xs text-slate-600 break-words whitespace-normal">
                        {w.detail}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              {/* 06. INVESTMENT SUMMARY */}
              <section className="mt-6 space-y-2.5 break-inside-avoid">
                <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-[#DCEBFF]">
                  <h2 className="text-sm font-bold font-['Plus_Jakarta_Sans'] text-[#0A1F5C]">
                    06. Investment Summary
                  </h2>
                  <span className="text-xs text-slate-500 flex items-center gap-1 shrink-0">
                    <Calendar className="w-3.5 h-3.5 text-[#1D4ED8]" />
                    Proposed start: <strong className="text-[#0A1F5C]">{startDate}</strong>
                  </span>
                </div>

                {totals.monthlyFee <= 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 flex items-center gap-2 text-xs font-medium text-amber-800">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                    <span>
                      Enter a monthly retainer price in Section 3 (Investment) before downloading the
                      PDF.
                    </span>
                  </div>
                )}

                <div className="border border-[#DCEBFF] rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#F2F7FF] border-b border-[#DCEBFF] text-[#0A1F5C] font-bold">
                        <th className="py-2.5 px-4">Item</th>
                        <th className="py-2.5 px-4 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E5ECF6] bg-white">
                      <tr>
                        <td className="py-2.5 px-4 text-slate-700 font-medium">
                          Monthly Retainer ({packageName} Package)
                        </td>
                        <td className="py-2.5 px-4 text-right font-semibold text-[#0A1F5C] tabular-nums">
                          {totals.monthlyFee > 0 ? formatINR(totals.monthlyFee) : 'Price required'}
                        </td>
                      </tr>
                      {totals.setupFee > 0 && (
                        <tr>
                          <td className="py-2.5 px-4 text-slate-700 font-medium">
                            One-time Setup / Onboarding Fee
                          </td>
                          <td className="py-2.5 px-4 text-right font-semibold text-[#0A1F5C] tabular-nums">
                            {formatINR(totals.setupFee)}
                          </td>
                        </tr>
                      )}
                      {totals.discount > 0 && (
                        <tr>
                          <td className="py-2.5 px-4 text-emerald-700 font-medium">Discount</td>
                          <td className="py-2.5 px-4 text-right font-semibold text-emerald-700 tabular-nums">
                            -{formatINR(totals.discount)}
                          </td>
                        </tr>
                      )}
                      <tr className="bg-[#F8FAFF]">
                        <td className="py-2.5 px-4 text-slate-600 font-semibold">Subtotal</td>
                        <td className="py-2.5 px-4 text-right font-semibold text-[#0A1F5C] tabular-nums">
                          {formatINR(totals.subtotal)}
                        </td>
                      </tr>
                      {totals.gstEnabled && (
                        <tr>
                          <td className="py-2.5 px-4 text-slate-600">GST ({totals.gstPercent}%)</td>
                          <td className="py-2.5 px-4 text-right font-medium text-slate-700 tabular-nums">
                            {formatINR(totals.gstAmount)}
                          </td>
                        </tr>
                      )}
                      <tr className="bg-[#0A1F5C] text-white">
                        <td className="py-3 px-4 font-bold text-[13px]">
                          Total Payable in First Month
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-sm tabular-nums">
                          {formatINR(totals.firstMonthTotal)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {(totals.setupFee > 0 || totals.discount > 0) && totals.monthlyFee > 0 && (
                  <p className="text-[11px] text-slate-500">
                    Ongoing monthly retainer from Month 2 onwards:{' '}
                    <strong className="text-[#0A1F5C] tabular-nums">
                      {formatINR(totals.recurringMonthlyTotal)}
                    </strong>{' '}
                    {totals.gstEnabled ? `(incl. ${totals.gstPercent}% GST)` : '(excluding GST)'}.
                  </p>
                )}
              </section>

              {/* 07. TERMS AND PAYMENT */}
              <section className="mt-6 space-y-2.5 break-inside-avoid">
                <h2 className="text-sm font-bold font-['Plus_Jakarta_Sans'] text-[#0A1F5C] pb-1.5 border-b border-[#DCEBFF]">
                  07. Terms and Payment
                </h2>
                <div className="w-full bg-[#F8FAFF] border border-[#DCEBFF] rounded-xl p-4 space-y-3 text-xs text-slate-700">
                  <p className="w-full break-words [overflow-wrap:anywhere] whitespace-normal leading-relaxed">
                    <strong className="text-[#0A1F5C]">Payment Terms:</strong> {paymentTerms}
                  </p>
                  <div className="border-t border-[#DCEBFF] pt-3">
                    <ul className="w-full space-y-2">
                      {termsList.map((term, idx) => (
                        <li key={idx} className="w-full flex items-start gap-2.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#1D4ED8] mt-1.5 shrink-0" />
                          <span className="w-full text-slate-600 leading-relaxed break-words [overflow-wrap:anywhere] whitespace-normal">
                            {term}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="border-t border-[#DCEBFF] pt-3">
                    <p className="w-full text-[#0A1F5C] font-semibold leading-relaxed break-words [overflow-wrap:anywhere] whitespace-normal">
                      Not Included: <span className="font-normal text-slate-700">{NOT_INCLUDED_TEXT}</span>
                    </p>
                  </div>
                </div>
              </section>
            </div>

            <PageFooter page={2} />
          </article>

          {/* ==================== PAGE 3 ==================== */}
          <article className={pageCardClass}>
            <PageRunningHeader />

            <div className="px-12 pt-4 pb-4 flex-1 text-[12.5px] leading-relaxed">
              {/* 08. WHAT WE NEED FROM YOU */}
              <section className="mt-2 space-y-2 break-inside-avoid">
                <h2 className="text-sm font-bold font-['Plus_Jakarta_Sans'] text-[#0A1F5C] pb-1.5 border-b border-[#DCEBFF]">
                  {secNeedNum}. What We Need From You
                </h2>
                <div className="bg-white border border-[#DCEBFF] rounded-xl p-4">
                  <ul className="space-y-2.5 text-xs text-slate-700">
                    {ONBOARDING_CHECKLIST.map((item) => (
                      <li key={item} className="flex items-start gap-3">
                        <span className="mt-0.5 w-4 h-4 rounded-full bg-[#F2F7FF] border border-[#DCEBFF] text-[#1D4ED8] flex items-center justify-center shrink-0">
                          <Check className="w-2.5 h-2.5" />
                        </span>
                        <span className="w-full break-words [overflow-wrap:anywhere] whitespace-normal leading-relaxed">
                          {item}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>

              {/* Optional Sample Work */}
              {proposal.show_sample_work && (
                <section className="mt-5 space-y-2 break-inside-avoid">
                  <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-[#DCEBFF]">
                    <h2 className="text-sm font-bold font-['Plus_Jakarta_Sans'] text-[#0A1F5C]">
                      {secSampleNum}. Sample Work
                    </h2>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#F2F7FF] text-[#1D4ED8] border border-[#DCEBFF]">
                      Sample concept
                    </span>
                  </div>
                  <div className="w-full bg-[#F8FAFF] border border-[#DCEBFF] rounded-xl p-4 text-xs text-slate-700 break-words [overflow-wrap:anywhere] whitespace-normal leading-relaxed">
                    {(proposal.sample_work_note || '').trim() ||
                      'Sample concept: A 3-part monthly reel & story format showcasing signature dishes or rooms, behind-the-scenes craft, and weekend dining/stay invitations.'}
                  </div>
                </section>
              )}

              {/* PAYMENT DETAILS (from Company Settings) */}
              {paymentEntries.length > 0 && (
                <section className="mt-5 space-y-2 break-inside-avoid">
                  <h2 className="text-sm font-bold font-['Plus_Jakarta_Sans'] text-[#0A1F5C] pb-1.5 border-b border-[#DCEBFF]">
                    {secPaymentNum}. Payment Details
                  </h2>
                  <div className="bg-[#F8FAFF] border border-[#DCEBFF] rounded-xl p-4 grid grid-cols-2 gap-x-6 gap-y-3">
                    {paymentEntries.map((entry) => (
                      <div key={entry.label} className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[#1D4ED8]">
                          {entry.label}
                        </p>
                        <p className="text-xs font-bold text-[#0A1F5C] mt-0.5 break-words whitespace-normal">
                          {entry.value}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* NEXT STEPS (without duplicate "NEXT STEPS" inside box) */}
              <section className="mt-5 space-y-2 break-inside-avoid">
                <h2 className="text-sm font-bold font-['Plus_Jakarta_Sans'] text-[#0A1F5C] pb-1.5 border-b border-[#DCEBFF]">
                  {secNextNum}. Next Steps
                </h2>

                <div className="bg-[#0A1F5C] text-white rounded-xl p-5 space-y-3.5">
                  <h3 className="text-base font-bold font-['Plus_Jakarta_Sans'] text-white">
                    Ready to get started?
                  </h3>

                  <p className="w-full text-xs text-white font-semibold leading-relaxed break-words whitespace-normal">
                    Confirm this proposal before {validUntil} to schedule onboarding for {startDate}.
                  </p>

                  <p className="w-full text-xs text-blue-100 leading-relaxed break-words whitespace-normal">
                    {email
                      ? 'Reply on WhatsApp, phone, or email to approve. Once confirmed, we will share the first month invoice and onboarding checklist immediately.'
                      : 'Reply on WhatsApp or phone to approve. Once confirmed, we will share the first month invoice and onboarding checklist immediately.'}
                  </p>

                  <div className="grid grid-cols-3 bg-[#122B73] border border-blue-400/25 rounded-xl divide-x divide-blue-400/25">
                    <div className="px-4 py-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-blue-200">
                        Valid Until
                      </p>
                      <p className="text-xs font-bold text-white mt-0.5">{validUntil}</p>
                    </div>
                    <div className="px-4 py-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-blue-200">
                        Proposed Start
                      </p>
                      <p className="text-xs font-bold text-white mt-0.5">{startDate}</p>
                    </div>
                    <div className="px-4 py-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-blue-200">
                        First Month Total
                      </p>
                      <p className="text-xs font-bold text-white mt-0.5 tabular-nums">
                        {formatINR(totals.firstMonthTotal)}
                      </p>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-white/15 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-blue-100">
                    <span className="font-semibold text-white">
                      {companySettings.preparedByName}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-blue-200" />
                      {phone}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <MessageCircle className="w-3.5 h-3.5 text-blue-200" />
                      WhatsApp: {whatsapp}
                    </span>
                    {email && (
                      <span className="inline-flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-blue-200" />
                        {email}
                      </span>
                    )}
                    {website && (
                      <span className="inline-flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-blue-200" />
                        {website}
                      </span>
                    )}
                  </div>
                </div>
              </section>

              {/* ACCEPTANCE BLOCK */}
              <section className="mt-5 space-y-2 break-inside-avoid">
                <h2 className="text-sm font-bold font-['Plus_Jakarta_Sans'] text-[#0A1F5C] pb-1.5 border-b border-[#DCEBFF]">
                  {secAcceptNum}. Acceptance
                </h2>

                <div className="bg-white border border-[#DCEBFF] rounded-xl p-5 space-y-6">
                  <p className="text-xs text-slate-700 w-full break-words whitespace-normal leading-relaxed">
                    By signing below, <strong className="text-[#0A1F5C]">{businessName}</strong>{' '}
                    confirms acceptance of proposal{' '}
                    <strong className="text-[#0A1F5C]">{proposalNumber}</strong> and the terms
                    outlined above.
                  </p>

                  <div className="grid grid-cols-3 gap-6 pt-5">
                    <div>
                      <div className="border-b border-slate-400 h-6" />
                      <p className="text-[11px] font-bold text-[#0A1F5C] mt-1.5">Accepted by</p>
                    </div>
                    <div>
                      <div className="border-b border-slate-400 h-6" />
                      <p className="text-[11px] font-bold text-[#0A1F5C] mt-1.5">Date</p>
                    </div>
                    <div>
                      <div className="border-b border-slate-400 h-6" />
                      <p className="text-[11px] font-bold text-[#0A1F5C] mt-1.5">Signature</p>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <PageFooter page={3} />
          </article>
        </div>
      </div>
    </div>
  );
}
