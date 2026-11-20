import { jsPDF } from 'jspdf';
import { formatDate } from './utils';
import {
  CompanySettings,
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
} from './proposalConfig';

export interface ProposalPdfInput {
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
  company_settings?: CompanySettings;
}

const NAVY: [number, number, number] = [10, 31, 92]; // #0A1F5C
const NAVY_CARD: [number, number, number] = [18, 43, 115]; // #122B73
const NAVY_DIVIDER: [number, number, number] = [59, 91, 168];
const ROYAL_BLUE: [number, number, number] = [29, 78, 216]; // #1D4ED8
const LIGHT_BLUE_BG: [number, number, number] = [248, 250, 255]; // #F8FAFF
const TINT_BLUE_BG: [number, number, number] = [242, 247, 255]; // #F2F7FF
const BORDER_BLUE: [number, number, number] = [220, 235, 255]; // #DCEBFF
const SOFT_BORDER: [number, number, number] = [229, 236, 246]; // #E5ECF6
const SLATE_TEXT: [number, number, number] = [51, 65, 85]; // #334155
const MUTED_TEXT: [number, number, number] = [100, 116, 139]; // #64748B
const EMERALD_TEXT: [number, number, number] = [5, 150, 105];
const BLUE_200: [number, number, number] = [191, 219, 254];
const BLUE_100: [number, number, number] = [219, 234, 254];

let cachedFontPair: { regular: string; bold: string } | null = null;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function ensureUnicodeFonts(doc: jsPDF): Promise<string> {
  try {
    if (!cachedFontPair) {
      const globalFonts = (globalThis as { __PDF_FONTS__?: { regular: string; bold: string } })
        .__PDF_FONTS__;
      if (globalFonts?.regular && globalFonts?.bold) {
        cachedFontPair = globalFonts;
      } else if (typeof fetch !== 'undefined') {
        const [regRes, boldRes] = await Promise.all([
          fetch('/fonts/DejaVuSans.ttf'),
          fetch('/fonts/DejaVuSans-Bold.ttf'),
        ]);
        if (regRes.ok && boldRes.ok) {
          const [regBuf, boldBuf] = await Promise.all([
            regRes.arrayBuffer(),
            boldRes.arrayBuffer(),
          ]);
          cachedFontPair = {
            regular: arrayBufferToBase64(regBuf),
            bold: arrayBufferToBase64(boldBuf),
          };
        }
      }
    }

    if (cachedFontPair) {
      doc.addFileToVFS('DejaVuSans.ttf', cachedFontPair.regular);
      doc.addFont('DejaVuSans.ttf', 'DejaVuSans', 'normal');
      doc.addFileToVFS('DejaVuSans-Bold.ttf', cachedFontPair.bold);
      doc.addFont('DejaVuSans-Bold.ttf', 'DejaVuSans', 'bold');
      return 'DejaVuSans';
    }
  } catch (err) {
    console.warn('Falling back to default PDF font:', err);
  }
  return 'helvetica';
}

export function formatPdfINR(amount: number, unicodeSupported = true): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  const formatted = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(safe);
  return unicodeSupported ? `₹${formatted}` : `Rs. ${formatted}`;
}

function sanitizeFileSegment(val: string | null | undefined, fallback: string): string {
  const cleaned = (val || '')
    .trim()
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned || fallback;
}

export function getProposalPdfFilename(
  businessName?: string | null,
  proposalNumber?: string | null
): string {
  const biz = sanitizeFileSegment(businessName, 'Client');
  const num = sanitizeFileSegment(proposalNumber, 'HS-Draft');
  return `HotelStory-Proposal-${biz}-${num}.pdf`;
}

function capitaliseDearGreeting(para: string): string {
  return para.replace(/^Dear\s+([^,\n]+),/i, (_, name) => {
    const formatted = formatProperCaseName(name);
    return `Dear ${formatted || name},`;
  });
}

export async function buildProposalPdfDocument(proposal: ProposalPdfInput): Promise<{
  doc: jsPDF;
  filename: string;
}> {
  const totals = calculateProposalTotals(proposal);
  if (totals.monthlyFee <= 0) {
    throw new Error('Please enter the monthly price for this proposal before downloading the PDF.');
  }

  const settings = proposal.company_settings || getCompanySettings();
  const { phone, email, website, gstin } = getAgencyContactSummary(settings);
  const paymentEntries = getPaymentDetailEntries(settings);

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const fontFamily = await ensureUnicodeFonts(doc);
  const unicodeSupported = fontFamily === 'DejaVuSans';

  const PAGE_W = 210;
  const PAGE_H = 297;
  const MARGIN_X = 16;
  const CONTENT_W = PAGE_W - MARGIN_X * 2; // 178mm
  const RUNNING_HEADER_BODY_Y = 20;
  const FOOTER_LINE_Y = 281;
  const FOOTER_TEXT_Y = 287;
  const BOTTOM_LIMIT = 275;
  const SECTION_GAP = 7;
  const HEADING_TO_BODY = 6.2;

  const proposalNumber = (proposal.proposal_number || '').trim() || 'HS-2026-001';
  const businessName = formatProperCaseName(proposal.business_name) || 'Client';
  const contactName = formatProperCaseName(proposal.contact_name);
  const businessType = formatProperCaseName(proposal.business_type);
  const city = formatProperCaseName(proposal.city);
  const packageName = (proposal.package || 'Growth').trim();
  const deliverables = normalizeDeliverables(proposal.deliverables);

  const resolvedDates = resolveProposalDates(
    proposal.start_date,
    proposal.valid_until,
    proposal.created_at
  );
  const proposalDate = formatDate(resolvedDates.proposalDate);
  const validUntilStr = formatDate(resolvedDates.validUntil);
  const startDateStr = formatDate(resolvedDates.startDate);

  const introRaw = (proposal.intro_text || '').trim();
  const introParagraphs = normalizeIntroParagraphs(
    introRaw ||
      `Dear ${contactName || businessName},\n\nWe look forward to partnering with ${businessName}${
        city ? ` in ${city}` : ''
      } to present your hospitality experience clearly and consistently online.`
  ).map((p, idx) => (idx === 0 ? capitaliseDearGreeting(p) : p));

  const paymentTerms = (proposal.payment_terms || '').trim() || DEFAULT_PAYMENT_TERMS;
  const termsLines = normalizeTermsLines((proposal.terms_text || '').trim() || DEFAULT_TERMS_TEXT);

  const tickChar = unicodeSupported ? '✓' : '+';
  const bulletSep = '  |  ';

  // Safe text wrapper: ALWAYS sets exact font & size BEFORE measuring splitTextToSize
  const wrapText = (
    text: string,
    maxWidth: number,
    fontSize: number,
    fontStyle: 'normal' | 'bold' = 'normal'
  ): string[] => {
    doc.setFont(fontFamily, fontStyle);
    doc.setFontSize(fontSize);
    const safeWidth = Math.max(10, maxWidth - 0.5);
    return doc.splitTextToSize(text, safeWidth) as string[];
  };

  const drawRunningHeader = () => {
    doc.setFillColor(...ROYAL_BLUE);
    doc.rect(0, 0, PAGE_W, 2.5, 'F');

    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...NAVY);
    doc.text(settings.agencyName, MARGIN_X, 10);

    const rightHeaderParts = [proposalNumber, businessName];
    if (gstin) rightHeaderParts.push(`GSTIN: ${gstin}`);
    const rightHeader = rightHeaderParts.join(bulletSep);
    const maxRightW = CONTENT_W - 42;
    const rightHeaderLines = wrapText(rightHeader, maxRightW, 8, 'normal');
    doc.setTextColor(...MUTED_TEXT);
    doc.text(rightHeaderLines[0] || proposalNumber, PAGE_W - MARGIN_X, 10, { align: 'right' });

    doc.setDrawColor(...BORDER_BLUE);
    doc.setLineWidth(0.35);
    doc.line(MARGIN_X, 13.5, PAGE_W - MARGIN_X, 13.5);
  };

  const startNewPage = () => {
    doc.addPage();
    drawRunningHeader();
    y = RUNNING_HEADER_BODY_Y;
  };

  let y = 0;

  const ensureSpace = (neededHeight: number) => {
    if (y + neededHeight > BOTTOM_LIMIT) {
      startNewPage();
    }
  };

  const drawSectionHeading = (num: string, title: string, rightLabel?: string) => {
    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...NAVY);
    doc.text(`${num}. ${title}`, MARGIN_X, y);

    if (rightLabel) {
      doc.setFont(fontFamily, 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...ROYAL_BLUE);
      doc.text(rightLabel, PAGE_W - MARGIN_X, y, { align: 'right' });
    }

    doc.setDrawColor(...BORDER_BLUE);
    doc.setLineWidth(0.45);
    doc.line(MARGIN_X, y + 2.2, PAGE_W - MARGIN_X, y + 2.2);
    y += HEADING_TO_BODY;
  };

  // ==================== PAGE 1 ====================
  // Cover Header (0..45mm)
  const coverH = gstin ? 45 : 43;
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, PAGE_W, coverH, 'F');
  doc.setFillColor(...ROYAL_BLUE);
  doc.rect(0, coverH, PAGE_W, 2, 'F');

  // Logo emblem
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(MARGIN_X, 9.5, 9, 9, 1.8, 1.8, 'F');
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...ROYAL_BLUE);
  doc.text('H', MARGIN_X + 4.5, 15.8, { align: 'center' });

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text(settings.agencyName, MARGIN_X + 12, 14.2);

  const coverSubtitle = website ? `${settings.tagline}  ·  ${website}` : settings.tagline;
  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...BLUE_200);
  doc.text(coverSubtitle, MARGIN_X + 12, 18.8);

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...BLUE_200);
  doc.text('COMMERCIAL PROPOSAL', MARGIN_X, 27);

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(16.5);
  doc.setTextColor(255, 255, 255);
  doc.text('Social Media Marketing Proposal', MARGIN_X, 34.5);

  // Proposal Meta Pill Box on Cover Right
  const metaBoxW = gstin ? 62 : 54;
  const metaBoxH = gstin ? 29.5 : 24.5;
  const metaBoxX = PAGE_W - MARGIN_X - metaBoxW;
  doc.setFillColor(...NAVY_CARD);
  doc.setDrawColor(...NAVY_DIVIDER);
  doc.setLineWidth(0.35);
  doc.roundedRect(metaBoxX, 8.5, metaBoxW, metaBoxH, 2.2, 2.2, 'FD');

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(255, 255, 255);
  doc.text(proposalNumber, PAGE_W - MARGIN_X - 4, 14.8, { align: 'right' });

  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...BLUE_100);
  doc.text(`Date: ${proposalDate}`, PAGE_W - MARGIN_X - 4, 20.6, { align: 'right' });
  doc.text(`Valid Until: ${validUntilStr}`, PAGE_W - MARGIN_X - 4, 25.8, { align: 'right' });
  if (gstin) {
    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...BLUE_200);
    doc.text(`GSTIN: ${gstin}`, PAGE_W - MARGIN_X - 4, 31.4, { align: 'right' });
  }

  y = coverH + 7.5;

  // Prepared For / Prepared By Card
  const halfGap = 8;
  const halfColW = (CONTENT_W - 10 - halfGap) / 2;
  const leftX = MARGIN_X + 5;
  const rightX = leftX + halfColW + halfGap;

  const clientSubline = [contactName, businessType, city].filter(Boolean).join('  |  ');
  const bizLines = wrapText(businessName, halfColW, 10.5, 'bold');
  const subLines = clientSubline ? wrapText(clientSubline, halfColW, 8.2, 'normal') : [];
  const startMetaLines = wrapText(`Proposed Start: ${startDateStr}`, halfColW, 8, 'normal');

  const prepByNameLines = wrapText(settings.preparedByName, halfColW, 10.5, 'bold');
  const prepByRoleLines = wrapText(
    `${settings.preparedByRole}, ${settings.agencyName}`,
    halfColW,
    8.2,
    'normal'
  );
  const agencyContactStr = [phone, email, website].filter(Boolean).join('  |  ');
  const agencyContactLines = wrapText(agencyContactStr, halfColW, 8, 'normal');

  const leftCardH =
    11 + bizLines.length * 4.5 + (subLines.length > 0 ? subLines.length * 3.8 + 1 : 0) + startMetaLines.length * 3.8 + 3;
  const rightCardH =
    11 + prepByNameLines.length * 4.5 + prepByRoleLines.length * 3.8 + 1 + agencyContactLines.length * 3.8 + 3;
  const prepCardH = Math.max(25, leftCardH, rightCardH);

  doc.setFillColor(...LIGHT_BLUE_BG);
  doc.setDrawColor(...BORDER_BLUE);
  doc.setLineWidth(0.4);
  doc.roundedRect(MARGIN_X, y, CONTENT_W, prepCardH, 2.2, 2.2, 'FD');

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...ROYAL_BLUE);
  doc.text('PREPARED FOR', leftX, y + 6);
  doc.text('PREPARED BY', rightX, y + 6);

  // Left side text
  let ly = y + 11.2;
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...NAVY);
  doc.text(bizLines, leftX, ly);
  ly += bizLines.length * 4.5;

  if (subLines.length > 0) {
    ly += 0.6;
    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(8.2);
    doc.setTextColor(...SLATE_TEXT);
    doc.text(subLines, leftX, ly);
    ly += subLines.length * 3.8;
  }

  ly += 0.6;
  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED_TEXT);
  doc.text(startMetaLines, leftX, ly);

  // Right side text
  let ry = y + 11.2;
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...NAVY);
  doc.text(prepByNameLines, rightX, ry);
  ry += prepByNameLines.length * 4.5 + 0.6;

  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(...SLATE_TEXT);
  doc.text(prepByRoleLines, rightX, ry);
  ry += prepByRoleLines.length * 3.8 + 0.6;

  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED_TEXT);
  doc.text(agencyContactLines, rightX, ry);

  y += prepCardH + SECTION_GAP;

  // ==================== 01. ABOUT HOTELSTORY ====================
  const aboutText =
    'HotelStory is a hospitality-only social media marketing agency helping restaurants, cafés, hotels, resorts, bars, and event venues get seen by local diners and travellers. We focus on honest storytelling, consistent visual craft, and reliable execution built specifically around how hospitality guests choose where to eat, stay, and celebrate.';
  const aboutLines = wrapText(aboutText, CONTENT_W, 9, 'normal');
  const aboutLineH = 4.3;
  const aboutTotalH = HEADING_TO_BODY + aboutLines.length * aboutLineH;

  ensureSpace(aboutTotalH);
  drawSectionHeading('01', 'About HotelStory');
  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...SLATE_TEXT);
  doc.text(aboutLines, MARGIN_X, y, { lineHeightFactor: 1.35 });
  y += aboutLines.length * aboutLineH + SECTION_GAP;

  // ==================== 02. UNDERSTANDING YOUR BUSINESS ====================
  const introBoxPadX = 4.5;
  const introBoxPadY = 4.5;
  const introInnerW = CONTENT_W - introBoxPadX * 2;
  const wrappedIntroParas = introParagraphs.map((p) => wrapText(p, introInnerW, 9, 'normal'));
  const introLineH = 4.25;
  const introTextH = wrappedIntroParas.reduce(
    (sum, lines, idx) => sum + lines.length * introLineH + (idx > 0 ? 2.5 : 0),
    0
  );
  const introBoxH = introBoxPadY * 2 + Math.max(introLineH, introTextH) - 1.5;

  ensureSpace(HEADING_TO_BODY + introBoxH);
  drawSectionHeading('02', 'Understanding Your Business');

  doc.setFillColor(...LIGHT_BLUE_BG);
  doc.setDrawColor(...BORDER_BLUE);
  doc.setLineWidth(0.35);
  doc.roundedRect(MARGIN_X, y - 1.5, CONTENT_W, introBoxH, 2, 2, 'FD');

  let introY = y - 1.5 + introBoxPadY + 2.6;
  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...SLATE_TEXT);
  wrappedIntroParas.forEach((lines, idx) => {
    if (idx > 0) introY += 2.5;
    doc.text(lines, MARGIN_X + introBoxPadX, introY, { lineHeightFactor: 1.33 });
    introY += lines.length * introLineH;
  });

  y += introBoxH - 1.5 + SECTION_GAP;

  // ==================== 03. WHAT WE WILL DO ====================
  const delivItems =
    deliverables.length > 0 ? deliverables : ['Custom monthly content & social media deliverables'];
  const delivGap = 3.5;
  const delivColW = (CONTENT_W - delivGap) / 2;
  const delivTextW = delivColW - 11.5;
  const delivLineH = 4.0;

  interface DelivRow {
    left: string[];
    right: string[] | null;
    rowH: number;
  }
  const delivRows: DelivRow[] = [];
  for (let i = 0; i < delivItems.length; i += 2) {
    const leftLines = wrapText(delivItems[i], delivTextW, 8.6, 'bold');
    const rightLines =
      i + 1 < delivItems.length ? wrapText(delivItems[i + 1], delivTextW, 8.6, 'bold') : null;
    const maxLines = Math.max(leftLines.length, rightLines ? rightLines.length : 0);
    const rowH = Math.max(8, maxLines * delivLineH + 4);
    delivRows.push({ left: leftLines, right: rightLines, rowH });
  }

  const delivTotalH =
    HEADING_TO_BODY + delivRows.reduce((s, r, idx) => s + r.rowH + (idx > 0 ? 2.5 : 0), 0);

  if (delivTotalH <= BOTTOM_LIMIT - RUNNING_HEADER_BODY_Y) {
    ensureSpace(delivTotalH);
  } else {
    ensureSpace(HEADING_TO_BODY + (delivRows[0]?.rowH || 10));
  }
  drawSectionHeading('03', 'What We Will Do', `${packageName} Package`);

  const drawDeliverableCard = (
    boxX: number,
    boxY: number,
    boxW: number,
    boxH: number,
    lines: string[]
  ) => {
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...SOFT_BORDER);
    doc.setLineWidth(0.3);
    doc.roundedRect(boxX, boxY, boxW, boxH, 1.8, 1.8, 'FD');

    doc.setFillColor(...TINT_BLUE_BG);
    doc.setDrawColor(...BORDER_BLUE);
    doc.circle(boxX + 4.8, boxY + 4.3, 2.1, 'FD');
    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...ROYAL_BLUE);
    doc.text(tickChar, boxX + 4.8, boxY + 5.2, { align: 'center' });

    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(8.6);
    doc.setTextColor(...NAVY);
    doc.text(lines, boxX + 9, boxY + 5.1, { lineHeightFactor: 1.3 });
  };

  delivRows.forEach((row, idx) => {
    if (y + row.rowH > BOTTOM_LIMIT) {
      startNewPage();
    }
    drawDeliverableCard(MARGIN_X, y - 1, delivColW, row.rowH, row.left);
    if (row.right) {
      drawDeliverableCard(MARGIN_X + delivColW + delivGap, y - 1, delivColW, row.rowH, row.right);
    }
    y += row.rowH + (idx < delivRows.length - 1 ? 2.5 : 0);
  });

  y += SECTION_GAP - 1;

  // ==================== 04. OUR PROCESS ====================
  const processSteps = [
    {
      step: '01. Audit',
      desc: 'Review your current Instagram presence, Google Business Profile, and how guests discover your property.',
    },
    {
      step: '02. Strategy',
      desc: 'Define content pillars, visual direction, and monthly themes tailored to your venue and audience.',
    },
    {
      step: '03. Execution',
      desc: 'Produce, edit, schedule, and publish posts, reels, and stories after your team approves the calendar.',
    },
    {
      step: '04. Dominate',
      desc: 'Refine creative formats each month based on real performance insights to build steady local visibility.',
    },
  ];

  const procGap = 4;
  const procColW = (CONTENT_W - procGap) / 2;
  const procTextW = procColW - 7;
  const procLineH = 3.75;

  const procPairs: Array<{
    left: { step: string; lines: string[] };
    right: { step: string; lines: string[] };
    boxH: number;
  }> = [];

  for (let i = 0; i < processSteps.length; i += 2) {
    const lLines = wrapText(processSteps[i].desc, procTextW, 8.1, 'normal');
    const rLines = wrapText(processSteps[i + 1].desc, procTextW, 8.1, 'normal');
    const maxLines = Math.max(lLines.length, rLines.length);
    const boxH = Math.max(17, 9 + maxLines * procLineH + 2.5);
    procPairs.push({
      left: { step: processSteps[i].step, lines: lLines },
      right: { step: processSteps[i + 1].step, lines: rLines },
      boxH,
    });
  }

  const procTotalH =
    HEADING_TO_BODY + procPairs.reduce((s, p, idx) => s + p.boxH + (idx > 0 ? 3 : 0), 0);

  ensureSpace(procTotalH);
  drawSectionHeading('04', 'Our Process');

  procPairs.forEach((pair, idx) => {
    [pair.left, pair.right].forEach((card, cIdx) => {
      const boxX = MARGIN_X + cIdx * (procColW + procGap);
      doc.setFillColor(...LIGHT_BLUE_BG);
      doc.setDrawColor(...BORDER_BLUE);
      doc.setLineWidth(0.35);
      doc.roundedRect(boxX, y - 1, procColW, pair.boxH, 2, 2, 'FD');

      doc.setFont(fontFamily, 'bold');
      doc.setFontSize(8.8);
      doc.setTextColor(...ROYAL_BLUE);
      doc.text(card.step, boxX + 3.5, y + 4.3);

      doc.setFont(fontFamily, 'normal');
      doc.setFontSize(8.1);
      doc.setTextColor(...SLATE_TEXT);
      doc.text(card.lines, boxX + 3.5, y + 8.7, { lineHeightFactor: 1.3 });
    });
    y += pair.boxH + (idx < procPairs.length - 1 ? 3 : 0);
  });

  // ==================== PAGE 2 ====================
  startNewPage();

  // ==================== 05. FIRST 30 DAYS ====================
  const weeks = [
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

  const weekDetailX = MARGIN_X + 66;
  const weekDetailW = CONTENT_W - 70;
  const weekLineH = 4.0;
  const preparedWeeks = weeks.map((w) => {
    const lines = wrapText(w.detail, weekDetailW, 8.6, 'normal');
    const rowH = Math.max(9.5, lines.length * weekLineH + 5);
    return { ...w, lines, rowH };
  });
  const weeksBoxH = preparedWeeks.reduce((s, w) => s + w.rowH, 0);

  ensureSpace(HEADING_TO_BODY + weeksBoxH);
  drawSectionHeading('05', 'First 30 Days');

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...BORDER_BLUE);
  doc.setLineWidth(0.4);
  doc.roundedRect(MARGIN_X, y - 1, CONTENT_W, weeksBoxH, 2.2, 2.2, 'FD');

  let weekY = y - 1;
  preparedWeeks.forEach((w, idx) => {
    if (idx > 0) {
      doc.setDrawColor(...SOFT_BORDER);
      doc.setLineWidth(0.25);
      doc.line(MARGIN_X, weekY, PAGE_W - MARGIN_X, weekY);
    }
    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(8.8);
    doc.setTextColor(...ROYAL_BLUE);
    doc.text(w.week, MARGIN_X + 4, weekY + 5.8);

    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(8.8);
    doc.setTextColor(...NAVY);
    doc.text(w.title, MARGIN_X + 20, weekY + 5.8);

    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(8.6);
    doc.setTextColor(...SLATE_TEXT);
    doc.text(w.lines, weekDetailX, weekY + 5.8, { lineHeightFactor: 1.3 });

    weekY += w.rowH;
  });

  y = weekY + SECTION_GAP;

  // ==================== 06. INVESTMENT SUMMARY ====================
  const invRows: Array<{ label: string; value: string; accent?: 'discount' | 'subtotal' }> = [
    {
      label: `Monthly Retainer (${packageName} Package)`,
      value: formatPdfINR(totals.monthlyFee, unicodeSupported),
    },
  ];
  if (totals.setupFee > 0) {
    invRows.push({
      label: 'One-time Setup / Onboarding Fee',
      value: formatPdfINR(totals.setupFee, unicodeSupported),
    });
  }
  if (totals.discount > 0) {
    invRows.push({
      label: 'Discount',
      value: `-${formatPdfINR(totals.discount, unicodeSupported)}`,
      accent: 'discount',
    });
  }
  invRows.push({
    label: 'Subtotal',
    value: formatPdfINR(totals.subtotal, unicodeSupported),
    accent: 'subtotal',
  });
  if (totals.gstEnabled) {
    invRows.push({
      label: `GST (${totals.gstPercent}%)`,
      value: formatPdfINR(totals.gstAmount, unicodeSupported),
    });
  }

  const headerRowH = 8.5;
  const bodyRowH = 8.2;
  const totalRowH = 10.5;
  const invTableH = headerRowH + invRows.length * bodyRowH + totalRowH;
  const hasOngoingNote = (totals.setupFee > 0 || totals.discount > 0) && totals.monthlyFee > 0;
  const invSectionH = HEADING_TO_BODY + invTableH + (hasOngoingNote ? 6 : 0);

  ensureSpace(invSectionH);
  drawSectionHeading('06', 'Investment Summary', `Proposed start: ${startDateStr}`);

  const tableTopY = y - 1;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...BORDER_BLUE);
  doc.setLineWidth(0.4);
  doc.roundedRect(MARGIN_X, tableTopY, CONTENT_W, invTableH, 2.2, 2.2, 'FD');

  doc.setFillColor(...TINT_BLUE_BG);
  doc.roundedRect(MARGIN_X, tableTopY, CONTENT_W, headerRowH, 2.2, 2.2, 'F');
  doc.rect(MARGIN_X, tableTopY + headerRowH - 2, CONTENT_W, 2, 'F');
  doc.setDrawColor(...BORDER_BLUE);
  doc.line(MARGIN_X, tableTopY + headerRowH, PAGE_W - MARGIN_X, tableTopY + headerRowH);

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(8.8);
  doc.setTextColor(...NAVY);
  doc.text('Item', MARGIN_X + 4.5, tableTopY + 5.7);
  doc.text('Amount', PAGE_W - MARGIN_X - 4.5, tableTopY + 5.7, { align: 'right' });

  let curRowY = tableTopY + headerRowH;
  invRows.forEach((row) => {
    if (row.accent === 'subtotal') {
      doc.setFillColor(...LIGHT_BLUE_BG);
      doc.rect(MARGIN_X + 0.3, curRowY, CONTENT_W - 0.6, bodyRowH, 'F');
    }
    doc.setDrawColor(...SOFT_BORDER);
    doc.setLineWidth(0.25);
    doc.line(MARGIN_X, curRowY, PAGE_W - MARGIN_X, curRowY);

    doc.setFont(fontFamily, row.accent === 'subtotal' ? 'bold' : 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...(row.accent === 'discount' ? EMERALD_TEXT : SLATE_TEXT));
    const labelLines = wrapText(
      row.label,
      CONTENT_W - 55,
      9,
      row.accent === 'subtotal' ? 'bold' : 'normal'
    );
    doc.text(labelLines[0] || row.label, MARGIN_X + 4.5, curRowY + 5.5);

    doc.setFont(fontFamily, 'bold');
    doc.setTextColor(...(row.accent === 'discount' ? EMERALD_TEXT : NAVY));
    doc.text(row.value, PAGE_W - MARGIN_X - 4.5, curRowY + 5.5, { align: 'right' });

    curRowY += bodyRowH;
  });

  doc.setFillColor(...NAVY);
  doc.roundedRect(MARGIN_X, curRowY, CONTENT_W, totalRowH, 2.2, 2.2, 'F');
  doc.rect(MARGIN_X, curRowY, CONTENT_W, 3, 'F');

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(9.8);
  doc.setTextColor(255, 255, 255);
  doc.text('Total Payable in First Month', MARGIN_X + 4.5, curRowY + 6.7);
  doc.setFontSize(10.5);
  doc.text(
    formatPdfINR(totals.firstMonthTotal, unicodeSupported),
    PAGE_W - MARGIN_X - 4.5,
    curRowY + 6.7,
    { align: 'right' }
  );

  y = tableTopY + invTableH;

  if (hasOngoingNote) {
    y += 5;
    const recurringNote = `Ongoing monthly retainer from Month 2 onwards: ${formatPdfINR(
      totals.recurringMonthlyTotal,
      unicodeSupported
    )} ${totals.gstEnabled ? `(incl. ${totals.gstPercent}% GST)` : '(excluding GST)'}.`;
    const noteLines = wrapText(recurringNote, CONTENT_W, 8.2, 'normal');
    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(8.2);
    doc.setTextColor(...MUTED_TEXT);
    doc.text(noteLines, MARGIN_X, y, { lineHeightFactor: 1.3 });
    y += noteLines.length * 3.8;
  }

  y += SECTION_GAP;

  // ==================== 07. TERMS AND PAYMENT ====================
  const termsPadX = 5;
  const termsPadY = 4.8;
  const termsInnerW = CONTENT_W - termsPadX * 2;
  const paymentLineH = 4.2;
  const termLineH = 4.05;

  const payWrapped = wrapText(`Payment Terms: ${paymentTerms}`, termsInnerW, 8.8, 'bold');
  const wrappedTerms = termsLines.map((line) => wrapText(line, termsInnerW - 5, 8.5, 'normal'));
  const notIncludedWrapped = wrapText(`Not Included: ${NOT_INCLUDED_TEXT}`, termsInnerW, 8.5, 'bold');

  const termsBodyH =
    payWrapped.length * paymentLineH +
    4.5 +
    wrappedTerms.reduce(
      (sum, lines, idx) => sum + lines.length * termLineH + (idx > 0 ? 2.1 : 0),
      0
    ) +
    5 +
    notIncludedWrapped.length * 4.1;
  const termsBoxH = termsPadY * 2 + termsBodyH;

  ensureSpace(HEADING_TO_BODY + termsBoxH);
  drawSectionHeading('07', 'Terms and Payment');

  doc.setFillColor(...LIGHT_BLUE_BG);
  doc.setDrawColor(...BORDER_BLUE);
  doc.setLineWidth(0.35);
  doc.roundedRect(MARGIN_X, y - 1, CONTENT_W, termsBoxH, 2.2, 2.2, 'FD');

  let ty = y - 1 + termsPadY + 2.8;
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(8.8);
  doc.setTextColor(...NAVY);
  doc.text(payWrapped, MARGIN_X + termsPadX, ty, { lineHeightFactor: 1.32 });
  ty += payWrapped.length * paymentLineH + 1.2;

  doc.setDrawColor(...BORDER_BLUE);
  doc.setLineWidth(0.25);
  doc.line(MARGIN_X + termsPadX, ty, PAGE_W - MARGIN_X - termsPadX, ty);
  ty += 3.8;

  wrappedTerms.forEach((lines, idx) => {
    if (idx > 0) ty += 2.1;
    doc.setFillColor(...ROYAL_BLUE);
    doc.circle(MARGIN_X + termsPadX + 1.5, ty - 1.1, 0.85, 'F');

    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...SLATE_TEXT);
    doc.text(lines, MARGIN_X + termsPadX + 5, ty, { lineHeightFactor: 1.3 });
    ty += lines.length * termLineH;
  });

  ty += 1.8;
  doc.setDrawColor(...BORDER_BLUE);
  doc.setLineWidth(0.25);
  doc.line(MARGIN_X + termsPadX, ty, PAGE_W - MARGIN_X - termsPadX, ty);
  ty += 4.2;

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...NAVY);
  doc.text(notIncludedWrapped, MARGIN_X + termsPadX, ty, { lineHeightFactor: 1.3 });

  y += termsBoxH - 1 + SECTION_GAP;

  // ==================== PAGE 3 ====================
  startNewPage();

  let page3SectionNum = 8;
  const nextSectionNum = () => {
    const str = String(page3SectionNum).padStart(2, '0');
    page3SectionNum += 1;
    return str;
  };

  // ==================== 08. WHAT WE NEED FROM YOU ====================
  const needItems = [
    'Admin or editor access to Instagram, Facebook, and Google Business Profile.',
    'High-resolution logo, brand colours/fonts, and existing menu or property photos.',
    'One point of contact for timely content calendar approvals and shoot scheduling.',
    'First month advance retainer to confirm the kick-off date.',
  ];
  const needPadX = 5;
  const needPadY = 4.5;
  const needTextW = CONTENT_W - needPadX * 2 - 8;
  const needLineH = 4.15;
  const wrappedNeeds = needItems.map((item) => wrapText(item, needTextW, 8.9, 'normal'));
  const needBoxH =
    needPadY * 2 +
    wrappedNeeds.reduce((sum, lines, idx) => sum + lines.length * needLineH + (idx > 0 ? 2.6 : 0), 0);

  ensureSpace(HEADING_TO_BODY + needBoxH);
  drawSectionHeading(nextSectionNum(), 'What We Need From You');

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...BORDER_BLUE);
  doc.setLineWidth(0.4);
  doc.roundedRect(MARGIN_X, y - 1, CONTENT_W, needBoxH, 2.2, 2.2, 'FD');

  let ny = y - 1 + needPadY + 2.9;
  wrappedNeeds.forEach((lines, idx) => {
    if (idx > 0) ny += 2.6;

    doc.setFillColor(...TINT_BLUE_BG);
    doc.setDrawColor(...BORDER_BLUE);
    doc.circle(MARGIN_X + needPadX + 2.2, ny - 1.1, 2.1, 'FD');
    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(7.4);
    doc.setTextColor(...ROYAL_BLUE);
    doc.text(tickChar, MARGIN_X + needPadX + 2.2, ny - 0.2, { align: 'center' });

    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(8.9);
    doc.setTextColor(...SLATE_TEXT);
    doc.text(lines, MARGIN_X + needPadX + 7.2, ny, { lineHeightFactor: 1.32 });
    ny += lines.length * needLineH;
  });

  y += needBoxH - 1 + SECTION_GAP;

  // ==================== OPTIONAL SAMPLE WORK ====================
  if (proposal.show_sample_work) {
    const sampleBody =
      (proposal.sample_work_note || '').trim() ||
      'Sample concept: A 3-part monthly reel and story format showcasing signature dishes or rooms, behind-the-scenes craft, and weekend dining or stay invitations.';
    const sampleInnerW = CONTENT_W - 10;
    const sampleLines = wrapText(sampleBody, sampleInnerW, 8.8, 'normal');
    const sampleBoxH = 8.5 + sampleLines.length * 4.1;

    ensureSpace(HEADING_TO_BODY + sampleBoxH);
    drawSectionHeading(nextSectionNum(), 'Sample Work', 'Sample concept');

    doc.setFillColor(...LIGHT_BLUE_BG);
    doc.setDrawColor(...BORDER_BLUE);
    doc.setLineWidth(0.35);
    doc.roundedRect(MARGIN_X, y - 1, CONTENT_W, sampleBoxH, 2.2, 2.2, 'FD');

    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(8.8);
    doc.setTextColor(...SLATE_TEXT);
    doc.text(sampleLines, MARGIN_X + 5, y + 4, { lineHeightFactor: 1.32 });

    y += sampleBoxH - 1 + SECTION_GAP;
  }

  // ==================== PAYMENT DETAILS (from Company Settings) ====================
  if (paymentEntries.length > 0) {
    const payColGap = 6;
    const payColW = (CONTENT_W - 10 - payColGap) / 2;
    const payRowPairs: Array<{
      left: { label: string; lines: string[] };
      right: { label: string; lines: string[] } | null;
      rowH: number;
    }> = [];

    for (let i = 0; i < paymentEntries.length; i += 2) {
      const l = paymentEntries[i];
      const r = i + 1 < paymentEntries.length ? paymentEntries[i + 1] : null;
      const lLines = wrapText(l.value, payColW, 8.8, 'bold');
      const rLines = r ? wrapText(r.value, payColW, 8.8, 'bold') : null;
      const maxL = Math.max(lLines.length, rLines ? rLines.length : 0);
      payRowPairs.push({
        left: { label: l.label, lines: lLines },
        right: r && rLines ? { label: r.label, lines: rLines } : null,
        rowH: 4.5 + maxL * 4.0 + 2,
      });
    }

    const payBoxH =
      8 + payRowPairs.reduce((s, r, idx) => s + r.rowH + (idx > 0 ? 1.5 : 0), 0);

    ensureSpace(HEADING_TO_BODY + payBoxH);
    drawSectionHeading(nextSectionNum(), 'Payment Details');

    doc.setFillColor(...LIGHT_BLUE_BG);
    doc.setDrawColor(...BORDER_BLUE);
    doc.setLineWidth(0.35);
    doc.roundedRect(MARGIN_X, y - 1, CONTENT_W, payBoxH, 2.2, 2.2, 'FD');

    let py = y - 1 + 5.5;
    payRowPairs.forEach((pair, idx) => {
      if (idx > 0) py += 1.5;

      const drawEntry = (entry: { label: string; lines: string[] }, ex: number) => {
        doc.setFont(fontFamily, 'bold');
        doc.setFontSize(7.2);
        doc.setTextColor(...ROYAL_BLUE);
        doc.text(entry.label.toUpperCase(), ex, py);

        doc.setFont(fontFamily, 'bold');
        doc.setFontSize(8.8);
        doc.setTextColor(...NAVY);
        doc.text(entry.lines, ex, py + 4.2, { lineHeightFactor: 1.28 });
      };

      drawEntry(pair.left, MARGIN_X + 5);
      if (pair.right) {
        drawEntry(pair.right, MARGIN_X + 5 + payColW + payColGap);
      }

      py += pair.rowH;
    });

    y += payBoxH - 1 + SECTION_GAP;
  }

  // ==================== NEXT STEPS ====================
  const nextInnerW = CONTENT_W - 12;
  const nextConfirmSentence = `Confirm this proposal before ${validUntilStr} to schedule onboarding for ${startDateStr}.`;
  const nextFollowupSentence = email
    ? 'Reply on WhatsApp, phone, or email to approve. Once confirmed, we will share the first month invoice and onboarding checklist immediately.'
    : 'Reply on WhatsApp or phone to approve. Once confirmed, we will share the first month invoice and onboarding checklist immediately.';

  const confirmLines = wrapText(nextConfirmSentence, nextInnerW, 9.2, 'bold');
  const followupLines = wrapText(nextFollowupSentence, nextInnerW, 8.6, 'normal');

  const contactParts = [
    settings.preparedByName,
    `Phone / WhatsApp: ${phone}`,
    ...(email ? [email] : []),
    ...(website ? [website] : []),
  ];
  const nextContactLines = wrapText(contactParts.join('  |  '), nextInnerW, 8.4, 'normal');

  const nextCardH =
    13 +
    confirmLines.length * 4.4 +
    2 +
    followupLines.length * 4.1 +
    17 + // summary strip
    5.5 +
    nextContactLines.length * 4.0 +
    4.5;

  ensureSpace(HEADING_TO_BODY + nextCardH);
  drawSectionHeading(nextSectionNum(), 'Next Steps');

  const cardTop = y - 1;
  doc.setFillColor(...NAVY);
  doc.roundedRect(MARGIN_X, cardTop, CONTENT_W, nextCardH, 2.5, 2.5, 'F');

  let cy = cardTop + 7.2;
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(255, 255, 255);
  doc.text('Ready to get started?', MARGIN_X + 6, cy);

  cy += 5.5;
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(9.2);
  doc.setTextColor(255, 255, 255);
  doc.text(confirmLines, MARGIN_X + 6, cy, { lineHeightFactor: 1.32 });
  cy += confirmLines.length * 4.4 + 1.8;

  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(8.6);
  doc.setTextColor(...BLUE_100);
  doc.text(followupLines, MARGIN_X + 6, cy, { lineHeightFactor: 1.32 });
  cy += followupLines.length * 4.1 + 3.2;

  const stripH = 13.5;
  const stripColW = nextInnerW / 3;
  doc.setFillColor(...NAVY_CARD);
  doc.setDrawColor(...NAVY_DIVIDER);
  doc.setLineWidth(0.3);
  doc.roundedRect(MARGIN_X + 6, cy, nextInnerW, stripH, 1.8, 1.8, 'FD');

  const stripItems = [
    { label: 'VALID UNTIL', val: validUntilStr },
    { label: 'PROPOSED START', val: startDateStr },
    { label: 'FIRST MONTH TOTAL', val: formatPdfINR(totals.firstMonthTotal, unicodeSupported) },
  ];
  stripItems.forEach((item, idx) => {
    const sx = MARGIN_X + 6 + idx * stripColW + 4;
    if (idx > 0) {
      doc.setDrawColor(...NAVY_DIVIDER);
      doc.line(
        MARGIN_X + 6 + idx * stripColW,
        cy + 2.2,
        MARGIN_X + 6 + idx * stripColW,
        cy + stripH - 2.2
      );
    }
    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(...BLUE_200);
    doc.text(item.label, sx, cy + 4.8);

    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(item.val, sx, cy + 10.2);
  });

  cy += stripH + 4.2;
  doc.setDrawColor(...NAVY_DIVIDER);
  doc.setLineWidth(0.3);
  doc.line(MARGIN_X + 6, cy, PAGE_W - MARGIN_X - 6, cy);
  cy += 5;

  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(8.4);
  doc.setTextColor(...BLUE_100);
  doc.text(nextContactLines, MARGIN_X + 6, cy, { lineHeightFactor: 1.32 });

  y = cardTop + nextCardH + SECTION_GAP;

  // ==================== ACCEPTANCE BLOCK ====================
  const acceptNote = `By signing below, ${businessName} confirms acceptance of proposal ${proposalNumber} and the terms outlined above.`;
  const acceptNoteLines = wrapText(acceptNote, CONTENT_W - 10, 8.6, 'normal');
  const acceptBoxH = 38 + acceptNoteLines.length * 4.0;

  ensureSpace(HEADING_TO_BODY + acceptBoxH);
  drawSectionHeading(nextSectionNum(), 'Acceptance');

  const accTop = y - 1;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...BORDER_BLUE);
  doc.setLineWidth(0.4);
  doc.roundedRect(MARGIN_X, accTop, CONTENT_W, acceptBoxH, 2.2, 2.2, 'FD');

  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(8.6);
  doc.setTextColor(...SLATE_TEXT);
  doc.text(acceptNoteLines, MARGIN_X + 5, accTop + 6.5, { lineHeightFactor: 1.32 });

  const sigRowY = accTop + 6.5 + acceptNoteLines.length * 4.0 + 11;
  const sigGap = 7;
  const sigLineW = (CONTENT_W - 10 - sigGap * 2) / 3;

  const sigFields = ['Accepted by', 'Date', 'Signature'];
  sigFields.forEach((fieldLabel, idx) => {
    const fx = MARGIN_X + 5 + idx * (sigLineW + sigGap);
    doc.setDrawColor(...MUTED_TEXT);
    doc.setLineWidth(0.35);
    doc.line(fx, sigRowY, fx + sigLineW, sigRowY);

    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...NAVY);
    doc.text(fieldLabel, fx, sigRowY + 4.8);
  });

  // ==================== FOOTER ON ALL PAGES ====================
  const totalPages = doc.getNumberOfPages();
  const footerLeftText = [
    settings.agencyName,
    proposalNumber,
    phone,
    ...(email ? [email] : []),
    ...(website ? [website] : []),
  ].join('  |  ');

  for (let page = 1; page <= totalPages; page++) {
    doc.setPage(page);
    doc.setDrawColor(...BORDER_BLUE);
    doc.setLineWidth(0.35);
    doc.line(MARGIN_X, FOOTER_LINE_Y, PAGE_W - MARGIN_X, FOOTER_LINE_Y);

    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED_TEXT);
    const footerLines = wrapText(footerLeftText, CONTENT_W - 28, 8, 'normal');
    doc.text(footerLines[0] || footerLeftText, MARGIN_X, FOOTER_TEXT_Y);

    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...NAVY);
    doc.text(`Page ${page} of ${totalPages}`, PAGE_W - MARGIN_X, FOOTER_TEXT_Y, {
      align: 'right',
    });
  }

  const filename = getProposalPdfFilename(businessName, proposalNumber);
  return { doc, filename };
}

export async function downloadProposalPdf(proposal: ProposalPdfInput): Promise<string> {
  const { doc, filename } = await buildProposalPdfDocument(proposal);
  doc.save(filename);
  return filename;
}
